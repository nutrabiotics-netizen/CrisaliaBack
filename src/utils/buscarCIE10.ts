export interface EntradaCIE10 { codigo: string; nombre: string; descripcion: string }
const catalogo = require('../data/cie10_catalogo.json') as { registros: EntradaCIE10[] };
const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const codigoNormalizado = (texto: string) => texto.toUpperCase().replace(/[.\s]/g, '');
const entradas = catalogo.registros as EntradaCIE10[];
const porCodigo = new Map(entradas.map(entrada => [entrada.codigo, entrada]));
const indice = entradas.map(entrada => ({ entrada, nombre: normalizar(entrada.nombre), descripcion: normalizar(entrada.descripcion) }));

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
