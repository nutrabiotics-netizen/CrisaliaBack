/**
 * Cliente del Bedrock Agent oficial de Crisal·IA.
 *
 * Este agente se usa para:
 *   - Generar "Recomendaciones de Crisal-IA" al paciente entre citas
 *   - Generar "Resumen de la cita" para el paciente
 *   - Resumen actualizado del paciente (para el campo `resumenIA` del modelo)
 *
 * Credenciales por defecto (sobrescribibles vía env):
 *   CRISAL_AGENT_ID     (default: YY3KJX4H78)
 *   CRISAL_AGENT_ALIAS  (default: TBGVLCOKOG)
 *   CRISAL_AGENT_REGION (default: us-east-1, mismo que AWS_REGION)
 *
 * Usa BedrockAgentRuntime · InvokeAgentCommand · streaming chunks.
 */

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const AGENT_ID = (process.env.CRISAL_AGENT_ID || 'YY3KJX4H78').trim();
const AGENT_ALIAS = (process.env.CRISAL_AGENT_ALIAS || 'TBGVLCOKOG').trim();
const REGION = (process.env.CRISAL_AGENT_REGION || process.env.AWS_REGION || 'us-east-1').trim();

const client = new BedrockAgentRuntimeClient({
  region: REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined
});

console.log('[CrisaliaAgent] init', { agentId: AGENT_ID, agentAlias: AGENT_ALIAS, region: REGION });

/**
 * Limpia preámbulos de "razonamiento" que el agente a veces antepone en inglés
 * (ej. "I'll generate this patient summary directly, as this is a clear writing
 * task that doesn't require consulting any specialized agents.") y que NO deben
 * mostrarse al paciente. Conserva solo el contenido real en español.
 */
