/**
 * Análisis real de imagen de comida usando Bedrock (Claude 3.5 Sonnet multimodal).
 *
 * Por qué no usamos el Bedrock Agent existente: `InvokeAgentCommand` solo acepta
 * `inputText` (string), no soporta imagen como input. Para multimodal hay que ir
 * directo al modelo via `BedrockRuntimeClient` + `ConverseCommand`.
 *
 * Si el modelo o las credenciales fallan, el caller cae al simulador y persiste
 * con `simulado: true` para que el paciente igual reciba algo y se note en logs.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ContentBlock
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand
} from '@aws-sdk/client-bedrock-agent-runtime';

export interface PerfilParaEvaluacionAlimento {
  nombre: string;
  apellido: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  fechaNacimiento?: string;
  sexoBiologico?: string;
  eps?: string;
  zonasDolor?: string[];
  edadAnios?: number;
  resumenIA?: string;
  formulaMedica?: {
    medicamentos?: string[];
    diagnostico?: string;
    indicaciones?: string;
  };
  historiaClinica?: {
    motivoConsulta?: string;
    diagnosticos?: any;
    planTratamiento?: string;
    antecedentes?: any;
  };
}

export interface AlimentoChatMensaje {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  creadoEn: string;
}

const REGION = (process.env.BEDROCK_VISION_REGION || process.env.AWS_REGION || 'us-east-1').trim();
// Claude 3.5 Sonnet v2 — multimodal, estable en us-east-1.
// Si querés probar un modelo más nuevo (3.7 Sonnet, 4.5 Sonnet, 4.6), seteá BEDROCK_VISION_MODEL_ID
// en .env. Los modelos 3.7+ requieren cross-region inference profile (prefijo "us.").
const MODEL_ID =
  (process.env.BEDROCK_VISION_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0').trim();

// Advertir solo si el ID parece claramente roto (modelo crudo de Anthropic 4.x sin prefijo)
const _looksLikeBareModel =
  /^anthropic\.claude-(opus|sonnet|haiku)-[0-9]/i.test(MODEL_ID) &&
  !/-\d{8}-/.test(MODEL_ID);
if (_looksLikeBareModel) {
  console.warn(
    `[BedrockVision] ⚠️ BEDROCK_VISION_MODEL_ID="${MODEL_ID}" parece un modelo Anthropic 4.x sin inference profile. ` +
    `Si te falla con ResourceNotFoundException usá un inference profile global ("global.anthropic.*") o regional ("us.anthropic.*").`
  );
}

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined;

const client = new BedrockRuntimeClient({ region: REGION, credentials });

const NUTRICION_AGENT_ID    = process.env.NUTRICION_AGENT_ID    || 'QITS4V0G2P';
const NUTRICION_AGENT_ALIAS = process.env.NUTRICION_AGENT_ALIAS || '4N8YPYYUPP';

const agentClient = new BedrockAgentRuntimeClient({ region: REGION, credentials });

async function invocarAgenteNutricion(
  descripcionPlato: string,
  perfil: PerfilParaEvaluacionAlimento
): Promise<string> {
  const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim();
  const edad = perfil.edadAnios ?? edadDesdeIso(perfil.fechaNacimiento);

  const lineas = [
    `Paciente: ${nombre || 'No especificado'}`,
    edad ? `Edad: ${edad} años` : '',
    perfil.sexoBiologico ? `Sexo: ${perfil.sexoBiologico}` : '',
    perfil.eps ? `EPS: ${perfil.eps}` : '',
    perfil.zonasDolor?.length ? `Zonas de dolor: ${perfil.zonasDolor.slice(0, 6).join(', ')}` : '',
  ];

  if (perfil.resumenIA) {
    lineas.push('', `Resumen clínico del paciente: ${perfil.resumenIA.slice(0, 500)}`);
  }

  if (perfil.historiaClinica) {
    const hc = perfil.historiaClinica;
    if (hc.motivoConsulta) lineas.push(`Motivo de consulta: ${hc.motivoConsulta}`);
    if (hc.planTratamiento) lineas.push(`Plan de tratamiento: ${String(hc.planTratamiento).slice(0, 300)}`);
    if (hc.diagnosticos) {
      const diags = Array.isArray(hc.diagnosticos)
        ? hc.diagnosticos.map((d: any) => d.nombre || d.descripcion || String(d)).join(', ')
        : String(hc.diagnosticos);
      if (diags) lineas.push(`Diagnósticos: ${diags.slice(0, 200)}`);
    }
  }

  if (perfil.formulaMedica) {
    const fm = perfil.formulaMedica;
    if (fm.diagnostico) lineas.push(`Diagnóstico fórmula: ${fm.diagnostico}`);
    if (fm.medicamentos?.length) lineas.push(`Medicamentos actuales: ${fm.medicamentos.join(', ')}`);
    if (fm.indicaciones) lineas.push(`Indicaciones médicas: ${String(fm.indicaciones).slice(0, 300)}`);
  }

  lineas.push(
    '',
    `Descripción del plato que el paciente acaba de fotografiar: ${descripcionPlato}`,
    '',
    `Pregunta: Teniendo en cuenta el perfil clínico del paciente (diagnósticos, medicamentos, antecedentes, plan de tratamiento), ¿puede este paciente comer este plato? ¿Hay algún alimento en el plato que deba evitar o limitar dado su condición? Proporciona una evaluación detallada.`
  );

  const inputText = lineas.filter(Boolean).join('\n');

  const sessionId = `alimento-${Date.now()}`;
  const command = new InvokeAgentCommand({
    agentId: NUTRICION_AGENT_ID,
    agentAliasId: NUTRICION_AGENT_ALIAS,
    sessionId,
    inputText
  });

  const response = await agentClient.send(command);
  let resultado = '';

  if (response.completion) {
    for await (const event of response.completion) {
      if (event.chunk?.bytes) {
        resultado += Buffer.from(event.chunk.bytes).toString('utf-8');
      }
    }
  }

  return resultado.trim();
}

function edadDesdeIso(iso?: string): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function ahora(): string {
  return new Date().toISOString();
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function inferFormat(mime: string): 'jpeg' | 'png' | 'webp' | 'gif' {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpeg';
}

function buildSystemPrompt(): string {
  return `Eres el asistente de nutrición de Crisalia, una plataforma de medicina funcional. Te van a mostrar la FOTO de un plato de comida de un paciente y datos básicos de su perfil. Devolvés la respuesta como una conversación corta de 4 a 6 párrafos separados por una línea en blanco (\\n\\n). Cada párrafo debe ser una idea autocontenida, 2 a 4 oraciones. NO uses listas con guiones ni numeración, ni markdown, ni encabezados, ni JSON: solo párrafos en texto plano separados por \\n\\n.

Cada párrafo aborda uno de estos puntos, en este orden:

Párrafo 1 — Descripción de lo que se ve en el plato (grupos alimentarios: proteína, carbohidrato, grasa, vegetales, frutas). Si no se distingue bien, decilo con honestidad.

Párrafo 2 — Estimación de porciones (porción visual tipo "del tamaño de la palma", "media taza"). NO inventes calorías exactas.

Párrafo 3 — Uno o dos puntos a favor del plato y una o dos áreas de mejora desde medicina funcional (anti-inflamación, microbiota, índice glucémico). Si el paciente tiene "zonasDolor" o EPS particular, contextualizá levemente sin diagnosticar.

Párrafo 4 — Una sugerencia concreta para la próxima comida (no para el plato actual).

Párrafo 5 — Nota de seguridad: esto NO es diagnóstico ni prescripción, validá cambios con tu médico/nutricionista.

REGLAS:
- Responde en ESPAÑOL, tono cálido pero profesional, sin exageraciones ni emojis.
- NO uses "deberías" como obligación. Usá "podrías considerar", "una opción sería".
- NO menciones marcas, suplementos ni fármacos.
- NO diagnostiques enfermedades a partir del plato.
- Si la imagen no parece ser comida, devolvé un solo párrafo pidiendo amablemente que suban una foto del plato.`;
}

function buildUserText(perfil: PerfilParaEvaluacionAlimento): string {
  const lineas: string[] = [];
  const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim();
  if (nombre) lineas.push(`Paciente: ${nombre}`);
  const edad = perfil.edadAnios ?? edadDesdeIso(perfil.fechaNacimiento);
  if (edad && edad > 0) lineas.push(`Edad: ${edad} años`);
  if (perfil.sexoBiologico) lineas.push(`Sexo biológico: ${perfil.sexoBiologico}`);
  if (perfil.eps) lineas.push(`EPS: ${perfil.eps}`);
  if (perfil.zonasDolor && perfil.zonasDolor.length > 0) {
    lineas.push(`Zonas de dolor registradas: ${perfil.zonasDolor.slice(0, 6).join(', ')}`);
  }
  lineas.push('');
  lineas.push('Analizá la imagen de mi plato siguiendo las reglas del sistema. Respondé solo el JSON.');
  return lineas.join('\n');
}

/**
 * Parser robusto: intenta JSON primero, después cae a "splitear por párrafos".
 * Funciona con cualquier estilo de respuesta que devuelva Claude.
 */
