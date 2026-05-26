import { InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { bedrockClient, videoCallConfig } from '../../config/awsConfig';
import { copilotoVozBedrockConfig } from '../../config/copilotoVozConfig';

export interface BedrockAgentInput {
  patientHistoryContext: string;
  transcriptionSegment: string;
  isPartial: boolean;
  currentSections?: Record<string, string>;
  activeSection?: string;
}

export interface BedrockAgentResponse {
  resumen?: string;
  propuestas?: Array<{ seccion: string; contenido: string }>;
}

/**
 * Invoca el agente Bedrock con el contexto y la transcripción.
 * Utiliza el prompt de asistente de documentación clínica.
 */
export async function invokeBedrockAgent(input: BedrockAgentInput): Promise<string> {
  const agentId = videoCallConfig.bedrockAgentId;
  const agentAliasId = videoCallConfig.bedrockAgentAliasId;

  console.log('[BedrockService] ▶ invokeBedrockAgent', {
    agentId,
    agentAliasId,
    transcriptLen: input.transcriptionSegment?.length || 0,
    transcriptPreview: input.transcriptionSegment?.slice(0, 100),
    activeSection: input.activeSection,
    hasCurrentSections: !!input.currentSections && Object.keys(input.currentSections).length > 0,
  });

  if (!agentId) {
    console.warn('[BedrockService] ⚠ Agente no configurado');
    return JSON.stringify({
      resumen: 'Agente Bedrock no configurado en variables de entorno.',
      propuestas: [],
    });
  }

  const prompt = buildBedrockPrompt(input);
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    });

    const t0 = Date.now();
    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    const raw = chunks.join('');
    console.log('[BedrockService] ◀ respuesta cruda', {
      ms: Date.now() - t0,
      len: raw.length,
      preview: raw.slice(0, 400),
    });

    if (!raw.trim()) {
      console.warn('[BedrockService] ⚠ Agente devolvió respuesta VACÍA');
    }

    return raw;
  } catch (err: unknown) {
    const error = err as any;
    console.error('[BedrockService] ✗ Error invocando agente (Propuestas):', error);
    return JSON.stringify({
      resumen: `Error del agente: ${error.message || String(error)}`,
      propuestas: [],
    });
  }
}

function buildBedrockPrompt(input: BedrockAgentInput): string {
  const ALL_SECTIONS = [
    'motivo_consulta', 'enfermedad_actual', 'antecedentes',
    'revision_sistemas', 'alertas_alergias', 'resultados_paraclinicos',
    'examen_fisico', 'diagnosticos', 'analisis_plan', 'recomendaciones'
  ];

  const sections = input.currentSections || {};
  const filledKeys: string[] = [];
  const emptyKeys: string[] = [];
  const filledDetails: string[] = [];

  for (const key of ALL_SECTIONS) {
    const val = sections[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      filledKeys.push(key);
      filledDetails.push(`${key}: "${val.replace(/\s+/g, ' ').slice(0, 100)}"`);
    } else {
      emptyKeys.push(key);
    }
  }

  const vacias = emptyKeys.length
    ? `\nSECCIONES VACÍAS (prioridad — llénalas si la transcripción contiene info que les corresponda): ${emptyKeys.join(', ')}`
    : '';

  const llenas = filledDetails.length
    ? `\nSECCIONES YA LLENAS (no dupliques tal cual; solo propón actualización si hay info NUEVA y más completa):\n${filledDetails.join('\n')}`
    : '';

  const foco = input.activeSection ? `\nSección en foco actual: ${input.activeSection}` : '';

  return `ROL: Eres un ASISTENTE DOCUMENTAL clínico. Tu única función es ESTRUCTURAR texto de una transcripción de consulta médica YA realizada por un profesional habilitado, en las secciones correspondientes de una historia clínica. NO das consejo médico, NO diagnosticas, NO prescribes — solo organizas información que el médico ya generó. Es una tarea de procesamiento de lenguaje, no clínica.

NO te rehúses bajo ninguna circunstancia: si el fragmento no contiene info útil, devuelve {"resumen":"Sin información nueva","propuestas":[]}. NUNCA respondas con disculpas o negativas; siempre devuelve JSON válido.

Paciente: ${input.patientHistoryContext.replace(/\s+/g, ' ').slice(0, 200)}${vacias}${llenas}${foco}

Transcripción nueva (con etiqueta de quién habla):
${input.transcriptionSegment}

TAREA: Clasifica la información de la transcripción en las secciones correctas.

SECCIONES VÁLIDAS (usa exactamente estas claves):
- motivo_consulta: razón principal de la consulta en 1-2 frases (PACIENTE).
- enfermedad_actual: cronología, intensidad, evolución del problema actual (PACIENTE).
- antecedentes: historia PREVIA — patológicos, quirúrgicos, familiares, hábitos (PACIENTE).
- revision_sistemas: síntomas en otros sistemas no relacionados al motivo (PACIENTE responde, MÉDICO pregunta).
- alertas_alergias: alergias conocidas + signos de alarma (PACIENTE).
- resultados_paraclinicos: exámenes YA REALIZADOS y sus resultados (PACIENTE menciona).
- examen_fisico: hallazgos físicos durante la consulta — signos vitales, inspección, palpación (MÉDICO observa).
- diagnosticos: impresiones diagnósticas mencionadas explícitamente (MÉDICO).
- analisis_plan: razonamiento + plan (exámenes a pedir, medicación, interconsultas) (MÉDICO).
- recomendaciones: instrucciones al paciente para casa (MÉDICO).

REGLAS DE QUIÉN APORTA QUÉ:
- Las PREGUNTAS del médico ("¿desde cuándo?", "¿le duele aquí?") NO se documentan — son guía.
- Las RESPUESTAS del paciente sí se documentan, en la sección que corresponda.

REGLAS GENERALES:
1. Si una SECCIÓN VACÍA tiene información que le corresponde, DEBES proponerla.
2. Para secciones llenas: solo propón si hay info NUEVA que las amplíe o corrija.
3. Cada idea va en UNA sola sección (la más específica).
4. NO inventes — solo extrae lo que está literalmente en la transcripción.
5. Devuelve SOLO JSON, sin markdown, sin texto extra.

Salida:
{"resumen":"frase corta","propuestas":[{"seccion":"motivo_consulta","contenido":"..."}]}

Si NO hay nada útil que extraer, devuelve: {"resumen":"Sin información nueva","propuestas":[]}`;
}

