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
import TranscriptionSession, { CLINICAL_SECTIONS, type ClinicalSectionType } from '../models/TranscriptionSession';
import TranscriptionSegment, { type SpeakerRoleType } from '../models/TranscriptionSegment';
import Cita from '../models/Cita';
import {
  startTranscribeStreaming,
  createTranscriptionAudioQueue,
  type TranscriptStreamEvent
} from '../services/transcription/streaming/transcribeStreamingService';
import { invokeBedrockAgent, parseBedrockResponse } from '../services/ai/bedrock.service';
import Paciente from '../models/Paciente';
import Interrogatorio from '../models/Interrogatorio';
import Material from '../models/Material';
import { cargarCatalogo, corregirTranscript } from '../services/transcription/correccionMedicamentos';

const CLINICAL_SECTIONS_LIST = [...CLINICAL_SECTIONS] as readonly string[];

function isClinicalSection(s: string): s is ClinicalSectionType {
  return CLINICAL_SECTIONS_LIST.includes(s);
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

function broadcastToCitaRoom(citaId: string, obj: object, excludeWs?: WebSocket): void {
  const set = roomsByCitaId.get(citaId);
  if (!set) return;
  const payload = JSON.stringify(obj);
  set.forEach((client) => {
    if (client === excludeWs) return; // no reenviar al emisor
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

/** Registra el handler de conexión (usar con `noServer` + enrutado único de `upgrade`). */
// Cargar catálogo de medicamentos al iniciar (una sola vez)
cargarCatalogo();

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

      // Handler de errores del socket: si no lo capturamos, los errores del WS
      // terminan el proceso silenciosamente sin logear nada útil.
      ws.on('error', (err) => {
        console.error('[TranscriptionWS] ws.on(error):', err);
      });
      ws.on('close', (code, reason) => {
        console.log('[TranscriptionWS] ws.on(close):', { code, reason: reason?.toString() });
      });
    } catch (err: any) {
      // Log explícito para diagnosticar mismatch de JWT_SECRET, expirado o malformado
      console.error('[TranscriptionWS] Token rechazado:', {
        name: err?.name,
        message: err?.message,
        tokenPrefix: token ? token.slice(0, 20) + '…' : '(vacío)'
      });
      sendJson(ws, { type: 'error', message: `Token inválido: ${err?.message ?? 'unknown'}` });
      ws.close(4001, 'Unauthorized');
      return;
    }

    let sessionId: mongoose.Types.ObjectId | null = null;
    let citaIdStr: string | null = null;
    let pacienteIdStr: string | null = null;
    let currentSection: ClinicalSectionType = 'orden_consulta_ia';
    let speakerRole: SpeakerRoleType = 'MEDICO';
    let sequence = 0;
    let audioQueue: ReturnType<typeof createTranscriptionAudioQueue> | null = null;
    let stopTranscribe: (() => void) | null = null;
    let started = false;

    ws.on('message', async (data: Buffer | string) => {
      try {
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
              const transcriptCorregido = corregirTranscript(ev.transcript);
              const payload = {
                type: 'transcript' as const,
                transcript: transcriptCorregido,
                isPartial: ev.isPartial,
                startTime: ev.startTime,
                endTime: ev.endTime,
                resultId: ev.resultId,
                speakerRole
              };
              // Enviar al emisor directamente + broadcast al resto de la sala
              sendJson(ws, payload);
              if (citaIdStr) broadcastToCitaRoom(citaIdStr, payload, ws);
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
                sendJson(ws, errPayload);
              }
              const endPayload = { type: 'stream_ended' as const };
              sendJson(ws, endPayload);
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
        const hasPreconsulta = (msg.transcription || '').includes('=== DATOS DE PRECONSULTA ===');
        console.log('[TranscriptionWS] ▶ process_with_agent recibido', {
          citaId: citaIdStr,
          transcriptionLen: msg.transcription?.length || 0,
          hasPreconsultaBlock: hasPreconsulta,
          preconsultaPreview: hasPreconsulta
            ? msg.transcription.slice(msg.transcription.indexOf('=== DATOS DE PRECONSULTA ==='), msg.transcription.indexOf('=== DATOS DE PRECONSULTA ===') + 300)
            : '(ninguno)',
          isPartial: msg.isPartial,
          activeSection: msg.activeSection,
          currentSectionsKeys: msg.currentSections ? Object.keys(msg.currentSections) : [],
        });

        // Skip si la transcripción es demasiado corta para tener contexto útil.
        // Chunks de <30 chars o <6 palabras suelen gatillar refusals de Claude por falta de contexto.
        const t = (msg.transcription || '').trim();
        const wordCount = t.split(/\s+/).filter(Boolean).length;
        if (t.length < 30 || wordCount < 6) {
          console.log('[TranscriptionWS] ⏭ process_with_agent saltado (fragmento muy corto):', { len: t.length, words: wordCount });
          return;
        }

        try {
          // Obtener contexto del paciente para Bedrock
          const pId = pacienteIdStr;
          const [paciente, interrogatorio] = await Promise.all([
            pId ? Paciente.findById(pId).lean() : null,
            pId ? Interrogatorio.findOne({ pacienteId: pId })
                    .sort({ updatedAt: -1 }).lean() : null,
          ]);
          console.log('[TranscriptionWS] interrogatorio lookup', {
            pId,
            found: !!interrogatorio,
            estado: (interrogatorio as any)?.estado,
            tieneHC: !!(interrogatorio as any)?.historiaClinica,
            tieneMotivo: !!(interrogatorio as any)?.historiaClinica?.motivoConsulta,
            tieneEA: !!(interrogatorio as any)?.historiaClinica?.enfermedadActual,
            tieneAnt: !!(interrogatorio as any)?.historiaClinica?.antecedentes,
            tieneAnalisis: Array.isArray((interrogatorio as any)?.analisisFisiologicoIA) && (interrogatorio as any).analisisFisiologicoIA.length > 0,
          });
          let patientContext = paciente ? [
            `Paciente: ${paciente.nombre} ${paciente.apellido}`,
            `Edad: ${paciente.fechaNacimiento ? Math.floor((new Date().getTime() - new Date(paciente.fechaNacimiento).getTime()) / 31557600000) : 'N/A'} años`,
            `Sexo: ${(paciente as any).sexoBiologico || 'N/A'}`,
            `EPS: ${(paciente as any).eps || 'N/A'}`,
          ].join('\n') : 'Información del paciente no disponible.';

          // Enriquecer con preconsulta desde Interrogatorio
          if (interrogatorio) {
            const parts: string[] = [];
            const hc = (interrogatorio as any).historiaClinica;
            if (hc) {
              // motivoConsulta ya estructurado
              const mc = hc.motivoConsulta;
              if (mc?.motivoPrincipal)  parts.push(`Motivo principal (preconsulta): ${mc.motivoPrincipal}`);
              if (mc?.tiempoEvolucion)  parts.push(`Tiempo de evolución (preconsulta): ${mc.tiempoEvolucion}`);
              if (mc?.sintomaConsulta)  parts.push(`Síntoma principal (preconsulta): ${mc.sintomaConsulta}`);
              // enfermedadActual ya estructurada
              const ea = hc.enfermedadActual;
              if (ea) {
                const eaLineas = Object.entries(ea)
                  .filter(([, v]) => v && String(v).trim())
                  .map(([k, v]) => `  ${k}: ${v}`);
                if (eaLineas.length) parts.push(`Enfermedad actual (preconsulta):\n${eaLineas.join('\n')}`);
              }
              // antecedentes ya estructurados
              const ant = hc.antecedentes;
              if (ant) {
                const antLineas = Object.entries(ant)
                  .filter(([, v]) => v && String(v).trim())
                  .map(([k, v]) => `  ${k}: ${v}`);
                if (antLineas.length) parts.push(`Antecedentes (preconsulta):\n${antLineas.join('\n')}`);
              }
            }
            // analisisIA (texto de síntesis clínica generado por OpenAI en preconsulta)
            const analisisTexto = (interrogatorio as any).analisisIA;
            if (analisisTexto && String(analisisTexto).trim()) {
              parts.push(`Análisis clínico IA (preconsulta):\n${String(analisisTexto).slice(0, 800)}`);
            }

            // analisisFisiologicoIA
            const analisis = (interrogatorio as any).analisisFisiologicoIA;
            if (Array.isArray(analisis) && analisis.length) {
              const resumen = analisis
                .filter((a: any) => a && (a.sistema || a.nombre || a.disfuncion))
                .map((a: any) => {
                  const nombre = a.sistema || a.nombre || a.disfuncion || '';
                  const nivel  = a.nivel ?? a.semaforo ?? '';
                  const hallazgos = Array.isArray(a.hallazgos) ? a.hallazgos.slice(0, 3).join('; ') : (a.descripcion || a.hallazgo || '');
                  return [nombre, nivel ? `(${nivel})` : '', hallazgos].filter(Boolean).join(' — ');
                })
                .join('\n- ');
              if (resumen) parts.push(`Análisis fisiológico IA (preconsulta):\n- ${resumen}`);
            }

            // Peso, talla e IMC desde respuestas (s01)
            const resp = (interrogatorio as any).respuestas ?? {};
            const pesoActual  = resp.s01_peso_actual;
            const tallaActual = resp.s01_talla;
            if (pesoActual || tallaActual) {
              const svPartes: string[] = [];
              if (pesoActual)  svPartes.push(`peso: ${pesoActual} kg`);
              if (tallaActual) svPartes.push(`talla: ${tallaActual} cm`);
              if (pesoActual && tallaActual) {
                const tallaMt = parseFloat(String(tallaActual)) > 10
                  ? parseFloat(String(tallaActual)) / 100
                  : parseFloat(String(tallaActual));
                const imc = (parseFloat(String(pesoActual)) / (tallaMt * tallaMt)).toFixed(1);
                if (!isNaN(Number(imc))) svPartes.push(`imc: ${imc}`);
              }
              if (resp.s01_grasa_corporal)        svPartes.push(`grasa_corporal: ${resp.s01_grasa_corporal}%`);
              if (resp.s01_masa_muscular)          svPartes.push(`masa_muscular: ${resp.s01_masa_muscular} kg`);
              if (resp.s01_perimetro_abdominal)    svPartes.push(`perimetro_abdominal: ${resp.s01_perimetro_abdominal} cm`);
              if (resp.s01_diagonosticado_peso)    svPartes.push(`diagnostico_peso: ${resp.s01_diagonosticado_peso}`);
              // Instrucción explícita para el AI
              parts.push(`DATOS PARA SECCIÓN examen_fisico (ponlos EXACTAMENTE en la sección examen_fisico con estas claves JSON):\n${svPartes.join('\n')}`);
            }

            // Datos perinatales y de infancia desde respuestas (s04)
            const perinatalesPartes: string[] = [];
            if (resp.s04_peso_nacer)           perinatalesPartes.push(`pesoNacer: ${resp.s04_peso_nacer}`);
            if (resp.s04_semanas_gestacion)     perinatalesPartes.push(`semanasGestacion: ${resp.s04_semanas_gestacion}`);
            if (resp.s04_tipo_parto)            perinatalesPartes.push(`tipoParto: ${resp.s04_tipo_parto}`);
            if (resp.s04_prematuro)             perinatalesPartes.push(`prematuro: ${resp.s04_prematuro}`);
            if (resp.s04_uci_neonatal)          perinatalesPartes.push(`uciNeonatal: ${resp.s04_uci_neonatal}`);
            if (resp.s04_complicaciones_parto)  perinatalesPartes.push(`complicacionesParto: ${resp.s04_complicaciones_parto}`);
            if (resp.s04_lactancia)             perinatalesPartes.push(`lactancia: ${resp.s04_lactancia}`);
            if (resp.s04_primera_infancia)      perinatalesPartes.push(`primeraInfancia: ${JSON.stringify(resp.s04_primera_infancia)}`);
            if (resp.s04_madre_antes_embarazo)  perinatalesPartes.push(`madreAntesEmbarazo: ${resp.s04_madre_antes_embarazo}`);
            if (resp.s04_madre_durante_embarazo)perinatalesPartes.push(`madreDuranteEmbarazo: ${resp.s04_madre_durante_embarazo}`);
            if (perinatalesPartes.length) parts.push(`Perinatales (preconsulta):\n${perinatalesPartes.join('\n')}`);

            // Enfermedades familiares (s04)
            if (resp.s04_enfermedades_familia) {
              const ef = Array.isArray(resp.s04_enfermedades_familia)
                ? resp.s04_enfermedades_familia.join(', ')
                : String(resp.s04_enfermedades_familia);
              if (ef) parts.push(`Enfermedades familiares (preconsulta): ${ef}`);
            }
            if (resp.s04_cancer_tipo) parts.push(`Cáncer familiar: ${resp.s04_cancer_tipo}`);

            // Historia médica personal (s05)
            const s05Partes: string[] = [];
            if (resp.s05_cirugias)           s05Partes.push(`cirugias: ${resp.s05_cirugias}`);
            if (resp.s05_hospitalizaciones)  s05Partes.push(`hospitalizaciones: ${resp.s05_hospitalizaciones}`);
            const s05Dx = ['s05_dx_metabolicas','s05_dx_cardiovascular','s05_dx_digestivas','s05_dx_neurologicas','s05_dx_inmunologicas','s05_dx_otras']
              .flatMap(k => Array.isArray(resp[k]) ? resp[k] : (resp[k] ? [resp[k]] : []));
            if (s05Dx.length) s05Partes.push(`diagnosticos: ${s05Dx.join(', ')}`);
            if (s05Partes.length) parts.push(`Historia médica personal (preconsulta):\n${s05Partes.join('\n')}`);

            // Medicamentos y suplementos actuales (s06)
            if (resp.s06_detalle_tabla && Array.isArray(resp.s06_detalle_tabla) && resp.s06_detalle_tabla.length) {
              const meds = resp.s06_detalle_tabla
                .map((m: any) => m?.nombre || m?.medicamento || JSON.stringify(m))
                .filter(Boolean).join(', ');
              if (meds) parts.push(`Medicamentos/suplementos actuales (preconsulta): ${meds}`);
            }

            if (parts.length > 0) {
              patientContext += `\n\nDATOS DE PRECONSULTA (recopilados antes de la consulta — úsalos para completar la historia clínica):\n${parts.join('\n\n')}`;
            }
          }

          console.log('[TranscriptionWS] patientContext preview', {
            totalLen: patientContext.length,
            tienePreconsulta: patientContext.includes('DATOS DE PRECONSULTA'),
            preview: patientContext.slice(0, 400),
          });

          const responseText = await invokeBedrockAgent({
            patientHistoryContext: patientContext,
            transcriptionSegment: msg.transcription,
            isPartial: msg.isPartial,
            currentSections: msg.currentSections,
            activeSection: msg.activeSection || currentSection
          });

          const parsed = parseBedrockResponse(responseText);

          console.log('[TranscriptionWS] ◀ broadcast proposal', {
            citaId: citaIdStr,
            propuestasCount: (parsed.propuestas || []).length,
            resumenLen: (parsed.resumen || '').length,
          });

          // Enriquecer medicamentos sugeridos con datos del catálogo de materials
          let medicamentosEnriquecidos: any[] = [];
          if (parsed.medicamentos && parsed.medicamentos.length > 0) {
            medicamentosEnriquecidos = await Promise.all(
              parsed.medicamentos.map(async (med) => {
                try {
                  const regex = new RegExp(med.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                  const material = await Material.findOne({ activo: true, $or: [{ nombre: regex }] }).lean();
                  if (material) {
                    return {
                      ...med,
                      materialId: String(material._id),
                      denominacionComun: material.nombre || med.nombre,
                      concentracion: material.concentracion || '',
                      unidadMedida: material.unidadMedida || '',
                      formaFarmaceutica: material.formaFarmaceutica || material.presentacion || '',
                      viaAdministracion: med.via || material.viaAdministracion || '',
                    };
                  }
                } catch {}
                return { ...med, denominacionComun: med.nombre, viaAdministracion: med.via || '' };
              })
            );
          }

          // Enriquecer suplementos igual que medicamentos
          let suplementosEnriquecidos: any[] = [];
          if (parsed.suplementos && parsed.suplementos.length > 0) {
            suplementosEnriquecidos = await Promise.all(
              parsed.suplementos.map(async (sup) => {
                try {
                  const regex = new RegExp(sup.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                  const material = await Material.findOne({ activo: true, $or: [{ nombre: regex }] }).lean();
                  if (material) {
                    return {
                      ...sup,
                      materialId: String(material._id),
                      denominacionComun: material.nombre || sup.nombre,
                      concentracion: material.concentracion || '',
                      unidadMedida: material.unidadMedida || '',
                      formaFarmaceutica: material.formaFarmaceutica || material.presentacion || '',
                      viaAdministracion: sup.via || material.viaAdministracion || '',
                    };
                  }
                } catch {}
                return { ...sup, denominacionComun: sup.nombre, viaAdministracion: sup.via || '' };
              })
            );
          }

          broadcastToCitaRoom(citaIdStr, {
            type: 'proposal',
            payload: {
              resumen: parsed.resumen || '',
              propuestas: parsed.propuestas || [],
              medicamentos: medicamentosEnriquecidos,
              suplementos: suplementosEnriquecidos,
            }
          });
        } catch (err) {
          console.error('[TranscriptionWS] ✗ Error procesando con agente:', err);
          sendJson(ws, { type: 'error', message: 'Error al procesar con el agente IA' });
        }
      }
      } catch (handlerErr: any) {
        // Wrapper de seguridad para que ningún error tumbe el socket sin log
        console.error('[TranscriptionWS] ✗ ws.on(message) crash:', {
          name: handlerErr?.name,
          message: handlerErr?.message,
          stack: handlerErr?.stack?.split('\n').slice(0, 5).join(' | ')
        });
        try { sendJson(ws, { type: 'error', message: `Error interno: ${handlerErr?.message ?? 'unknown'}` }); } catch {}
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
    path: '/api/transcription-ws',
    // perMessageDeflate: false → el proxy de Railway corrompe frames comprimidos
    // y el browser ve "Invalid frame header" con cierre 1006.
    perMessageDeflate: false
  });
  registerTranscriptionHandlers(wss);
}