function parseRespuestaBedrock(raw: string): AlimentoChatMensaje[] | null {
  if (!raw || !raw.trim()) return null;

  // 1) ¿Es JSON con { "mensajes": [...] }?
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      const arr = Array.isArray(parsed?.mensajes) ? parsed.mensajes : null;
      if (arr && arr.length > 0) {
        return arr
          .map((m: any) => (typeof m === 'string' ? m : m?.texto ?? ''))
          .filter((t: string) => typeof t === 'string' && t.trim())
          .map((t: string, i: number) => ({
            id: `a${i + 1}`,
            rol: 'asistente' as const,
            texto: String(t).trim(),
            creadoEn: ahora()
          }));
      }
    } catch {
      // fall through al split por párrafos
    }
  }

  // 2) Fallback: splitear por dobles saltos de línea (párrafos).
  //    También removemos viñetas/numeraciones eventuales al inicio.
  const partes = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/^[\s>•·*\-—]+|^\d+[.)]\s*/, '').trim())
    .filter((p) => p.length > 0 && p.length < 1500); // descartar basura/líneas vacías

  if (partes.length === 0) return null;

  return partes.map((texto, i) => ({
    id: `a${i + 1}`,
    rol: 'asistente' as const,
    texto,
    creadoEn: ahora()
  }));
}

