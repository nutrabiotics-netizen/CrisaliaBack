import OpenAI from 'openai';
import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');

const STRUCTURE_MODEL = process.env.OPENAI_PARACLINICO_MODEL || 'gpt-4o-mini';
const MIN_DIGITAL_TEXT = 100; // chars mínimos para considerar PDF digital

export type ParaclinicoOcrEstado = 'listo' | 'error' | 'omitido';
export type ParaclinicoOcrMetodo = 'pdf-texto' | 'vision';

export interface ParaclinicoOcrValor {
  nombre: string;
  valor?: string;
  unidad?: string;
  referencia?: string;
}

export type TipoDocumento = 'laboratorio' | 'imagen_diagnostica' | 'electrocardiograma' | 'biopsia' | 'formula_medica' | 'historia_clinica' | 'otro';

export interface ParaclinicoOcrOutcome {
  ocrEstado: ParaclinicoOcrEstado;
  ocrMetodo?: ParaclinicoOcrMetodo;
  ocrTextoPlano?: string;
  ocrValores?: ParaclinicoOcrValor[];
  ocrError?: string;
  tipoDocumento?: TipoDocumento;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return s.trim();
}

function parseValoresJson(text: string): ParaclinicoOcrValor[] {
  const parsed = JSON.parse(stripJsonFence(text)) as unknown;
  if (!Array.isArray(parsed)) return [];
  return (parsed as Record<string, unknown>[])
    .filter((v) => v !== null && typeof v === 'object')
    .map((v) => ({
      nombre: String(v.nombre ?? '').trim() || 'Sin nombre',
      valor: v.valor != null ? String(v.valor) : undefined,
      unidad: v.unidad != null ? String(v.unidad) : undefined,
      referencia: v.referencia != null ? String(v.referencia) : undefined,
    }))
    .filter((v) => v.nombre && v.nombre !== 'Sin nombre');
}

const STRUCTURING_PROMPT = `Eres un asistente médico. Se te da el texto de un resultado de laboratorio o paraclínico.
Extrae TODOS los valores medidos y devuelve ÚNICAMENTE un array JSON válido (sin markdown, sin explicaciones) con objetos:
{"nombre": string, "valor": string, "unidad": string, "referencia": string}
Si un campo no está presente, omítelo o ponlo como null.
Si no hay valores estructurados, devuelve [].`;

const CLASIFICACION_PROMPT = `Clasifica el siguiente documento médico en UNA de estas categorías (responde SOLO el identificador):
- laboratorio: análisis de sangre, orina, coproscópico, microbiológico, hormonas, glucosa, hemograma
- imagen_diagnostica: radiografía, ecografía, resonancia, TAC, tomografía, mamografía, densitometría
- electrocardiograma: ECG, trazado cardíaco
- biopsia: resultado anatomopatológico, citología, histología
- formula_medica: prescripción, receta médica, medicamentos formulados
- historia_clinica: resumen médico, epicrisis, consulta, nota médica
- otro: cualquier otro documento que no encaje en las categorías anteriores`;

async function clasificarDocumento(texto: string): Promise<TipoDocumento> {
  if (!process.env.OPENAI_API_KEY || !texto.trim()) return 'otro';
  try {
    const completion = await openai.chat.completions.create({
      model: STRUCTURE_MODEL,
      temperature: 0,
      max_tokens: 20,
      messages: [
        { role: 'system', content: CLASIFICACION_PROMPT },
        { role: 'user', content: texto.slice(0, 3000) },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? 'otro';
    const VALID: TipoDocumento[] = ['laboratorio', 'imagen_diagnostica', 'electrocardiograma', 'biopsia', 'formula_medica', 'historia_clinica', 'otro'];
    return VALID.includes(raw as TipoDocumento) ? (raw as TipoDocumento) : 'otro';
  } catch { return 'otro'; }
}

async function estructurarConOpenAI(texto: string): Promise<ParaclinicoOcrValor[]> {
  const completion = await openai.chat.completions.create({
    model: STRUCTURE_MODEL,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: STRUCTURING_PROMPT },
      { role: 'user', content: texto.slice(0, 12000) },
    ],
  });
  const raw = completion.choices[0]?.message?.content || '[]';
  try { return parseValoresJson(raw); } catch { return []; }
}

// ─── Estrategias OCR ──────────────────────────────────────────────────────────

async function extraerTextoTextract(buffer: Buffer): Promise<string> {
  const command = new AnalyzeDocumentCommand({
    Document: { Bytes: buffer },
    FeatureTypes: ['TABLES', 'FORMS'],
  });
  const response = await textractClient.send(command);
  const blocks = response.Blocks ?? [];
  return blocks
    .filter((b) => b.BlockType === 'LINE' && b.Text)
    .map((b) => b.Text!)
    .join('\n');
}

async function procesarPdfDigital(buffer: Buffer): Promise<ParaclinicoOcrOutcome> {
  const data = await pdfParse(buffer);
  const texto = data.text?.trim() ?? '';
  if (texto.length < MIN_DIGITAL_TEXT) return procesarConTextract(buffer);

  const [valores, tipoDocumento] = await Promise.all([
    process.env.OPENAI_API_KEY ? estructurarConOpenAI(texto) : Promise.resolve([]),
    clasificarDocumento(texto),
  ]);

  return {
    ocrEstado: 'listo',
    ocrMetodo: 'pdf-texto',
    ocrTextoPlano: texto.slice(0, 8000),
    ocrValores: valores,
    tipoDocumento,
  };
}

async function procesarConTextract(buffer: Buffer): Promise<ParaclinicoOcrOutcome> {
  const texto = await extraerTextoTextract(buffer);
  const [valores, tipoDocumento] = await Promise.all([
    texto && process.env.OPENAI_API_KEY ? estructurarConOpenAI(texto) : Promise.resolve([]),
    clasificarDocumento(texto),
  ]);

  return {
    ocrEstado: 'listo',
    ocrMetodo: 'vision',
    ocrTextoPlano: texto.slice(0, 8000),
    ocrValores: valores,
    tipoDocumento,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function extraerParaclinicoOcr(
  buffer: Buffer,
  _mimeType: string,
  tipo: 'pdf' | 'imagen'
): Promise<ParaclinicoOcrOutcome> {
  try {
    if (tipo === 'pdf') {
      return await procesarPdfDigital(buffer);
    }
    // Imágenes → Textract directamente
    return await procesarConTextract(buffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[paraclinicoOcrService]', msg);
    return { ocrEstado: 'error', ocrError: msg || 'Error al procesar el documento' };
  }
}