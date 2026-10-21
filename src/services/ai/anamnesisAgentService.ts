/**
 * anamnesisAgentService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente del Bedrock Agent orquestador de anamnesis.
 *
 * Este agente tiene acceso a 3 Knowledge Bases:
 *   - KB_CUESTIONARIO:      estructura de las 36 secciones del formulario
 *   - KB_FISIOPATOLOGICO:   mecanismos, diagnóstico funcional, abordaje terapéutico
 *   - KB_PRODUCTOS:         catálogo, dosis, contraindicaciones, compatibilidades
 *
 * Responsabilidad de este service:
 *   - Invocar al Agent con un prompt y devolver la respuesta cruda
 *   - Parsear el JSON estructurado que el Agent devuelve
 *   - Gestionar sessionId para mantener contexto entre rondas del mismo interrogatorio
 *
 * Credenciales: usa las mismas que el resto del backend (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
 *
 * Vars de entorno:
 *   ANAMNESIS_AGENT_ID       (default: HLL3N4JICQ)
 *   ANAMNESIS_AGENT_ALIAS_ID (default: ON5FNONHCI)
 *   ANAMNESIS_AGENT_REGION   (default: us-east-1)
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { AppError } from '../../utils/errors';

const AGENT_ID    = (process.env.ANAMNESIS_AGENT_ID       || 'HLL3N4JICQ').trim();
const AGENT_ALIAS = (process.env.ANAMNESIS_AGENT_ALIAS_ID || 'ON5FNONHCI').trim();
const REGION      = (process.env.ANAMNESIS_AGENT_REGION   || process.env.AWS_REGION || 'us-east-1').trim();

const client = new BedrockAgentRuntimeClient({
  region: REGION,
  // Un único presupuesto de reintentos cubre tanto send como el stream de completion.
  maxAttempts: 1,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

console.log('[AnamnesisAgent] init', { agentId: AGENT_ID, agentAlias: AGENT_ALIAS, region: REGION });

// ─── Tipos de respuesta del Agent ────────────────────────────────────────────

export interface AgentDecisionEntrevistar {
  accion: 'entrevistar';
  secciones: string[];
  razon: string;
  progreso: number;
  id_pregunta?: string[];            // IDs exactos de las preguntas a hacer (del JSON de secciones)
  preguntas_especificas?: string[];  // fallback: array de preguntas específicas (texto)
  pregunta_especifica?: string;      // fallback: string con preguntas específicas
  hallazgos_clave: string[];
  flags_a_vigilar: string[];
  banderas_rojas: string[];
}

export interface AgentDecisionGenerarS37 {
  accion: 'generar_s37';
  progreso: number;
  disfunciones_probables: Array<{
    id: number;
    nombre: string;
    etapa: 1 | 2;
    certeza: 'alta' | 'media' | 'baja';
    evidencia: string[];
    productos: string[];
  }>;
  disfunciones_a_descartar_con_paraclinicos: Array<{
    nombre: string;
    marcadores: string[];
    razon: string;
  }>;
  orden_abordaje: string[];
  banderas_rojas: string[];
  nota_medico: string;
}

export interface AgentDecisionAlertaMedica {
  accion: 'alerta_medica';
  progreso: number;
  motivo: string;
  seccion_item: string;
  valor_reportado: number;
  instruccion: string;
  mensaje_urgencias: string;
  banderas_rojas: string[];
}

export type AgentDecision =
  | AgentDecisionEntrevistar
  | AgentDecisionGenerarS37
  | AgentDecisionAlertaMedica;

// ─── Opciones de invocación ───────────────────────────────────────────────────

export interface AnamnesisAgentOptions {
  /** sessionId — mantiene contexto entre rondas del mismo interrogatorio */
  sessionId?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

// ─── Invocación raw ──────────────────────────────────────────────────────────

const MAX_INTENTOS = 3;
const NOMBRES_TRANSITORIOS = new Set([
  'InternalServerException', 'ServiceUnavailableException', 'BadGatewayException',
  'ThrottlingException', 'ModelNotReadyException',
]);

function esErrorTransitorio(error: any): boolean {
  return NOMBRES_TRANSITORIOS.has(error?.name)
    || [429, 500, 502, 503, 504].includes(error?.$metadata?.httpStatusCode);
}

function esperarReintento(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const terminar = () => { signal.removeEventListener('abort', cancelar); resolve(); };
    const timer = setTimeout(terminar, ms);
    const cancelar = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancelar);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancelar, { once: true });
    if (signal.aborted) cancelar();
  });
}