/**
 * Llama a Claude vía Bedrock con la imagen + perfil y devuelve los mensajes
 * conversacionales para el chat de evaluación.
 */
export async function analizarAlimentoConBedrock(
  imagenBuffer: Buffer,
  mimeType: string,
  perfil: PerfilParaEvaluacionAlimento
): Promise<{ mensajes: AlimentoChatMensaje[]; modeloIA: string }> {
  const userText = buildUserText(perfil);
  const imageBase64 = bytesToBase64(imagenBuffer);
  const formato = inferFormat(mimeType);

  const userBlocks: ContentBlock[] = [
    {
      image: {
        format: formato,
        source: { bytes: Buffer.from(imageBase64, 'base64') }
      }
    },
    { text: userText }
  ];

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: buildSystemPrompt() }],
    messages: [{ role: 'user', content: userBlocks }],
    inferenceConfig: { maxTokens: 800, temperature: 0.4 }
  });

  const resp = await client.send(command);
  const textBlock = resp.output?.message?.content?.find((c) => c.text);
  const raw = textBlock?.text ?? '';
  console.log('[BedrockVision] raw response (primeros 300 chars):', raw.slice(0, 300));
  const parsed = parseRespuestaBedrock(raw);
  console.log('[BedrockVision] mensajes parseados:', parsed?.length ?? 0);

  // Mensaje de "usuario" al inicio para que el chat tenga el turno del paciente
  const inicial: AlimentoChatMensaje = {
    id: 'u1',
    rol: 'usuario',
    texto: 'Acabo de subir una foto de mi plato para evaluación.',
    creadoEn: ahora()
  };

  if (!parsed || parsed.length === 0) {
    return {
      mensajes: [
        inicial,
        {
          id: 'a1',
          rol: 'asistente',
          texto:
            'No pude generar un análisis estructurado en este momento. Intenta de nuevo en unos minutos o sube otra foto con mejor iluminación.',
          creadoEn: ahora()
        }
      ],
      modeloIA: MODEL_ID
    };
  }

  console.log('[NutricionAgent] llegando a bloque de agente, parsed.length:', parsed?.length ?? 0);

  try {
    // 1. Invocar agente entrenado → respuesta técnica para doctores
    const descripcionPlato = parsed[0]?.texto ?? '';
    console.log('[NutricionAgent] ▶ Invocando agente', { agentId: NUTRICION_AGENT_ID, aliasId: NUTRICION_AGENT_ALIAS, descripcionLen: descripcionPlato.length });
    const respuestaAgente = await invocarAgenteNutricion(descripcionPlato, perfil);
    console.log('[NutricionAgent] ◀ Respuesta recibida', { len: respuestaAgente.length, preview: respuestaAgente.slice(0, 150) });

    if (respuestaAgente) {
      // 2. Simplificar la respuesta técnica a lenguaje para el paciente
      console.log('[NutricionAgent] ▶ Simplificando para paciente...');
      const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || 'el paciente';
      const simplifyCommand = new ConverseCommand({
        modelId: MODEL_ID,
        system: [{
          text: `Eres el asistente de nutrición de Crisalia. Tu tarea es transformar una recomendación nutricional técnica en un mensaje cálido, claro y fácil de entender para un paciente. Usa lenguaje sencillo, sin términos médicos complejos. Responde en párrafos cortos separados por doble salto de línea. Tono amigable y motivador. NO uses listas con guiones, NO uses markdown, NO repitas la información técnica literal — tradúcela a lo cotidiano. NO te presentes ni menciones tu nombre.`
        }],
        messages: [{
          role: 'user',
          content: [{ text: `Paciente: ${nombre}\n\nRecomendación técnica del especialista:\n${respuestaAgente}\n\nTransforma esto en un mensaje fácil de entender para el paciente.` }]
        }],
        inferenceConfig: { maxTokens: 1200, temperature: 0.5 }
      });

      const simplifyResp = await client.send(simplifyCommand);
      const simplifyRaw = simplifyResp.output?.message?.content?.find(c => c.text)?.text ?? '';
      console.log('[NutricionAgent] ◀ Simplificado', { len: simplifyRaw.length, preview: simplifyRaw.slice(0, 150) });

      const mensajesSimplificados = parseRespuestaBedrock(simplifyRaw);
      if (mensajesSimplificados && mensajesSimplificados.length > 0) {
        return {
          mensajes: [inicial, ...mensajesSimplificados.map((m, i) => ({ ...m, id: `ag${i + 1}` }))],
          modeloIA: MODEL_ID
        };
      }
    }
  } catch (e: any) {
    console.warn('[NutricionAgent] ✗ Agente/simplificación no disponible, usando respuesta de Claude:', e?.message ?? e);
  }

  // Fallback: si el agente o la simplificación fallan, usar la respuesta directa de Claude
  return {
    mensajes: [inicial, ...parsed],
    modeloIA: MODEL_ID
  };
}

