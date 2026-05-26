/**
 * Búsqueda en catálogo CIE-10.
 *
 * Estrategia:
 *  1) Si la query parece un código (letra + dígitos, opcionalmente con punto),
 *     hace prefix match exacto sobre `codigo`.
 *  2) Si es texto, intenta primero búsqueda de texto Mongo ($text) por relevancia,
 *     y si no hay resultados cae a regex insensible a caracteres tildados.
 */

import Cie10, { ICie10 } from '../../models/Cie10';

export interface Cie10SearchResult {
  codigo: string;
  descripcion: string;
  capitulo?: string;
  grupo?: string;
  genero: 'M' | 'F' | 'AMBOS';
  esCabecera: boolean;
}

function toDTO(doc: ICie10): Cie10SearchResult {
  return {
    codigo: doc.codigo,
    descripcion: doc.descripcion,
    capitulo: doc.capitulo,
    grupo: doc.grupo,
    genero: doc.genero,
    esCabecera: doc.esCabecera
  };
}

/** Quita acentos para regex search "fuzzy" sin tildes. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CODIGO_PATTERN = /^[a-z]\d{0,3}(\.\d{0,2})?$/i;

export async function searchCie10(query: string, limit = 20): Promise<Cie10SearchResult[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  // 1) Por código: prefix match
  if (CODIGO_PATTERN.test(q)) {
    const codeQuery = q.toUpperCase();
    const docs = await Cie10.find({
      codigo: { $regex: `^${escapeRegex(codeQuery)}` },
      activo: true
    })
      .sort({ esCabecera: 1, codigo: 1 })
      .limit(limit)
      .lean<ICie10[]>();
    return (docs as unknown as ICie10[]).map(toDTO);
  }

  // 2) Por texto: primero $text (rápido + ranking por relevancia)
  const textDocs = await Cie10.find(
    { $text: { $search: q }, activo: true },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean<ICie10[]>();

  if (textDocs.length > 0) {
    return (textDocs as unknown as ICie10[]).map(toDTO);
  }

  // 3) Fallback: regex insensible a mayúsculas (más lento pero atrapa typos parciales)
  const safe = escapeRegex(q);
  const fallback = await Cie10.find({
    activo: true,
    $or: [
      { descripcion: { $regex: safe, $options: 'i' } },
      { sinonimos: { $regex: safe, $options: 'i' } }
    ]
  })
    .limit(limit)
    .lean<ICie10[]>();
  return (fallback as unknown as ICie10[]).map(toDTO);
}

/** Devuelve un código exacto por codigo (útil para validación). */
export async function getCie10ByCode(codigo: string): Promise<Cie10SearchResult | null> {
  const doc = await Cie10.findOne({ codigo: codigo.toUpperCase(), activo: true }).lean<ICie10>();
  return doc ? toDTO(doc as unknown as ICie10) : null;
}

/** Cuenta total de códigos cargados (para debug). */
export async function countCie10(): Promise<number> {
  return Cie10.countDocuments({ activo: true });
}
