import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';

const MIN_PDF_TEXT_CHARS = 80;
const STRUCTURE_MODEL = process.env.OPENAI_PARACLINICO_MODEL || 'gpt-4o-mini';

export type ParaclinicoOcrEstado = 'listo' | 'error' | 'omitido';
export type ParaclinicoOcrMetodo = 'pdf-texto' | 'vision';

export interface ParaclinicoOcrValor {
  nombre: string;
  valor?: string;
  unidad?: string;
  referencia?: string;
}

export interface ParaclinicoOcrOutcome {
  ocrEstado: ParaclinicoOcrEstado;
  ocrMetodo?: ParaclinicoOcrMetodo;
  ocrTextoPlano?: string;
  ocrValores?: ParaclinicoOcrValor[];
  ocrError?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function extractPdfPlainText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text || '').trim();
  } finally {
    await parser.destroy();
  }
}

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  return s.trim();
}

function parseValoresJson(text: string): ParaclinicoOcrValor[] {
  const cleaned = stripJsonFence(text);
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((v): v is Record<string, unknown> => v !== null && typeof v === 'object')
    .map((v) => ({
      nombre: String(v.nombre ?? '').trim() || 'Sin nombre',
      valor: v.valor != null ? String(v.valor) : undefined,
      unidad: v.unidad != null ? String(v.unidad) : undefined,
      referencia: v.referencia != null ? String(v.referencia) : undefined
    }))
    .filter((v) => v.nombre && v.nombre !== 'Sin nombre');
}

async function estructurarDesdeTexto(plainText: string): Promise<ParaclinicoOcrValor[]> {
  const completion = await openai.chat.completions.create({
    model: STRUCTURE_MODEL,
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: `Eres un asistente clínico. Extrae del texto de un resultado de laboratorio o paraclínico las mediciones tabulares.
Responde SOLO con un array JSON válido (sin markdown), por ejemplo:
[{"nombre":"Hemoglobina","valor":"14.2","unidad":"g/dL","referencia":"12-16"}]
Usa claves: nombre (obligatorio), valor, unidad, referencia (opcionales).
Si no hay valores estructurables, responde exactamente: []`
      },
      {
        role: 'user',
        content: plainText.slice(0, 24000)
      }
    ]
  });
  const raw = completion.choices[0]?.message?.content || '[]';
  return parseValoresJson(raw);
}

async function visionDesdeImagen(buffer: Buffer, mimeType: string): Promise<ParaclinicoOcrOutcome> {
  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${b64}`;

  const completion = await openai.chat.completions.create({
    model: STRUCTURE_MODEL,
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: `Lee la imagen de un resultado de laboratorio o informe paraclínico.
1) Transcribe el texto relevante en español (ocrTextoPlano mental).
2) Devuelve SOLO un array JSON válido (sin markdown) con objetos {"nombre","valor","unidad","referencia"} como en laboratorios.
Si no puedes leer valores, responde [].`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extrae los valores del documento en el formato JSON indicado.'
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl }
          }
        ]
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content || '[]';
  let valores: ParaclinicoOcrValor[] = [];
  try {
    valores = parseValoresJson(raw);
  } catch {
    valores = [];
  }

  const textoPlano =
    valores.length > 0
      ? valores.map((v) => [v.nombre, v.valor, v.unidad, v.referencia].filter(Boolean).join(' ')).join('\n')
      : raw.slice(0, 8000);

  return {
    ocrEstado: 'listo',
    ocrMetodo: 'vision',
    ocrTextoPlano: textoPlano,
    ocrValores: valores
  };
}

/**
 * Ejecuta extracción OCR / estructuración para un paraclínico ya en memoria.
 * Sin OPENAI_API_KEY: devuelve omitido. PDF escaneado (poco texto): error con mensaje claro.
 */
export async function extraerParaclinicoOcr(
  buffer: Buffer,
  mimeType: string,
  tipo: 'pdf' | 'imagen'
): Promise<ParaclinicoOcrOutcome> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ocrEstado: 'omitido',
      ocrError: 'OPENAI_API_KEY no configurada; el archivo se guardó sin análisis automático.'
    };
  }

  try {
    if (tipo === 'imagen') {
      return await visionDesdeImagen(buffer, mimeType);
    }

    const plain = await extractPdfPlainText(buffer);
    if (plain.length < MIN_PDF_TEXT_CHARS) {
      return {
        ocrEstado: 'error',
        ocrMetodo: 'pdf-texto',
        ocrTextoPlano: plain || undefined,
        ocrError:
          'El PDF tiene muy poco texto extraíble (suele ser un escaneo). Sube una imagen JPG/PNG nítida o un PDF con texto seleccionable.'
      };
    }

    const valores = await estructurarDesdeTexto(plain);
    return {
      ocrEstado: 'listo',
      ocrMetodo: 'pdf-texto',
      ocrTextoPlano: plain.slice(0, 32000),
      ocrValores: valores
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[paraclinicoOcrService]', msg);
    return {
      ocrEstado: 'error',
      ocrError: msg || 'Error al procesar el documento con IA'
    };
  }
}