// ─── Extracción estructurada de alimentos ────────────────────────────────────

export type NivelConfianza   = 'alta' | 'media' | 'baja';
export type PorcionEstimada  = 'Porción pequeña' | 'Porción media' | 'Porción alta';

export interface AlimentoDetectado {
  nombre:    string;
  categoria: 'Proteína' | 'Carbohidrato' | 'Vegetales' | 'Grasa saludable' | 'Fruta' | 'Lácteo' | 'Otro';
  porcion:   PorcionEstimada;
}

export interface ExtraerAlimentosResult {
  alimentos:  AlimentoDetectado[];
  confianza:  NivelConfianza;
  modeloIA:   string;
  simulado:   boolean;
}

function buildSystemPromptExtraer(): string {
  return `Eres un asistente de nutrición de Crisalia. Tu única tarea es identificar y listar los alimentos visibles en la imagen de un plato de comida. Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.

Formato exacto:
{"alimentos":[{"nombre":"Pollo asado","categoria":"Proteína","porcion":"Porción pequeña"}],"confianza":"media"}

Reglas:
- "nombre": nombre común en español, sin tecnicismos.
- "categoria": SOLO uno de: "Proteína", "Carbohidrato", "Vegetales", "Grasa saludable", "Fruta", "Lácteo", "Otro".
- "porcion": SOLO uno de: "Porción pequeña", "Porción media", "Porción alta". Estimado visual.
- "confianza": "alta" si imagen clara, "media" si hay dudas en algunos, "baja" si imagen confusa.
- Máximo 10 alimentos. Solo lo claramente visible.
- Si la imagen no es comida, devuelve {"alimentos":[],"confianza":"baja"}.`;
}

