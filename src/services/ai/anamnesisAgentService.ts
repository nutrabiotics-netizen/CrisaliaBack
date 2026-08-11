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

const AGENT_ID    = (process.env.ANAMNESIS_AGENT_ID       || 'HLL3N4JICQ').trim();
const AGENT_ALIAS = (process.env.ANAMNESIS_AGENT_ALIAS_ID || 'ON5FNONHCI').trim();
const REGION      = (process.env.ANAMNESIS_AGENT_REGION   || process.env.AWS_REGION || 'us-east-1').trim();

const client = new BedrockAgentRuntimeClient({
  region: REGION,
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
}

// ─── Invocación raw ──────────────────────────────────────────────────────────

/**
 * Invoca al Agent y devuelve el texto crudo concatenado de todos los chunks.
 */
async function invokeRaw(prompt: string, opts: AnamnesisAgentOptions = {}): Promise<string> {
  const sessionId = opts.sessionId || `anamnesis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = opts.timeoutMs ?? 100000;
  const t0        = Date.now();

  console.log('[AnamnesisAgent] ▶ invoke', {
    sessionId,
    promptLen: prompt.length,
    preview: prompt.slice(0, 120),
  });

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const command = new InvokeAgentCommand({
      agentId:      AGENT_ID,
      agentAliasId: AGENT_ALIAS,
      sessionId,
      inputText:    prompt,
    });

    const response = await client.send(command, { abortSignal: abort.signal });
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    clearTimeout(timer);
    const raw = chunks.join('');

    console.log('[AnamnesisAgent] ◀ respuesta', {
      sessionId,
      ms: Date.now() - t0,
      len: raw.length,
      preview: raw.slice(0, 200),
    });

    return raw;
  } catch (err: any) {
    clearTimeout(timer);
    console.error('[AnamnesisAgent] ✗ error', {
      name:    err?.name,
      message: err?.message,
      aborted: abort.signal.aborted,
    });
    throw err;
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
  for (let i = inicio; i < texto.length; i++) {
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
      console.error('[AnamnesisAgent] JSON inválido:', json.slice(0, 300));
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