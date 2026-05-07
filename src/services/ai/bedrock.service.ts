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

  if (!agentId) {
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

    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    return chunks.join('');
  } catch (err: unknown) {
    const error = err as any;
    console.error('[BedrockService] Error invocando agente (Propuestas):', error);
    return JSON.stringify({
      resumen: `Error del agente: ${error.message || String(error)}`,
      propuestas: [],
    });
  }
}

function buildBedrockPrompt(input: BedrockAgentInput): string {
  const activeSectionNote = input.activeSection
    ? `
IMPORTANTE - Sección activa: "${input.activeSection}".
- La consulta se desarrolla por secciones. El médico está actualmente en esta sección.
- Genera propuestas ÚNICAMENTE para la sección "${input.activeSection}".
- Si no hay información relevante para esta sección en la transcripción, deja el array de propuestas vacío.
`
    : '';

  return `Instrucciones de Rol:
Eres un Asistente de Documentación Clínica de alta precisión. Tu función principal es actuar como un observador pasivo pero analítico durante una teleconsulta, transformando el diálogo fluido entre médico y paciente en una estructura de historia clínica profesional y organizada.

Directrices de Comportamiento:
- Fidelidad Absoluta: No inventes, deduzcas ni supongas datos.
- Neutralidad: No emitas juicios de valor ni recomendaciones médicas propias.
- Privacidad: Trata toda la información con rigor.

Contexto del Paciente:
${input.patientHistoryContext}

Transcripción de la Consulta (${input.isPartial ? 'parcial' : 'segmento final'}):
${input.transcriptionSegment}

${input.currentSections ? `Estado actual de las secciones:\n${JSON.stringify(input.currentSections)}` : ''}
${activeSectionNote}

Instrucciones de Formato (JSON):
Debes entregar la información exclusivamente en un objeto JSON con las siguientes claves:
- "resumen": Un resumen ejecutivo de lo discutido recientemente.
- "propuestas": Un array de objetos { "seccion": "string", "contenido": "string" }.
  Secciones válidas (usa preferentemente esta nomenclatura y orden clínico):
  orden_consulta_ia, motivo_consulta, enfermedad_actual, antecedentes, revision_sistemas_alertas, resultados_laboratorio, examen_fisico_kinesiologia, analisis_plan_tratamiento, recomendaciones.
  Compatibilidad: motivo_atencion, examen_fisico, resultados_paraclinicos, alertas_y_alergias, analisis_y_plan, diagnosticos; informacion_general, tipo_actividad_acompanamiento.

No incluyas texto fuera del bloque JSON.`;
}

export function parseBedrockResponse(response: string): BedrockAgentResponse {
  const result: BedrockAgentResponse = { propuestas: [] };
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
      } catch (parseErr) {
        console.error('[BedrockService] JSON.parse falló tras limpieza. Contenido problemático:', jsonStr.substring(0, 150));
        throw parseErr;
      }
    }
  } catch (err) {
    console.error('[BedrockService] Error procesando respuesta:', err);
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
