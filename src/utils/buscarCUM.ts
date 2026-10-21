import catalogo from '../data/cums_catalogo.json';

export interface EntradaCUM { codigo: string; nombre: string; descripcion: string }
const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const entradas = catalogo.registros as EntradaCUM[];
const porCodigo = new Map(entradas.map(e => [e.codigo, e]));
const indice = entradas.map(entrada => ({ entrada, nombre: normalizar(entrada.nombre), descripcion: normalizar(entrada.descripcion) }));

export function obtenerCUM(codigo: string): EntradaCUM | undefined { return porCodigo.get(codigo.trim()); }

/** Cada presentación conserva su propio CUM; el buscador no prescribe ni asigna códigos a texto libre. */
export function buscarCUM(texto: string, limite = 15): EntradaCUM[] {
  const consulta = normalizar(texto);
  if (consulta.length < 3) return [];
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
    .slice(0, Math.max(0, Math.min(limite, 30))).map(r => r.entrada);
}
