export interface EntradaCIE10 { codigo: string; nombre: string; descripcion: string }
const catalogo = require('../data/cie10_catalogo.json') as { registros: EntradaCIE10[] };
const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const codigoNormalizado = (texto: string) => texto.toUpperCase().replace(/[.\s]/g, '');
const entradas = catalogo.registros as EntradaCIE10[];
const porCodigo = new Map(entradas.map(entrada => [entrada.codigo, entrada]));
const indice = entradas.map(entrada => ({ entrada, nombre: normalizar(entrada.nombre), descripcion: normalizar(entrada.descripcion) }));
// Índice derivado de TODO el catálogo, sin listas de equivalencias por enfermedad.
const porCategoria = new Map<string, EntradaCIE10[]>();
for (const entrada of entradas) {
  const categoria = entrada.codigo.slice(0, 3);
  const grupo = porCategoria.get(categoria) || [];
  grupo.push(entrada); porCategoria.set(categoria, grupo);
}

export function obtenerCIE10(codigo: string): EntradaCIE10 | undefined {
  return porCodigo.get(codigoNormalizado(codigo));
}

/** Busca en el código y en ambas columnas del Excel; nunca asigna un diagnóstico. */
export function buscarCIE10(texto: string, limite = 15): EntradaCIE10[] {
  const consulta = normalizar(texto);
  if (consulta.length < 2) return [];
  const codigo = codigoNormalizado(texto);
  const palabras = consulta.split(/\s+/).filter(p => !['de', 'del', 'la', 'el', 'en', 'y', 'con'].includes(p));
  if (!palabras.length) return [];
  return indice.map(({ entrada, nombre, descripcion }) => {
    const coincideCodigo = /^[A-Z]\d[\dA-Z]*$/.test(codigo) && entrada.codigo.startsWith(codigo);
    const coincideTexto = palabras.every(p => nombre.includes(p) || descripcion.includes(p));
    const puntuacion = entrada.codigo === codigo ? 10000 : coincideCodigo ? 9000 : !coincideTexto ? 0
      : nombre === consulta ? 1000 : nombre.startsWith(consulta) ? 800 : nombre.includes(consulta) ? 600 : 100;
    return { entrada, puntuacion };
  }).filter(r => r.puntuacion > 0)
    .sort((a, b) => b.puntuacion - a.puntuacion || a.entrada.nombre.length - b.entrada.nombre.length || a.entrada.codigo.localeCompare(b.entrada.codigo))
    .slice(0, Math.max(0, Math.min(limite, 30))).map(r => r.entrada);
}

/** Recuperación semántica asistida por IA. Las referencias son pistas de búsqueda, nunca diagnósticos.
 * Solo devuelve entradas reales y conserva todas las alternativas de las categorías propuestas para
 * que el selector contraste tipo, complicaciones y especificidad con el relato, sin depender del nombre exacto.
 */
export function buscarCandidatosCIE10(terminos: string[], referencias: string[] = []): EntradaCIE10[] {
  const unicos = new Map<string, EntradaCIE10>();
  for (const referencia of referencias.slice(0, 3)) {
    const codigo = codigoNormalizado(referencia);
    const categoria = /^[A-Z]\d{2}$/.test(codigo) ? codigo : porCodigo.has(codigo) ? codigo.slice(0, 3) : undefined;
    if (!categoria) continue;
    for (const entrada of porCategoria.get(categoria) || []) unicos.set(entrada.codigo, entrada);
  }
  const listas = terminos.slice(0, 6).map(t => buscarCIE10(t, 12));
  // Intercalar resultados evita que la primera búsqueda genérica oculte las otras equivalencias.
  for (let posicion = 0; posicion < 12; posicion++) {
    for (const lista of listas) {
      const entrada = lista[posicion];
      if (entrada) unicos.set(entrada.codigo, entrada);
    }
  }
  return [...unicos.values()].slice(0, 80);
}
