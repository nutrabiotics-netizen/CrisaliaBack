/**
 * Post-procesamiento de transcripción: corrige nombres de medicamentos
 * usando distancia de Levenshtein contra el catálogo de materiales.
 *
 * Se carga el catálogo una sola vez en memoria al iniciar.
 */
import Material from '../../models/Material';

// Cache en memoria de nombres normalizados
let nombresCache: string[] = [];
let cacheLoaded = false;

/** Distancia de Levenshtein entre dos strings */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/** Cargar catálogo de materiales (una sola vez) */
export async function cargarCatalogo(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const mats = await Material.find({}).select('nombre').lean();
    nombresCache = mats
      .map((m: any) => (m.nombre || '').toLowerCase().trim())
      .filter(n => n.length >= 4);
    cacheLoaded = true;
    console.log(`[CorreccionMed] Catálogo cargado: ${nombresCache.length} nombres`);
  } catch (e) {
    console.error('[CorreccionMed] Error cargando catálogo:', e);
  }
}

/** Corregir una palabra si se parece a un nombre del catálogo */
function corregirPalabra(palabra: string): string {
  if (palabra.length < 4 || nombresCache.length === 0) return palabra;
  const lower = palabra.toLowerCase();
  let mejorMatch = '';
  let mejorDist = Infinity;
  for (const nombre of nombresCache) {
    // Solo comparar nombres de longitud similar (±3 chars)
    if (Math.abs(nombre.length - lower.length) > 3) continue;
    const dist = levenshtein(lower, nombre);
    // Umbral: máximo 2 errores para palabras largas, 1 para cortas
    const umbral = lower.length >= 8 ? 2 : 1;
    if (dist <= umbral && dist < mejorDist) {
      mejorDist = dist;
      mejorMatch = nombre;
    }
  }
  if (mejorMatch && mejorDist > 0) {
    // Preservar capitalización original
    const corregida = palabra[0] === palabra[0].toUpperCase()
      ? mejorMatch.charAt(0).toUpperCase() + mejorMatch.slice(1)
      : mejorMatch;
    console.log(`[CorreccionMed] "${palabra}" → "${corregida}" (dist=${mejorDist})`);
    return corregida;
  }
  return palabra;
}

/** Corregir todo el texto del transcript */
export function corregirTranscript(texto: string): string {
  if (!cacheLoaded || nombresCache.length === 0) return texto;
  return texto.split(/(\s+)/).map(token => {
    // Preservar espacios y puntuación
    if (/^\s+$/.test(token) || token.length < 4) return token;
    // Limpiar puntuación para comparar
    const puntuacion = token.match(/[.,;:!?]$/)?.[0] ?? '';
    const palabra = token.replace(/[.,;:!?]$/, '');
    return corregirPalabra(palabra) + puntuacion;
  }).join('');
}
