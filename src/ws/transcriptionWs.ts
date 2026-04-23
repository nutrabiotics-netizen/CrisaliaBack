/**
 * WebSocket para transcripción en tiempo real.
 * - Autenticación por token en query: ?token=JWT
 * - Primer mensaje JSON: start { citaId, medicoId, pacienteId, currentClinicalSection?, speakerRole? }
 * - Mensajes binarios: chunks de audio PCM 16-bit 16kHz mono
 * - JSON: set_section, set_speaker, close
 * - Respuestas: transcript (parcial/final), error, session_started, session_closed
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyToken } from '../utils/jwt';
import { UserRole } from '../types';
import mongoose from 'mongoose';
import TranscriptionSession from '../models/TranscriptionSession';
import TranscriptionSegment from '../models/TranscriptionSegment';
import Cita from '../models/Cita';
import {
  startTranscribeStreaming,
  createTranscriptionAudioQueue,
  type TranscriptStreamEvent
} from '../services/transcription/streaming/transcribeStreamingService';
import { invokeBedrockAgent, parseBedrockResponse } from '../services/ai/bedrock.service';
import Paciente from '../models/Paciente';
import type { ClinicalSectionType } from '../models/TranscriptionSession';
import type { SpeakerRoleType } from '../models/TranscriptionSegment';

const CLINICAL_SECTIONS = [
  'motivo_consulta',
  'antecedentes',
  'evaluacion',
  'diagnostico',
  'plan_tratamiento',
  'motivo_atencion',
  'examen_fisico',
  'resultados_paraclinicos',
  'alertas_y_alergias',
  'analisis_y_plan',
  'diagnosticos',
  'recomendaciones'
] as const;

function isClinicalSection(s: string): s is ClinicalSectionType {
  return (CLINICAL_SECTIONS as readonly string[]).includes(s);
}

interface StartPayload {
  type: 'start';
  citaId: string;
  medicoId: string;
  pacienteId: string;
  currentClinicalSection?: ClinicalSectionType;
  speakerRole?: SpeakerRoleType;
}

interface SetSectionPayload {
  type: 'set_section';
  section: ClinicalSectionType;
}

interface SetSpeakerPayload {
  type: 'set_speaker';
  speakerRole: SpeakerRoleType;
}

interface ClosePayload {
  type: 'close';
}

interface ProcessWithAgentPayload {
  type: 'process_with_agent';
  transcription: string; // Puede ser el acumulado o el último segmento
  isPartial: boolean;
  currentSections?: Record<string, string>;
  activeSection?: ClinicalSectionType;
}

type ClientMessage = StartPayload | SetSectionPayload | SetSpeakerPayload | ClosePayload | ProcessWithAgentPayload;

function parseClientMessage(data: Buffer | string): ClientMessage | null {
  try {
    const str = typeof data === 'string' ? data : data.toString('utf8');
    return JSON.parse(str) as ClientMessage;
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, obj: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

/** Autentica el token en la URL (query string). */
function getTokenFromUrl(url: string): string | null {
  const i = url.indexOf('?');
  if (i === -1) return null;
  const params = new URLSearchParams(url.slice(i));
  return params.get('token');
}

/**
 * Verifica que el usuario tenga derecho a usar esta cita para transcripción
 * (médico de la cita o paciente de la cita).
 */
async function validateCitaAccess(
  userId: string,
  role: UserRole,
  citaId: string,
  medicoId: string,
  pacienteId: string
): Promise<boolean> {
  const cita = await Cita.findById(citaId).lean();
  if (!cita) return false;
  const med = (cita as any).medicoId?.toString();
  const pac = (cita as any).pacienteId?.toString();
  if (role === UserRole.MEDICO && med === userId && med === medicoId) return true;
  if (role === UserRole.PACIENTE && pac === userId && pac === pacienteId) return true;
  return false;
}

export interface TranscriptionWsContext {
  userId: string;
  userRole: UserRole;
}

/** Salas por citaId: cada participante (médico/paciente) se une y recibe las transcripciones de todos. */
const roomsByCitaId = new Map<string, Set<WebSocket>>();