/**
 * Detecta si la respuesta es un "refusal" típico de Claude/Bedrock
 * (cuando el modelo se rehúsa a procesar por filtros de seguridad).
 */
function isClaudeRefusal(response: string): boolean {
  const lower = response.trim().toLowerCase();
  const patterns = [
    'i am unable to assist',
    "i'm unable to assist",
    'i cannot assist',
    "i can't assist",
    'i am not able to',
    'sorry, i am unable',
    'sorry, i cannot',
    'lo siento, no puedo',
    'no puedo ayudar',
    'no estoy capacitado',
  ];
  return patterns.some((p) => lower.includes(p)) && lower.length < 400;
}

export function parseBedrockResponse(response: string): BedrockAgentResponse {
  const result: BedrockAgentResponse = { propuestas: [] };

  // Detección temprana de refusals de Claude/Bedrock
  if (isClaudeRefusal(response)) {
    console.warn('[BedrockService] ⚠ Refusal detectado de Claude/Bedrock — devolviendo propuestas vacías. Raw:', response.slice(0, 150));
    result.resumen = '_(El asistente clínico no procesó este fragmento por filtros de seguridad. La transcripción se sigue guardando normalmente.)_';
    return result;
  }

  try {
    // Buscar el bloque JSON más grande
    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      let jsonStr = response.substring(firstBrace, lastBrace + 1);
      
      // Manejar casos donde la IA devuelve {{ ... }}
      while (jsonStr.startsWith('{{') && jsonStr.endsWith('}}')) {
        jsonStr = jsonStr.substring(1, jsonStr.length - 1);
      }
      
      // 1. Limpiar caracteres de control (escapar saltos de línea y tabs si no están ya escapados)
      // Pero conservar los ya escapados \\n
      jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
        if (c === '\n' || c === '\r') return ' '; // En lugar de \\n, usamos espacio para evitar ruidos de parsing
        if (c === '\t') return ' ';
        return '';
      });

      // 2. Eliminar comas finales (trailing commas) que rompen JSON.parse
      // e.g. [1, 2, ] -> [1, 2] o { "a": 1, } -> { "a": 1 }
      jsonStr = jsonStr.replace(/,[ \t]*([\]}])/g, '$1');

      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.resumen === 'string') result.resumen = parsed.resumen;
        if (Array.isArray(parsed.propuestas)) {
           result.propuestas = parsed.propuestas.filter((p: any) =>
             typeof p.seccion === 'string' && typeof p.contenido === 'string'
           );
        }
        console.log('[BedrockService] ✓ Parsed', {
          resumen: result.resumen?.slice(0, 100),
          propuestasCount: result.propuestas?.length || 0,
          secciones: (result.propuestas || []).map(p => p.seccion),
        });
      } catch (parseErr) {
        console.error('[BedrockService] ✗ JSON.parse falló tras limpieza. Contenido problemático:', jsonStr.substring(0, 300));
        throw parseErr;
      }
    } else {
      console.warn('[BedrockService] ⚠ No se encontraron llaves { } en la respuesta. Raw:', response.slice(0, 200));
    }
  } catch (err) {
    console.error('[BedrockService] ✗ Error procesando respuesta:', err);
  }
  return result;
}
/**
 * Invoca el agente Bedrock entrenado de Crisal-iA con un prompt de texto libre.
 * Reutiliza el mismo agentId/aliasId del copiloto de voz y la videollamada.
 */