function parseExtraerRespuesta(raw: string): Omit<ExtraerAlimentosResult, 'modeloIA' | 'simulado'> | null {
  if (!raw?.trim()) return null;
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').trim();
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    if (!Array.isArray(parsed?.alimentos)) return null;

    const CATEGORIAS = new Set(['Proteína','Carbohidrato','Vegetales','Grasa saludable','Fruta','Lácteo','Otro']);
    const PORCIONES  = new Set(['Porción pequeña','Porción media','Porción alta']);
    const CONFIANZAS = new Set(['alta','media','baja']);

    const alimentos: AlimentoDetectado[] = parsed.alimentos
      .filter((a: any) => typeof a?.nombre === 'string' && a.nombre.trim())
      .slice(0, 10)
      .map((a: any): AlimentoDetectado => ({
        nombre:    a.nombre.trim(),
        categoria: CATEGORIAS.has(a.categoria) ? a.categoria : 'Otro',
        porcion:   PORCIONES.has(a.porcion)    ? a.porcion   : 'Porción media',
      }));

    const confianza: NivelConfianza = CONFIANZAS.has(parsed.confianza) ? parsed.confianza : 'media';
    return { alimentos, confianza };
  } catch {
    return null;
  }
}

/**
 * Extrae la lista estructurada de alimentos de una imagen de plato.
 * Reutiliza el mismo cliente Bedrock y credenciales de analizarAlimentoConBedrock.
 */
export async function extraerAlimentosConBedrock(
  imagenBuffer: Buffer,
  mimeType: string
): Promise<ExtraerAlimentosResult> {
  const formato     = inferFormat(mimeType);
  const imageBase64 = bytesToBase64(imagenBuffer);

  const userBlocks: ContentBlock[] = [
    {
      image: {
        format: formato,
        source: { bytes: Buffer.from(imageBase64, 'base64') }
      }
    },
    { text: 'Identifica todos los alimentos visibles en este plato y devuelve el JSON.' }
  ];

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: buildSystemPromptExtraer() }],
    messages: [{ role: 'user', content: userBlocks }],
    inferenceConfig: { maxTokens: 600, temperature: 0.2 }
  });

  try {
    const resp      = await client.send(command);
    const textBlock = resp.output?.message?.content?.find(c => c.text);
    const raw       = textBlock?.text ?? '';
    console.log('[ExtraerAlimentos] raw:', raw.slice(0, 400));

    const parsed = parseExtraerRespuesta(raw);
    if (!parsed || parsed.alimentos.length === 0) {
      console.warn('[ExtraerAlimentos] respuesta vacía, usando simulado');
      return { alimentos: [], confianza: 'baja', modeloIA: MODEL_ID, simulado: true };
    }

    return { ...parsed, modeloIA: MODEL_ID, simulado: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ExtraerAlimentos] Bedrock falló:', msg);
    return { alimentos: [], confianza: 'baja', modeloIA: 'simulado', simulado: true };
  }
}

// ─── Reporte clínico del plato ────────────────────────────────────────────────

export interface AjusteRecomendado {
  tipo:  'aumentar' | 'reducir' | 'mantener' | 'confirmar';
  texto: string;
}

export interface NutrienteRecomendado {
  titulo: string;
  desc:   string;
}

export interface AlertaEliminacion {
  texto: string;
}

export interface ReportePlatoResult {
  alineacion:          string;
  alineacionDetalle:   string;
  confianza:           NivelConfianza;
  etDescripcion:       string;
  etDietaEliminacion?: string;
  etAlimentacionTerapeutica?: string;
  alertasEliminacion:  AlertaEliminacion[];
  puntosPositivos:     string[];
  ajustes:             AjusteRecomendado[];
  nutrientes:          NutrienteRecomendado[];
  sugerenciaPractica:  string;
  preguntaET:          string;
  respuestaET:         string;
  simulado:            boolean;
}

