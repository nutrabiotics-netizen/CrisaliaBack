/**
 * WebSocket copiloto voz (ElevenLabs STT + TTS + Bedrock) — solo rol médico.
 * URL: /api/medico/copiloto-voz-ws?token=JWT
 * Contrato alineado con elevenlabs-front (eventos JSON + audio PCM binario).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { RealtimeEvents } from '@elevenlabs/elevenlabs-js';
import { verifyToken } from '../utils/jwt';
import { UserRole } from '../types';
import Medico from '../models/Medico';
import { getCopilotoVozElevenLabsVoiceId } from '../config/copilotoVozConfig';
import {
  connectElevenLabsRealtimeWithRetry,
  getElevenLabsClient,
  handleAgentQuery
} from '../services/medico/copiloto-voz/copilotoVozRealtimeEngine';
import { SerialQueue } from '../services/medico/copiloto-voz/queryQueue';

function sendJson(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function getTokenFromUrl(url: string): string | null {
  const i = url.indexOf('?');
  if (i === -1) return null;
  const params = new URLSearchParams(url.slice(i));
  return params.get('token');
}

function transcriptText(data: { text?: string }): string {
  return (data.text || '').trim();
}

// Palabras que el STT español produce frecuentemente como falsos positivos:
// fin de fonema del usuario, eco del TTS, ruido ambiente corto, respiraciones.
const TRANSCRIPTS_TRIVIALES = new Set([
  'si', 'sí', 'no', 'eh', 'mm', 'mmm', 'ah', 'ahh', 'um', 'umm',
  'uh', 'uhh', 'ok', 'oye', 'bueno', 'pues', 'vale', 'ya', 'aja',
  'ajá', 'claro', 'bien', 'hm', 'hmm', 'aló', 'alo', 'hola'
]);

function esTrivial(texto: string): boolean {
  const normalizado = texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?¿¡\-]/g, '')
    .trim();
  return normalizado.length < 3 || TRANSCRIPTS_TRIVIALES.has(normalizado);
}

export function registerMedicoCopilotoVozHandlers(wss: WebSocketServer): void {
  wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
    const url = req.url || '';
    const token = getTokenFromUrl(url);

    try {
      if (!token) {
        sendJson(clientWs, { type: 'error', error: 'Token no proporcionado' });
        clientWs.close(4001, 'Unauthorized');
        return;
      }
      const decoded = verifyToken(token);
      if (decoded.role !== UserRole.MEDICO) {
        sendJson(clientWs, { type: 'error', error: 'Solo médicos pueden usar este canal' });
        clientWs.close(4003, 'Forbidden');
        return;
      }

      const medico = await Medico.findById(decoded.userId).select('copilotoVoz').lean();
      if (!medico) {
        sendJson(clientWs, { type: 'error', error: 'Médico no encontrado' });
        clientWs.close(4004, 'Not found');
        return;
      }
      if (medico.copilotoVoz?.habilitado === false) {
        sendJson(clientWs, {
          type: 'connection_failed',
          error: 'El copiloto por voz está deshabilitado en su perfil.'
        });
        clientWs.close(1008, 'Disabled');
        return;
      }

      const voiceId = getCopilotoVozElevenLabsVoiceId();

      const elevenlabs = getElevenLabsClient();
      if (!elevenlabs) {
        sendJson(clientWs, {
          type: 'connection_failed',
          error: 'Servicio de voz no configurado (ELEVENLABS_API_KEY).'
        });
        setTimeout(() => clientWs.close(), 2000);
        return;
      }

      let isConnected = false;
      let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
      const lastAudioTime = { current: Date.now() };
      let bedrockSessionId: string | null = null;

      // Cola serial: garantiza que las respuestas de Bedrock se envíen en el mismo
      // orden en que llegaron los transcripts (evita respuestas cruzadas).
      const queryQueue = new SerialQueue();

      // Set de deduplicación: previene procesar el mismo texto 2 veces si ElevenLabs
      // dispara COMMITTED_TRANSCRIPT y COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS juntos.
      const processedTranscripts = new Set<string>();

      // Ref mutable de estado TTS compartido con el engine.
      // El engine lo actualiza al inicio/fin de TTS → el WS handler lo usa para
      // bloquear el reenvío de PCM (anti-echo, segunda capa).
      const ttsState = { active: false };

      sendJson(clientWs, {
        type: 'initializing',
        message: 'Conectando al servicio de voz...'
      });

      try {
        const elConn = await connectElevenLabsRealtimeWithRetry(elevenlabs, 5, 2000);
        isConnected = true;

        sendJson(clientWs, {
          type: 'ready',
          message: 'Servicio listo'
        });

        keepAliveInterval = setInterval(() => {
          if (!isConnected) return;
          const elapsed = Date.now() - lastAudioTime.current;
          if (elapsed > 2000) {
            try {
              const silenceBuffer = Buffer.alloc(1024, 0);
              elConn.send({
                audioBase64: silenceBuffer.toString('base64'),
                sampleRate: 16000
              });
            } catch (e) {
              console.error('[CopilotoVozWS] Keep-alive:', e);
            }
          }
        }, 2000);

        elConn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (transcript) => {
          sendJson(clientWs, {
            type: 'partial',
            data: { text: transcriptText(transcript) }
          });
        });

        const onCommitted = async (transcript: { text?: string }) => {
          const t = transcriptText(transcript);
          if (!t) return;

          // Ignorar transcripciones triviales (ecos del TTS, respiraciones, fonemas sueltos).
          if (esTrivial(t)) {
            console.log(`[CopilotoVozWS] Transcript trivial descartado: "${t}"`);
            return;
          }

          // Deduplicación: ignorar si el mismo texto ya se procesó en la ventana de 2 s.
          // Clave = primeros 60 caracteres + slot de 2 s → inmune a disparos dobles de ElevenLabs.
          const dedupKey = `${t.slice(0, 60)}_${Math.floor(Date.now() / 2000)}`;
          if (processedTranscripts.has(dedupKey)) return;
          processedTranscripts.add(dedupKey);
          setTimeout(() => processedTranscripts.delete(dedupKey), 3000);

          sendJson(clientWs, { type: 'final', data: transcript });

          // Serializar: encolar la consulta a Bedrock para respetar el orden de llegada.
          bedrockSessionId = await queryQueue.add(() =>
            handleAgentQuery(t, bedrockSessionId, clientWs, elevenlabs, voiceId, true, ttsState)
          );
        };

        // Suscribirse SOLO al evento con timestamps para evitar la doble ejecución
        // (ElevenLabs emite COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS y COMMITTED_TRANSCRIPT
        // simultáneamente cuando includeTimestamps=true).
        elConn.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, onCommitted);
        // NOTA: NO suscribir también a RealtimeEvents.COMMITTED_TRANSCRIPT aquí.

        elConn.on(RealtimeEvents.ERROR, (error) => {
          console.error('[CopilotoVozWS] ElevenLabs:', error);
          sendJson(clientWs, { type: 'error', error });
        });

        elConn.on(RealtimeEvents.CLOSE, () => {
          isConnected = false;
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
        });

        const handleControlJson = async (data: {
          event?: string;
          text?: string;
          enableTTS?: boolean;
        }): Promise<boolean> => {
          if (data.event === 'text_message') {
            const text = (data.text || '').trim();
            if (!text) return true;
            sendJson(clientWs, { type: 'text_received', text });
            // Encolar para que los mensajes de texto no se crucen con transcripts de voz.
            bedrockSessionId = await queryQueue.add(() =>
              handleAgentQuery(
                text,
                bedrockSessionId,
                clientWs,
                elevenlabs,
                voiceId,
                data.enableTTS === true,
                ttsState
              )
            );
            return true;
          }
          if (data.event === 'stop' && isConnected) {
            elConn.commit();
            return true;
          }
          if (data.event === 'stop_tts') {
            return true;
          }
          if (data.event === 'new_conversation') {
            bedrockSessionId = null;
            sendJson(clientWs, { type: 'conversation_reset' });
            return true;
          }
          return typeof data.event === 'string';
        };

        clientWs.on('message', async (message: Buffer | ArrayBuffer | Buffer[]) => {
          const buf = Array.isArray(message)
            ? Buffer.concat(message)
            : Buffer.isBuffer(message)
              ? message
              : Buffer.from(message);

          if (buf.length > 0 && buf[0] === 0x7b) {
            try {
              const data = JSON.parse(buf.toString('utf-8')) as {
                event?: string;
                text?: string;
                enableTTS?: boolean;
              };
              if (data && typeof data === 'object' && typeof data.event === 'string') {
                await handleControlJson(data);
              }
              return;
            } catch {
              // JSON inválido: continuar como PCM
            }
          }

          if (!isConnected) {
            return;
          }

          // GATE (backend): no reenviar PCM a ElevenLabs mientras el TTS esté activo.
          // Segunda capa anti-echo complementaria al gate del frontend.
          if (ttsState.active) {
            return;
          }

          lastAudioTime.current = Date.now();
          try {
            elConn.send({
              audioBase64: buf.toString('base64'),
              sampleRate: 16000
            });
          } catch (err) {
            console.error('[CopilotoVozWS] Error enviando audio:', err);
            isConnected = false;
          }
        });

        clientWs.on('close', () => {
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          if (isConnected) {
            try {
              elConn.close();
            } catch (e) {
              console.error('[CopilotoVozWS] Cierre ElevenLabs:', e);
            }
          }
          isConnected = false;
        });
      } catch (err) {
        console.error('[CopilotoVozWS] Fallo conexión ElevenLabs:', err);
        isConnected = false;
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        sendJson(clientWs, {
          type: 'connection_failed',
          error:
            'No se pudo conectar al servicio de transcripción. Compruebe ELEVENLABS_API_KEY y la red.'
        });
        setTimeout(() => {
          if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
        }, 2000);
      }
    } catch {
      sendJson(clientWs, { type: 'error', error: 'Token inválido' });
      clientWs.close(4001, 'Unauthorized');
    }
  });
}

/** No usar en el mismo `http.Server` que otro WSS con `{ server, path }`: destruye upgrades ajenos. */
export function attachMedicoCopilotoVozWebSocket(server: import('http').Server): void {
  const wss = new WebSocketServer({
    server,
    path: '/api/medico/copiloto-voz-ws'
  });
  registerMedicoCopilotoVozHandlers(wss);
}
