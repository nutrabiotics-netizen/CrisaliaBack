export interface EntradaCUM { codigo: string; nombre: string; descripcion: string }
// Cargar como datos evita que TypeScript infiera el tipo de las 100.000 filas del JSON.
const catalogo = require('../data/cums_catalogo.json') as { registros: EntradaCUM[] };
const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const entradas = catalogo.registros as EntradaCUM[];
const porCodigo = new Map(entradas.map(e => [e.codigo, e]));
const indice = entradas.map(entrada => ({ entrada, nombre: normalizar(entrada.nombre), descripcion: normalizar(entrada.descripcion) }));

export function obtenerCUM(codigo: string): EntradaCUM | undefined { return porCodigo.get(codigo.trim()); }

/** Cada presentación conserva su propio CUM; el buscador no prescribe ni asigna códigos a texto libre. */
export function buscarCUM(texto: string, limite = 15, minimoCaracteres = 3): EntradaCUM[] {
  return resultadosCUM(texto, minimoCaracteres).slice(0, Math.max(0, Math.min(limite, 30)));
}

function resultadosCUM(texto: string, minimoCaracteres = 3): EntradaCUM[] {
  const consulta = normalizar(texto);
  if (consulta.length < minimoCaracteres) return [];
  const codigo = texto.trim();
  const palabras = consulta.split(/\s+/).filter(p => !['de', 'del', 'la', 'el', 'en', 'y', 'con'].includes(p));
  if (!palabras.length) return [];
  const resultados: { entrada: EntradaCUM; puntuacion: number }[] = [];
  for (const { entrada, nombre, descripcion } of indice) {
    const porCodigo = /^\d+(?:-\d*)?$/.test(codigo) && entrada.codigo.startsWith(codigo);
    const coincide = palabras.every(p => nombre.includes(p) || descripcion.includes(p));
    const puntuacion = entrada.codigo === codigo ? 10000 : porCodigo ? 9000 : !coincide ? 0
      : nombre === consulta ? 1000 : nombre.startsWith(consulta) ? 800 : nombre.includes(consulta) ? 600 : 100;
    if (puntuacion) resultados.push({ entrada, puntuacion });
  }
  return resultados.sort((a, b) => b.puntuacion - a.puntuacion || a.entrada.nombre.length - b.entrada.nombre.length || a.entrada.codigo.localeCompare(b.entrada.codigo))
    .map(r => r.entrada);
}

/** Términos semánticos ordenados de más preciso a más amplio. Nunca genera códigos. */
export function buscarCandidatosCUM(terminos: string[]): { candidatos: EntradaCUM[]; hayMas: boolean } {
  for (const termino of terminos.slice(0, 6)) {
    const coincidencias = resultadosCUM(termino);
    if (coincidencias.length) return { candidatos: coincidencias.slice(0, 60), hayMas: coincidencias.length > 60 };
  }
  return { candidatos: [], hayMas: false };
}