function buildPromptReporte(
  descripcionPlato: string,
  perfil: PerfilParaEvaluacionAlimento,
  respuestaAgente: string
): string {
  return `Eres el asistente de nutrición de Crisalia. Debes generar un reporte estructurado en JSON basado en el análisis clínico del agente especialista.

Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional ni markdown.

Formato exacto:
{
  "alineacion": "Alineación parcial con tu ET",
  "alineacionDetalle": "Tiene buena fuente de proteína, pero podrías mejorar fibra y vegetales.",
  "etDescripcion": "Tu médico definió una estrategia enfocada en...",
  "etDietaEliminacion": "Revisar gluten, lácteos y azúcares refinados.",
  "etAlimentacionTerapeutica": "Priorizar magnesio, fibra y vegetales verdes.",
  "alertasEliminacion": [
    {"texto": "Salsa o preparación mixta: confirma si contiene gluten o espesantes."}
  ],
  "puntosPositivos": [
    "Aporta fuente de proteína",
    "Preparación aparentemente baja en fritura"
  ],
  "ajustes": [
    {"tipo": "aumentar", "texto": "Aumentar vegetales o fibra"},
    {"tipo": "mantener", "texto": "Mantener proteína"},
    {"tipo": "reducir",  "texto": "Reducir carbohidrato refinado"},
    {"tipo": "confirmar","texto": "Confirmar salsa o gluten"}
  ],
  "nutrientes": [
    {"titulo": "Más magnesio",     "desc": "Espinaca, semillas o almendras."},
    {"titulo": "Más fibra",        "desc": "Vegetales verdes o ensalada."},
    {"titulo": "Más color vegetal","desc": "Aumentar variedad de verduras."}
  ],
  "sugerenciaPractica": "Para una próxima comida similar...",
  "preguntaET": "¿Por qué revisar el gluten?",
  "respuestaET": "El gluten puede estar presente en..."
}

Reglas:
- "alineacion": una frase corta (ej. "Alta alineación con tu ET", "Alineación parcial con tu ET", "Requiere ajuste").
- "alineacionDetalle": 1-2 oraciones explicando el resultado.
- "etDescripcion": descripción breve de la estrategia terapéutica del paciente (inferida del perfil clínico).
- "etDietaEliminacion": null si no aplica.
- "etAlimentacionTerapeutica": null si no aplica.
- "alertasEliminacion": máx 4 alertas. Array vacío si no hay alertas.
- "puntosPositivos": máx 4 puntos. Array vacío si no hay.
- "ajustes": máx 4 ajustes. "tipo" debe ser exactamente uno de: "aumentar","reducir","mantener","confirmar".
- "nutrientes": máx 3. Array vacío si no aplica.
- "sugerenciaPractica": 2-3 oraciones concretas para la próxima comida.
- "preguntaET": una pregunta educativa relevante al perfil del paciente.
- "respuestaET": 2-3 oraciones respondiendo la pregunta.
- Responde en español, tono cálido y profesional.

Datos del paciente:
${[
  perfil.nombre ? `Nombre: ${perfil.nombre} ${perfil.apellido || ''}`.trim() : '',
  perfil.resumenIA ? `Resumen clínico: ${perfil.resumenIA.slice(0, 400)}` : '',
  perfil.historiaClinica?.planTratamiento ? `Plan de tratamiento: ${String(perfil.historiaClinica.planTratamiento).slice(0, 300)}` : '',
  perfil.formulaMedica?.indicaciones ? `Indicaciones médicas: ${String(perfil.formulaMedica.indicaciones).slice(0, 200)}` : '',
].filter(Boolean).join('\n')}

Descripción del plato: ${descripcionPlato}
${respuestaAgente ? `\nAnálisis adicional del especialista:\n${respuestaAgente}` : ''}`;
}