function broadcastToCitaRoom(citaId: string, obj: object): void {
  const set = roomsByCitaId.get(citaId);
  if (!set) return;
  const payload = JSON.stringify(obj);
  set.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

/** Registra el handler de conexión (usar con `noServer` + enrutado único de `upgrade`). */
export function registerTranscriptionHandlers(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url || '';
    const token = getTokenFromUrl(url);

    let ctx: TranscriptionWsContext | null = null;
    try {
      if (!token) {
        sendJson(ws, { type: 'error', message: 'Token no proporcionado' });
        ws.close(4001, 'Unauthorized');
        return;
      }
      const decoded = verifyToken(token);
      ctx = { userId: decoded.userId, userRole: decoded.role as UserRole };
      console.log('[TranscriptionWS] Cliente conectado', { userId: ctx.userId, role: ctx.userRole });
    } catch {
      sendJson(ws, { type: 'error', message: 'Token inválido' });
      ws.close(4001, 'Unauthorized');
      return;
    }

    let sessionId: mongoose.Types.ObjectId | null = null;
    let citaIdStr: string | null = null;
    let pacienteIdStr: string | null = null;
    let currentSection: ClinicalSectionType = 'motivo_consulta';
    let speakerRole: SpeakerRoleType = 'MEDICO';
    let sequence = 0;
    let audioQueue: ReturnType<typeof createTranscriptionAudioQueue> | null = null;
    let stopTranscribe: (() => void) | null = null;
    let started = false;

    ws.on('message', async (data: Buffer | string) => {
      // En Node, los mensajes JSON del cliente llegan como Buffer (UTF-8). Hay que parsear siempre como texto primero.
      const str = Buffer.isBuffer(data) ? data.toString('utf8') : data;

      try {
        const parsed = JSON.parse(str) as { type?: string; payload?: { data?: string } };
        if (parsed.type === 'audio_chunk' && typeof parsed.payload?.data === 'string' && audioQueue && started) {
          const chunk = Buffer.from(parsed.payload.data, 'base64');
          if (chunk.length > 0) audioQueue.push(new Uint8Array(chunk));
          return;
        }
        // Si es otro mensaje JSON (start, set_section, etc.) lo tratamos más abajo con parseClientMessage
      } catch {
        // No es JSON: es audio binario (PCM)
        if (Buffer.isBuffer(data) && audioQueue && started) {
          audioQueue.push(new Uint8Array(data));
        }
        return;
      }

      const msg = parseClientMessage(str);
      if (!msg) return;

      if (msg.type === 'start') {
        if (started) {
          sendJson(ws, { type: 'error', message: 'Sesión ya iniciada' });
          return;
        }
        try {
          console.log('[TranscriptionWS] start recibido', { citaId: msg.citaId, medicoId: msg.medicoId, pacienteId: msg.pacienteId });
          const ok = await validateCitaAccess(
            ctx!.userId,
            ctx!.userRole,
            msg.citaId,
            msg.medicoId,
            msg.pacienteId
          );
          if (!ok) {
            console.warn('[TranscriptionWS] Acceso denegado a cita', { userId: ctx!.userId, role: ctx!.userRole, citaId: msg.citaId });
            sendJson(ws, { type: 'error', message: 'No tiene acceso a esta cita' });
            return;
          }
          console.log('[TranscriptionWS] Acceso a cita OK');

          const medicoId = new mongoose.Types.ObjectId(msg.medicoId);
          const pacienteId = new mongoose.Types.ObjectId(msg.pacienteId);
          const citaId = new mongoose.Types.ObjectId(msg.citaId);
          currentSection = isClinicalSection(msg.currentClinicalSection || '')
            ? msg.currentClinicalSection!
            : 'motivo_consulta';
          speakerRole = msg.speakerRole === 'PACIENTE' ? 'PACIENTE' : 'MEDICO';

          let session = await TranscriptionSession.findOne({
            citaId,
            status: 'active'
          });
          console.log('[TranscriptionWS] findOne session', session ? 'existe' : 'no existe');
          if (!session) {
            session = await TranscriptionSession.create({
              medicoId,
              pacienteId,
              citaId,
              status: 'active',
              currentClinicalSection: currentSection
            });
            console.log('[TranscriptionWS] Sesión creada en DB', session._id.toString());
          } else {
            await session.updateOne({ currentClinicalSection: currentSection });
          }
          sessionId = session._id;
          citaIdStr = msg.citaId;
          pacienteIdStr = msg.pacienteId;
          if (!roomsByCitaId.has(citaIdStr)) roomsByCitaId.set(citaIdStr, new Set());
          roomsByCitaId.get(citaIdStr)!.add(ws);

          audioQueue = createTranscriptionAudioQueue();

          started = true;
          console.log('[TranscriptionWS] Sesión iniciada', { sessionId: session._id.toString(), citaId: msg.citaId });
          sendJson(ws, {
            type: 'session_started',
            sessionId: session._id.toString(),
            currentClinicalSection: currentSection,
            speakerRole
          });
          stopTranscribe = startTranscribeStreaming(audioQueue, {
            onTranscript(ev: TranscriptStreamEvent) {
              const payload = {
                type: 'transcript' as const,
                transcript: ev.transcript,
                isPartial: ev.isPartial,
                startTime: ev.startTime,
                endTime: ev.endTime,
                resultId: ev.resultId,
                speakerRole
              };
              if (citaIdStr) broadcastToCitaRoom(citaIdStr, payload);
              else sendJson(ws, payload);
              if (!ev.isPartial && ev.transcript.trim()) {
                const sid = sessionId;
                if (sid) {
                  sequence += 1;
                  TranscriptionSegment.create({
                    sessionId: sid,
                    text: ev.transcript.trim(),
                    speakerRole,
                    clinicalSection: currentSection,
                    sequence,
                    isPartial: false,
                    timestamp: new Date(),
                    startTimeMs: ev.startTime != null ? ev.startTime * 1000 : undefined,
                    endTimeMs: ev.endTime != null ? ev.endTime * 1000 : undefined
                  })
                    .then((doc) => console.log('[TranscriptionWS] Segmento guardado', { segmentId: doc._id, sequence, text: ev.transcript.trim().slice(0, 50) + '...' }))
                    .catch((err) => console.error('[TranscriptionWS] Error guardando segmento:', err));
                }
              }
            },
            onEnd(err) {
              if (err) {
                const errPayload = { type: 'error' as const, message: err.message };
                if (citaIdStr) broadcastToCitaRoom(citaIdStr, errPayload);
                else sendJson(ws, errPayload);
              }
              const endPayload = { type: 'stream_ended' as const };
              if (citaIdStr) broadcastToCitaRoom(citaIdStr, endPayload);
              else sendJson(ws, endPayload);
            }
          }).stop;
        } catch (err) {
          console.error('[TranscriptionWS] Error en start:', err);
          sendJson(ws, { type: 'error', message: err instanceof Error ? err.message : String(err) });
          return;
        }
        return;
      }

      if (msg.type === 'set_section' && isClinicalSection(msg.section)) {
        currentSection = msg.section;
        if (sessionId) {
          TranscriptionSession.findByIdAndUpdate(sessionId, { currentClinicalSection: currentSection }).catch(() => {});
        }
        sendJson(ws, { type: 'section_updated', section: currentSection });
        return;
      }

      if (msg.type === 'set_speaker') {
        speakerRole = msg.speakerRole === 'PACIENTE' ? 'PACIENTE' : 'MEDICO';
        sendJson(ws, { type: 'speaker_updated', speakerRole });
        return;
      }

      if (msg.type === 'close') {
        if (stopTranscribe) stopTranscribe();
        if (sessionId) {
          TranscriptionSession.findByIdAndUpdate(sessionId, {
            status: 'closed',
            endedAt: new Date()
          }).catch(() => {});
          sendJson(ws, { type: 'session_closed', sessionId: sessionId.toString() });
        }
        ws.close(1000, 'Normal closure');
      }

      if (msg.type === 'process_with_agent' && citaIdStr) {
        try {
          // Obtener contexto del paciente para Bedrock
          const pId = pacienteIdStr;
          const paciente = pId ? await Paciente.findById(pId).lean() : null;
          const patientContext = paciente ? `
            Paciente: ${paciente.nombre} ${paciente.apellido}
            Edad: ${paciente.fechaNacimiento ? Math.floor((new Date().getTime() - new Date(paciente.fechaNacimiento).getTime()) / 31557600000) : 'N/A'}
            Sexo: ${paciente.sexoBiologico || 'N/A'}
            EPS: ${paciente.eps || 'N/A'}
            Aseguradora: ${paciente.aseguradora || 'N/A'}
          `.trim() : 'Información del paciente no disponible.';

          const responseText = await invokeBedrockAgent({
            patientHistoryContext: patientContext,
            transcriptionSegment: msg.transcription,
            isPartial: msg.isPartial,
            currentSections: msg.currentSections,
            activeSection: msg.activeSection || currentSection
          });

          const parsed = parseBedrockResponse(responseText);
          
          broadcastToCitaRoom(citaIdStr, {
            type: 'proposal',
            payload: {
              resumen: parsed.resumen || '',
              propuestas: parsed.propuestas || []
            }
          });
        } catch (err) {
          console.error('[TranscriptionWS] Error procesando con agente:', err);
          sendJson(ws, { type: 'error', message: 'Error al procesar con el agente IA' });
        }
      }
    });

    ws.on('close', () => {
      if (citaIdStr) {
        const set = roomsByCitaId.get(citaIdStr);
        if (set) {
          set.delete(ws);
          if (set.size === 0) roomsByCitaId.delete(citaIdStr);
        }
      }
      if (stopTranscribe) stopTranscribe();
      if (sessionId) {
        TranscriptionSession.findByIdAndUpdate(sessionId, {
          status: 'closed',
          endedAt: new Date()
        }).catch(() => {});
      }
    });

    ws.on('error', () => {
      if (stopTranscribe) stopTranscribe();
    });
  });
}

/** Servidor dedicado solo transcripción (p. ej. Railway): un solo WSS, sin conflicto. */
export function attachTranscriptionWebSocket(server: import('http').Server): void {
  const wss = new WebSocketServer({
    server,
    path: '/api/transcription-ws'
  });
  registerTranscriptionHandlers(wss);
}
