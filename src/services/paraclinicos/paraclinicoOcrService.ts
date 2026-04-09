import OpenAI from 'openai';

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
 * Extracción con IA: solo imágenes. Los PDF se guardan sin análisis automático.
 * Sin OPENAI_API_KEY: omitido.
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

    return {
      ocrEstado: 'omitido',
      ocrError:
        'El análisis automático no está disponible para PDF. Sube el resultado como imagen (JPG/PNG/WebP) para extraer valores, o completa los datos manualmente.'
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