/** Reintenta fallos transitorios con la misma sesión y un plazo total de 180 s. */
async function invokeRaw(prompt: string, opts: AnamnesisAgentOptions = {}): Promise<string> {
  const sessionId = opts.sessionId || `anamnesis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = opts.timeoutMs ?? 180000;
  const t0 = Date.now();
  console.log('[AnamnesisAgent] ▶ invoke', { sessionId, promptLen: prompt.length, timeoutMs });

  const abort = new AbortController();
  let plazoAgotado = false;
  const timer = setTimeout(() => { plazoAgotado = true; abort.abort(); }, timeoutMs);
  const cancelar = () => abort.abort();
  if (opts.abortSignal?.aborted) cancelar();
  else opts.abortSignal?.addEventListener('abort', cancelar, { once: true });

  try {
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      abort.signal.throwIfAborted();
      const inicioIntento = Date.now();
      let requestId: string | undefined;
      try {
        const response = await client.send(new InvokeAgentCommand({
          agentId: AGENT_ID, agentAliasId: AGENT_ALIAS, sessionId, inputText: prompt,
        }), { abortSignal: abort.signal });
        requestId = response.$metadata?.requestId;
        abort.signal.throwIfAborted();
        // Nunca combinar texto de una respuesta interrumpida con la del siguiente intento.
        const chunks: string[] = [];
        const decoder = new TextDecoder();
        if (response.completion) {
          for await (const event of response.completion) {
            abort.signal.throwIfAborted();
            // Algunos transportes lanzan la excepción; otros la entregan como evento.
            const fallo = Object.entries(event).find(([key, value]) => key.endsWith('Exception') && value);
            if (fallo) {
              const [key, value] = fallo;
              throw Object.assign(new Error((value as any).message || key), value, {
                name: key[0].toUpperCase() + key.slice(1),
                $metadata: (value as any).$metadata || response.$metadata,
              });
            }
            if (event.chunk?.bytes) chunks.push(decoder.decode(event.chunk.bytes, { stream: true }));
          }
        }
        chunks.push(decoder.decode());
        abort.signal.throwIfAborted();
        const raw = chunks.join('');
        console.log('[AnamnesisAgent] ◀ respuesta', { sessionId, intento, ms: Date.now() - t0, len: raw.length });
        return raw;
      } catch (error: any) {
        abort.signal.throwIfAborted();
        console.warn('[AnamnesisAgent] intento fallido', {
          sessionId, intento, maxIntentos: MAX_INTENTOS,
          msIntento: Date.now() - inicioIntento, msTotal: Date.now() - t0,
          name: error?.name, message: String(error?.message || '').slice(0, 1000),
          reason: error?.reason, httpStatusCode: error?.$metadata?.httpStatusCode,
          requestId: error?.$metadata?.requestId || requestId,
        });
        if (!esErrorTransitorio(error)) throw error;
        if (intento === MAX_INTENTOS) {
          throw Object.assign(new AppError('El servicio de IA no está disponible temporalmente. Puedes reintentar el turno para continuar.', 503), {
            name: 'AnamnesisAgentUnavailableError', cause: error,
          });
        }
        const demoraMs = 1000 * 2 ** (intento - 1) + Math.floor(Math.random() * 250);
        console.warn('[AnamnesisAgent] reintento', {
          sessionId, intento, maxIntentos: MAX_INTENTOS, demoraMs, name: error?.name,
          requestId: error?.$metadata?.requestId,
        });
        await esperarReintento(demoraMs, abort.signal);
      }
    }
    throw new Error('No se recibió una respuesta del Agent');
  } catch (error: any) {
    console.error('[AnamnesisAgent] ✗ error', {
      name: error?.name, causeName: error?.cause?.name, reason: error?.cause?.reason,
      requestId: error?.cause?.$metadata?.requestId,
      ms: Date.now() - t0, timeoutMs, aborted: abort.signal.aborted, plazoAgotado,
    });
    if (plazoAgotado && !opts.abortSignal?.aborted) {
      throw new AppError('El servicio de IA tardó demasiado en responder. Puedes reintentar el turno para continuar.', 503);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    opts.abortSignal?.removeEventListener('abort', cancelar);
  }
}

// ─── Parseo del JSON estructurado ────────────────────────────────────────────

/**
 * Extrae el primer bloque JSON válido de la respuesta del Agent.
 * El Agent puede incluir texto antes o después del JSON — lo ignoramos.
 */
function extraerJSON(texto: string): string {
  // Buscar bloque ```json ... ``` primero
  const bloqueMarkdown = texto.match(/```json\s*([\s\S]*?)```/i);
  if (bloqueMarkdown) return bloqueMarkdown[1].trim();

  // Buscar el primer { hasta el último } equilibrado
  const inicio = texto.indexOf('{');
  if (inicio === -1) throw new Error('No se encontró JSON en la respuesta del Agent');

  let profundidad = 0;
  let fin = -1;
  let enTexto = false, escape = false;
  for (let i = inicio; i < texto.length; i++) {
    if (enTexto) {
      if (escape) escape = false;
      else if (texto[i] === '\\') escape = true;
      else if (texto[i] === '"') enTexto = false;
      continue;
    }
    if (texto[i] === '"') { enTexto = true; continue; }
    if (texto[i] === '{') profundidad++;
    else if (texto[i] === '}') {
      profundidad--;
      if (profundidad === 0) { fin = i; break; }
    }
  }

  if (fin === -1) throw new Error('JSON mal formado en la respuesta del Agent');
  return texto.slice(inicio, fin + 1);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Invoca al Agent y parsea la decisión JSON que devuelve.
 * Lanza error si la respuesta no es JSON válido o si la acción no es reconocida.
 */
export async function invokeAnamnesisAgent(
  prompt: string,
  opts: AnamnesisAgentOptions = {}
): Promise<AgentDecision> {
  const raw  = await invokeRaw(prompt, opts);
  const json = extraerJSON(raw);

  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Fallback: reemplazar saltos de línea literales dentro de strings
    // Solo dentro de comillas dobles, no en los delimitadores del JSON
    try {
      const jsonReparado = json.replace(
        /"((?:[^"\\]|\\.)*)"/g,
        (_, contenido) => `"${contenido.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ')}"`
      );
      parsed = JSON.parse(jsonReparado);
    } catch (e2) {
      console.error('[AnamnesisAgent] JSON inválido', { length: json.length });
      throw new Error(`El Agent devolvió JSON inválido: ${(e2 as Error).message}`);
    }
  }

  if (!parsed.accion || !['entrevistar', 'generar_s37', 'alerta_medica'].includes(parsed.accion)) {
    throw new Error(`Acción desconocida en respuesta del Agent: ${parsed.accion}`);
  }

  console.log('[AnamnesisAgent] parsed keys:', Object.keys(parsed));
  console.log('[AnamnesisAgent] id_pregunta raw:', parsed.id_pregunta);

  return parsed as AgentDecision;
}