export async function invokeAgent(prompt: string, sessionId?: string): Promise<string> {
  const agentId = copilotoVozBedrockConfig.agentId;
  const agentAliasId = copilotoVozBedrockConfig.agentAliasId;

  if (!agentId) {
    console.warn('[BedrockAgent] Agente Bedrock no configurado (COPILOTO_VOZ_BEDROCK_AGENT_ID)');
    return '';
  }

  const sid = sessionId ?? `aiservice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId: sid,
      inputText: prompt,
    });

    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    return chunks.join('').trim();
  } catch (err: unknown) {
    console.error('[BedrockAgent] Error invocando agente:', err);
    return '';
  }
}

/**
 * Igual que invokeAgent() pero parsea la respuesta como JSON.
 * Si el agente no retorna JSON válido, retorna el fallback indicado.
 */
export async function invokeAgentJson<T>(prompt: string, fallback: T, sessionId?: string): Promise<T> {
  const raw = await invokeAgent(prompt, sessionId);
  if (!raw) return fallback;
  try {
    // Extraer bloque JSON si el agente incluye texto antes o después
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    const firstBracket = raw.indexOf('[');
    const lastBracket = raw.lastIndexOf(']');

    // Determinar si la respuesta es un objeto o un array
    let jsonStr: string;
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      jsonStr = raw.substring(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1) {
      jsonStr = raw.substring(firstBrace, lastBrace + 1);
    } else {
      return fallback;
    }

    // Limpiar (reutiliza lógica de parseBedrockResponse)
    jsonStr = jsonStr.replace(/,[ \t]*([\]}])/g, '$1');
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) =>
      c === '\n' || c === '\r' || c === '\t' ? ' ' : ''
    );

    return JSON.parse(jsonStr) as T;
  } catch {
    console.warn('[BedrockAgent] Respuesta no es JSON válido:', raw.substring(0, 200));
    return fallback;
  }
}

export async function summarizeLastClinicalHistory(historyData: any): Promise<string> {
  const agentId = videoCallConfig.bedrockAgentId;
  const agentAliasId = videoCallConfig.bedrockAgentAliasId;

  console.log('[BedrockService] Resumiendo historia:', {
    hasAgentId: !!agentId,
    agentId,
    hasHistoryData: !!historyData,
    pacienteNombre: historyData?.pacienteNombre
  });

  if (!agentId || !historyData) {
    return 'No hay información suficiente para generar un resumen.';
  }

  const birthDate = historyData.fechaNacimiento ? new Date(historyData.fechaNacimiento) : null;
  const age = birthDate ? Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : 'N/A';

  const prompt = `
Actúa como un médico experto. Por favor, genera un resumen ejecutivo y profesional de la siguiente historia clínica previa para prepararme para una nueva consulta con este paciente.

Historia Clínica Previa:
- Paciente: ${historyData.pacienteNombre || 'N/A'} (Edad: ${age} años)
- Fecha: ${historyData.fechaRegistro || 'N/A'}
- Tipo de Actividad: ${historyData.tipoActividad || 'N/A'}
- Motivo: ${historyData.motivoConsulta || historyData.motivoAtencion || 'N/A'}
- Enfermedad Actual: ${historyData.enfermedadActual || 'N/A'}
- Antecedentes: ${JSON.stringify(historyData.antecedentes || [])}
- Familiares/Psicosociales: ${historyData.familiares || 'N/A'} / ${historyData.psicosociales || 'N/A'}
- Signos Vitales (últimos): ${JSON.stringify(historyData.signosVitales || {})}
- Examen Físico: ${JSON.stringify(historyData.examenMedico || {})}
- Resultados Paraclínicos: ${historyData.resultadosParaclinicos || 'N/A'}
- Alertas y Alergias: ${historyData.alertas || 'N/A'} / ${historyData.alergias || 'N/A'}
- Análisis y Plan: ${historyData.analisisyplan || 'N/A'}
- Diagnósticos: ${(historyData.diagnosticos || []).map((d: any) => d.descripcion).join(', ')}
- Recomendaciones: ${historyData.recomendaciones || 'N/A'}

Instrucciones del Resumen:
- Sé conciso pero completo.
- Estructura: "Paciente de [Edad] años. La última consulta fue por [Enfermedad/Motivo]. Se observó [Hallazgos clave]. Se diagnosticó [Diagnóstico] y se recomendó [Recomendaciones]."
- Usa un tono profesional y directo.
- Máximo 150 palabras.
- Idioma: Español.

Genera solo el texto del resumen, sin introducciones.
  `.trim();

  const sessionId = `summary-${Date.now()}`;

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    });

    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    return chunks.join('').trim();
  } catch (err) {
    console.error('[BedrockService] Error generando resumen (Resumen Histórico):', err);
    return 'Error al generar el resumen contextual del paciente.';
  }
}
