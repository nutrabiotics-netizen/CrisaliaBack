export interface CiuoEntry {
  codigo: string;
  nombre: string;
}

const ciuoData = require('../data/ciuo_ocupaciones.json') as CiuoEntry[];

const STOP_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'para',
  'por', 'con', 'un', 'una', 'no', 'se', 'es', 'que', 'o', 'u',
  'al', 'e', 'su', 'sus', 'lo', 'les', 'le', 'nos',
]);

function normalizar(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Devuelve el peso de coincidencia entre dos palabras:
 *  1.0 = match exacto o por inclusión (una contiene a la otra)
 *  0.6 = match por prefijo compartido de ≥5 chars (variantes de género/número)
 *  0.0 = sin coincidencia
 */
function pesoCoincidencia(a: string, b: string): number {
  const raiz = (palabra: string) => palabra.replace(/(?:es|s)$/, '').replace(/[oa]$/, '');
  if (a === b || (raiz(a).length >= 4 && raiz(a) === raiz(b))) return 1.0;
  if (a.includes(b) || b.includes(a)) return 1.0;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 5 && a.slice(0, minLen - 1) === b.slice(0, minLen - 1)) return 0.6;
  return 0;
}

/**
 * Busca ocupaciones CIUO que coincidan con el texto libre del paciente.
 * Devuelve hasta `maxResultados` entradas ordenadas por puntuación ponderada.
 * Score: suma de pesos de coincidencia por palabra / total palabras del query.
 * Match exacto (1.0) pesa más que match de prefijo (0.6), lo que favorece
 * "Analistas de sistemas" sobre "Ingenieros industriales" para "ingeniero de sistemas".
 */
export function buscarCIUO(textoLibre: string, maxResultados = 5): CiuoEntry[] {
  const queryWords = normalizar(textoLibre);
  if (queryWords.length === 0) return [];

  const scored = (ciuoData as CiuoEntry[]).map(entry => {
    const entryWords = normalizar(entry.nombre);
    const totalPeso = queryWords.reduce((acc, qw) => {
      const mejorPeso = entryWords.reduce((max, ew) => Math.max(max, pesoCoincidencia(qw, ew)), 0);
      return acc + mejorPeso;
    }, 0);
    return { entry, score: totalPeso / queryWords.length };
  })
  .filter(x => x.score >= 0.4)
  .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResultados).map(x => x.entry);
}

/** Valida el código contra el catálogo; nunca confía en el nombre enviado por el cliente. */
export function obtenerCIUO(codigo: string): CiuoEntry | undefined {
  return (ciuoData as CiuoEntry[]).find(entry => entry.codigo === codigo);
}
