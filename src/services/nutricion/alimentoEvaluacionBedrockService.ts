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

const client = new BedrockRuntimeClient({
  region: REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined
});

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
  return `Eres "Cuidador IA" del módulo Crisal-IA de medicina funcional. Te van a mostrar la FOTO de un plato de comida de un paciente y datos básicos de su perfil. Devolvés la respuesta como una conversación corta de 4 a 6 párrafos separados por una línea en blanco (\\n\\n). Cada párrafo debe ser una idea autocontenida, 2 a 4 oraciones. NO uses listas con guiones ni numeración, ni markdown, ni encabezados, ni JSON: solo párrafos en texto plano separados por \\n\\n.

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

  return {
    mensajes: [inicial, ...parsed],
    modeloIA: MODEL_ID
  };
}