function parseReporteRespuesta(raw: string): Omit<ReportePlatoResult, 'simulado'> | null {
  if (!raw?.trim()) return null;

  // Quitar code fences de markdown (```json ... ```) que Claude a veces añade
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').trim();

  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) {
    console.error('[parseReporte] No se encontró JSON. Longitud:', stripped.length, '| Últimos 100:', stripped.slice(-100));
    return null;
  }

  try {
    const p = JSON.parse(stripped.slice(start, end + 1));
    const TIPOS_VALIDOS = new Set(['aumentar','reducir','mantener','confirmar']);

    return {
      alineacion:               typeof p.alineacion === 'string'         ? p.alineacion         : 'Análisis completado',
      alineacionDetalle:        typeof p.alineacionDetalle === 'string'   ? p.alineacionDetalle  : '',
      confianza:                'media',
      etDescripcion:            typeof p.etDescripcion === 'string'       ? p.etDescripcion      : '',
      etDietaEliminacion:       typeof p.etDietaEliminacion === 'string'  ? p.etDietaEliminacion : undefined,
      etAlimentacionTerapeutica:typeof p.etAlimentacionTerapeutica === 'string' ? p.etAlimentacionTerapeutica : undefined,
      alertasEliminacion:       Array.isArray(p.alertasEliminacion)
        ? p.alertasEliminacion.filter((a: any) => a?.texto).slice(0, 4)
        : [],
      puntosPositivos:          Array.isArray(p.puntosPositivos)
        ? p.puntosPositivos.filter((x: any) => typeof x === 'string').slice(0, 4)
        : [],
      ajustes:                  Array.isArray(p.ajustes)
        ? p.ajustes.filter((a: any) => TIPOS_VALIDOS.has(a?.tipo) && a?.texto).slice(0, 4)
        : [],
      nutrientes:               Array.isArray(p.nutrientes)
        ? p.nutrientes.filter((n: any) => n?.titulo && n?.desc).slice(0, 3)
        : [],
      sugerenciaPractica:       typeof p.sugerenciaPractica === 'string'  ? p.sugerenciaPractica : '',
      preguntaET:               typeof p.preguntaET === 'string'          ? p.preguntaET         : '',
      respuestaET:              typeof p.respuestaET === 'string'         ? p.respuestaET        : '',
    };
  } catch (e: unknown) {
    console.error('[parseReporte] JSON.parse falló:', (e as Error)?.message, '| raw slice:', raw.slice(start, end + 1).slice(-200));
    return null;
  }
}

/**
 * Genera el reporte clínico completo de un plato en una sola llamada ConverseCommand.
 * No pasa por el Bedrock Agent (que agrega ~20-40s de latencia) — Claude tiene
 * suficiente contexto con el perfil del paciente + lista de alimentos confirmados.
 */
export async function generarReportePlato(
  alimentos: AlimentoDetectado[],
  confianza: NivelConfianza,
  perfil:    PerfilParaEvaluacionAlimento
): Promise<ReportePlatoResult> {
  const descripcionPlato = alimentos.length > 0
    ? alimentos.map(a => `${a.nombre} (${a.categoria}, ${a.porcion})`).join(', ')
    : 'Plato sin alimentos identificados';

  console.log('[ReportePlato] descripción:', descripcionPlato);

  const promptFinal = buildPromptReporte(descripcionPlato, perfil, '');

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: promptFinal }] }],
      inferenceConfig: { maxTokens: 2000, temperature: 0.3 }
    });

    const resp   = await client.send(command);
    const raw    = resp.output?.message?.content?.find(c => c.text)?.text ?? '';
    console.log('[ReportePlato] raw completo:', raw);

    const parsed = parseReporteRespuesta(raw);
    console.log('[ReportePlato] parsed:', parsed ? 'OK' : 'NULL');
    if (parsed) return { ...parsed, confianza, simulado: false };
  } catch (err: unknown) {
    const e = err as any;
    console.error('[ReportePlato] ConverseCommand falló:', e?.name, '|', e?.message, '|', e?.$metadata, '|', e?.stack?.slice(0, 300));
  }

  return {
    alineacion:         'Análisis no disponible',
    alineacionDetalle:  'No se pudo generar el análisis en este momento. Intenta de nuevo.',
    confianza,
    etDescripcion:      '',
    alertasEliminacion: [],
    puntosPositivos:    [],
    ajustes:            [],
    nutrientes:         [],
    sugerenciaPractica: '',
    preguntaET:         '',
    respuestaET:        '',
    simulado:           true,
  };
}