export function limpiarRespuestaAgente(texto: string): string {
  if (!texto) return '';
  let t = texto.trim();

  // Frases meta típicas del agente (inglés) que NO deben llegar al paciente.
  const marcasMeta = [
    /i['’]ll\s+(generate|create|write|provide|summarize)/i,
    /i\s+(will|can)\s+(generate|create|write|provide)/i,
    /as this is a clear (writing )?task/i,
    /(without|don['’]t need to|doesn['’]t require) consult/i,
    /specialized agents?/i,
    /let me (generate|create|write|provide)/i,
    /here['’]s the (summary|response|recommendation)/i,
    /based on the (information|provided)/i
  ];

  // 1) Quitar bloques/líneas iniciales que sean puro preámbulo.
  const bloques = t.split(/\n\s*\n/);
  if (bloques.length > 1 && marcasMeta.some((re) => re.test(bloques[0]))) {
    t = bloques.slice(1).join('\n\n').trim();
  } else {
    const lineas = t.split('\n');
    if (lineas.length > 1 && marcasMeta.some((re) => re.test(lineas[0]))) {
      t = lineas.slice(1).join('\n').trim();
    }
  }

  // 2) Preámbulo en el MISMO párrafo: cortar oraciones iniciales que contengan
  //    marcas meta (caso "...specialized agents. Durante su consulta...").
  //    Dividimos por fin de oración conservando el delimitador.
  const oraciones = t.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (oraciones && oraciones.length > 1) {
    let i = 0;
    while (i < oraciones.length - 1 && marcasMeta.some((re) => re.test(oraciones[i]))) {
      i++;
    }
    if (i > 0) {
      t = oraciones.slice(i).join('').trim();
    }
  }

  return t.trim();
}

export interface CrisaliaAgentOptions {
  /** sessionId — agrupa varias invocaciones bajo una conversación; si no se pasa, se genera uno */
  sessionId?: string;
  /** timeout en ms */
  timeoutMs?: number;
}

/**
 * Invoca al agente Crisal·IA con un prompt en texto plano.
 * Devuelve el texto completo concatenado de los chunks de respuesta del agente.
 * NO parsea — devuelve crudo. Si el caller necesita JSON, hace JSON.parse aparte.
 */
export async function invokeCrisaliaAgent(
  prompt: string,
  opts: CrisaliaAgentOptions = {}
): Promise<string> {
  const sessionId = opts.sessionId || `crisalia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const t0 = Date.now();

  console.log('[CrisaliaAgent] ▶ invoke', {
    sessionId,
    promptLen: prompt.length,
    promptPreview: prompt.slice(0, 120)
  });

  const timeoutMs = opts.timeoutMs ?? 45000;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS,
      sessionId,
      inputText: prompt
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
    const limpio = limpiarRespuestaAgente(raw);
    console.log('[CrisaliaAgent] ◀ respuesta', {
      sessionId,
      ms: Date.now() - t0,
      len: raw.length,
      lenLimpio: limpio.length,
      preview: limpio.slice(0, 200)
    });
    return limpio;
  } catch (err: any) {
    clearTimeout(timer);
    console.error('[CrisaliaAgent] ✗ error invocando agente:', {
      name: err?.name,
      message: err?.message,
      aborted: abort.signal.aborted,
      agentId: AGENT_ID,
      agentAlias: AGENT_ALIAS
    });
    throw err;
  }
}

/**
 * Helper: genera "Recomendaciones para el paciente entre citas" basado en una historia clínica.
 * Devuelve un texto narrativo de 2 oraciones tono cálido.
 */
export async function generarRecomendacionesPaciente(input: {
  pacienteNombre?: string;
  motivoConsulta?: string;
  diagnosticos?: string[];
  recomendacionesMedico?: string;
  fechaCita?: string;
}): Promise<string> {
  const prompt = `Tarea: generar recomendaciones de seguimiento personalizadas para el paciente entre cita y cita.

Información de la última cita (${input.fechaCita || 'reciente'}):
- Paciente: ${input.pacienteNombre || 'paciente'}
- Motivo: ${input.motivoConsulta || 'no especificado'}
- Diagnósticos: ${(input.diagnosticos || []).join('; ') || 'no especificados'}
- Recomendaciones del médico: ${input.recomendacionesMedico || 'no especificadas'}

Instrucciones de salida:
- Tono cálido y profesional, sin emojis, sin markdown, sin listas.
- UN solo párrafo de 2 oraciones máximo.
- NO menciones medicamentos ni dosis específicas.
- NO repitas literalmente las recomendaciones del médico — complementalas con seguimiento (cuándo cargar fotos, señales de alerta, hábitos a observar).
- IMPORTANTE: responde ÚNICAMENTE en español. NUNCA escribas texto en inglés ni comentarios meta sobre la tarea (ej. "I'll generate...", "as this is a writing task"). Empieza directo con el contenido.
- Devuelve SOLO el texto del párrafo, sin introducciones ni firmas.`;

  return invokeCrisaliaAgent(prompt);
}

/**
 * Helper: genera "Resumen de la cita" — texto narrativo para que el paciente entienda lo que pasó en la consulta.
 */
export async function generarResumenCita(input: {
  pacienteNombre?: string;
  fechaCita?: string;
  motivoConsulta?: string;
  enfermedadActual?: string;
  diagnosticos?: string[];
  recomendacionesMedico?: string;
  examenFisico?: string;
  analisisPlan?: string;
}): Promise<string> {
  const prompt = `Tarea: generar un resumen comprensible para el paciente sobre lo ocurrido en su cita médica.

Información clínica (${input.fechaCita || 'reciente'}):
- Paciente: ${input.pacienteNombre || 'el paciente'}
- Motivo: ${input.motivoConsulta || 'no especificado'}
- Enfermedad actual: ${input.enfermedadActual || 'no especificada'}
- Examen físico: ${input.examenFisico || 'no consignado'}
- Diagnósticos: ${(input.diagnosticos || []).join('; ') || 'no especificados'}
- Análisis y plan: ${input.analisisPlan || 'no especificado'}
- Recomendaciones: ${input.recomendacionesMedico || 'no especificadas'}

Instrucciones de salida:
- Lenguaje claro, sin jerga médica innecesaria (si la usás, explicala).
- Tono cálido, hablale al paciente directamente (segunda persona "vos/usted").
- 1 párrafo de 3-5 oraciones.
- Estructura: qué se encontró → qué significa → qué sigue.
- NO uses markdown, emojis, listas ni viñetas.
- Idioma: español neutro de Colombia. NUNCA escribas en inglés ni comentarios meta sobre la tarea (ej. "I'll generate..."). Empieza directo con el contenido.
- Devuelve SOLO el texto del párrafo.`;

  return invokeCrisaliaAgent(prompt);
}

/**
 * Helper: responde una pregunta del paciente sobre una cita específica.
 * Mantiene contexto de conversación vía `sessionId` (mismo id = misma charla).
 */
export async function responderPreguntaCita(input: {
  pregunta: string;
  sessionId?: string;
  contexto: {
    pacienteNombre?: string;
    fechaCita?: string;
    especialidad?: string;
    motivoConsulta?: string;
    diagnosticos?: string[];
    recomendacionesMedico?: string;
    medicamentos?: string[];
    resumenCita?: string;
  };
}): Promise<string> {
  const c = input.contexto;
  const prompt = `Sos "Crisal-IA", asistente de salud del paciente. Respondé su pregunta sobre la cita usando SOLO la información clínica de abajo. Si la respuesta no está en el contexto, decilo con amabilidad y sugerí consultarlo con su médico. No inventes diagnósticos, dosis ni medicamentos que no estén listados.

Contexto de la cita (${c.fechaCita || 'reciente'} · ${c.especialidad || 'consulta'}):
- Paciente: ${c.pacienteNombre || 'el paciente'}
- Motivo: ${c.motivoConsulta || 'no especificado'}
- Diagnósticos: ${(c.diagnosticos || []).join('; ') || 'no especificados'}
- Recomendaciones del médico: ${c.recomendacionesMedico || 'no especificadas'}
- Medicamentos indicados: ${(c.medicamentos || []).join('; ') || 'ninguno'}
- Resumen de la cita: ${c.resumenCita || 'no disponible'}

Pregunta del paciente: "${input.pregunta}"

Instrucciones de salida:
- Tono cálido y claro, hablale directamente al paciente.
- Sin markdown, sin emojis, sin listas con viñetas.
- Máximo 4 oraciones.
- Idioma: español neutro de Colombia. NUNCA escribas en inglés ni comentarios meta sobre la tarea. Empezá directo con la respuesta.
- Devolvé SOLO la respuesta.`;

  return invokeCrisaliaAgent(prompt, { sessionId: input.sessionId });
}

/**
 * Helper: genera el resumen integral del paciente basado en TODA su información clínica.
 * Pensado para alimentar el campo `Paciente.resumenIA` que un agente externo consume.
 */
export async function generarResumenIntegralPaciente(input: {
  paciente: { nombre?: string; apellido?: string; fechaNacimiento?: Date; sexoBiologico?: string };
  ultimasHistorias: Array<{
    fecha?: Date;
    motivoConsulta?: string;
    diagnosticos?: Array<{ descripcion?: string }>;
    recomendaciones?: string;
    analisisPlan?: string;
  }>;
  ultimasFormulas: Array<{
    fecha?: Date;
    medicamentos?: Array<{ nombre?: string; dosis?: string; frecuencia?: string }>;
  }>;
  ultimasCitas?: Array<{ fecha?: Date; estado?: string; motivo?: string }>;
}): Promise<string> {
  const birthDate = input.paciente.fechaNacimiento ? new Date(input.paciente.fechaNacimiento) : null;
  const edad = birthDate
    ? Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : 'N/A';

  const historiasResumen = (input.ultimasHistorias || [])
    .slice(0, 5)
    .map((h, i) => {
      const fecha = h.fecha ? new Date(h.fecha).toISOString().slice(0, 10) : 'sin fecha';
      const dxs = (h.diagnosticos || []).map((d) => d.descripcion).filter(Boolean).join(', ');
      return `[Historia ${i + 1} · ${fecha}]
  Motivo: ${h.motivoConsulta || '—'}
  Diagnósticos: ${dxs || '—'}
  Plan: ${(h.analisisPlan || '').slice(0, 200)}
  Recomendaciones: ${(h.recomendaciones || '').slice(0, 200)}`;
    })
    .join('\n');

  const formulasResumen = (input.ultimasFormulas || [])
    .slice(0, 5)
    .map((f, i) => {
      const fecha = f.fecha ? new Date(f.fecha).toISOString().slice(0, 10) : 'sin fecha';
      const meds = (f.medicamentos || [])
        .map((m) => `${m.nombre || '?'} ${m.dosis || ''} c/${m.frecuencia || '?'}`)
        .join('; ');
      return `[Fórmula ${i + 1} · ${fecha}] ${meds || '—'}`;
    })
    .join('\n');

  const citasResumen = (input.ultimasCitas || [])
    .slice(0, 5)
    .map((c) => `${c.fecha ? new Date(c.fecha).toISOString().slice(0, 10) : 'sin fecha'} (${c.estado || '?'}): ${c.motivo || '—'}`)
    .join(' · ');

  const prompt = `Tarea: generar un RESUMEN INTEGRAL del paciente, actualizado hasta el día de hoy, para que otro sistema (agente externo) lo lea y entienda en segundos el estado clínico completo.

Datos del paciente:
- Nombre: ${input.paciente.nombre || ''} ${input.paciente.apellido || ''}
- Edad: ${edad} años
- Sexo biológico: ${input.paciente.sexoBiologico || 'N/A'}

Últimas historias clínicas:
${historiasResumen || '(sin historias)'}

Últimas fórmulas médicas activas:
${formulasResumen || '(sin fórmulas)'}

Últimas citas:
${citasResumen || '(sin citas)'}

Instrucciones de salida:
- Tono profesional clínico, conciso.
- Estructura: diagnósticos activos → tratamiento actual → últimos hallazgos relevantes → plan en curso.
- Máximo 200 palabras.
- Sin markdown, sin listas con viñetas.
- Idioma: español neutro. NUNCA escribas en inglés ni comentarios meta sobre la tarea (ej. "I'll generate..."). Empieza directo con el contenido.
- Devuelve SOLO el texto del resumen.`;

  return invokeCrisaliaAgent(prompt);
}

/**
 * Genera el perfil de radar de disfunciones funcionales a partir de las
 * respuestas s01 y s03 del interrogatorio (primera fase).
 */
export async function generarPerfilRadar(params: {
  respuestasS01: Record<string, any>;
  respuestasS03: Record<string, any>;
  respuestasCompletas?: Record<string, any>;
  interrogatorioId: string;
  timeoutMs?: number;
}): Promise<{ textoAnalisis: string; perfilRadar: any | null }> {
  const { respuestasS01, respuestasS03, respuestasCompletas, interrogatorioId, timeoutMs } = params;

  const CAMPOS_EXCLUIDOS = new Set(['historialChat', 'mensajeFinal', 'causas', 'zonasDolor', 'estado_confirmado']);
  const ESCALA: Record<number, string> = { 0: 'nunca', 1: 'leve', 2: 'moderado', 3: 'intenso' };

  const serializarRespuestas = (r: Record<string, any>) =>
    Object.entries(r)
      .filter(([k, v]) => !CAMPOS_EXCLUIDOS.has(k) && v !== null && v !== undefined && v !== '')
      .map(([k, v]) => {
        const val = typeof v === 'number'
          ? `${v} (${ESCALA[v] ?? v})`
          : Array.isArray(v) ? v.join(', ')
          : String(v).slice(0, 150);
        return `${k}: ${val}`;
      })
      .join('\n');

  // Si hay respuestas completas (fase 2), incluir todas las secciones agrupadas
  let datosAdicionales = '';
  if (respuestasCompletas && Object.keys(respuestasCompletas).length > 0) {
    const seccionesDisponibles = new Set(
      Object.keys(respuestasCompletas)
        .map(k => k.match(/^(s\d{2})/)?.[1])
        .filter(Boolean)
    );
    // Excluir s01 y s03 ya incluidos arriba
    seccionesDisponibles.delete('s01');
    seccionesDisponibles.delete('s03');

    if (seccionesDisponibles.size > 0) {
      const camposFase2: Record<string, any> = {};
      Object.entries(respuestasCompletas).forEach(([k, v]) => {
        const seccion = k.match(/^(s\d{2})/)?.[1];
        if (seccion && seccionesDisponibles.has(seccion)) camposFase2[k] = v;
      });
      datosAdicionales = `\nRESPUESTAS DE INTERROGATORIO COMPLETO (secciones fisiológicas s04-s36):\n${serializarRespuestas(camposFase2) || '(no disponibles)'}`;
    }
  }

  const prompt = `Necesito el puntaje por eje de este caso:

DATOS GENERALES DEL PACIENTE (s01):
${serializarRespuestas(respuestasS01) || '(no disponibles)'}

MOTIVO DE CONSULTA Y SÍNTOMAS (s03):
${serializarRespuestas(respuestasS03) || '(no disponibles)'}${datosAdicionales}

Por cada eje devuelve: nombre, puntaje 0-10, clasificación cualitativa de severidad, 2-4 factores que sustentan la puntuación. Para cada eje: mayor foco actual, acciones que más ayudan, cómo puede cambiar.

Al final, el bloque JSON en este formato exacto:
===PERFIL_RADAR_JSON===
{"tipo":"perfil_disfunciones","ejes":[...],"series":[{"nombre":"Paciente","puntajes":[...]}]}
===FIN_PERFIL_RADAR_JSON===`;

  const raw = await invokeCrisaliaAgent(prompt, {
    sessionId: `radar-${interrogatorioId}`,
    timeoutMs: timeoutMs ?? 120000,
  });

  let perfilRadar: any = null;
  const radarMatch = raw.match(/===PERFIL_RADAR_JSON===\s*([\s\S]*?)\s*===FIN_PERFIL_RADAR_JSON===/);
  if (radarMatch) {
    try { perfilRadar = JSON.parse(radarMatch[1].trim()); } catch { /* ignorar */ }
  }

  const textoAnalisis = raw
    .replace(/===PERFIL_RADAR_JSON===[\s\S]*?===FIN_PERFIL_RADAR_JSON===/g, '')
    .trim();

  return { textoAnalisis, perfilRadar };
}
