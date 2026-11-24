export interface VersionFase2 { fase2Generacion?: number; }
export const generacionFase2 = (doc: VersionFase2) => doc.fase2Generacion || 0;
export const filtroGeneracionFase2 = (doc: VersionFase2) => doc.fase2Generacion === undefined
  ? { fase2Generacion: { $exists: false } } : { fase2Generacion: doc.fase2Generacion };
export const solicitudDeGeneracionActual = (doc: VersionFase2, valor: unknown) =>
  valor === undefined ? generacionFase2(doc) === 0 : valor === generacionFase2(doc);

export function conservarRespuestasFase1(doc: { respuestas: Record<string, any>; fase1?: { historial: { rol: string; texto: string }[] } }) {
  const fijas = ['zonasDolor', 'causas', 'cierreFase1', 'mensajeFinal'];
  const respuestas = Object.fromEntries(Object.entries(doc.respuestas || {}).filter(([k]) => /^s(?:01|03)_/.test(k) || fijas.includes(k)));
  return { ...respuestas, historialChat: structuredClone(doc.fase1?.historial || []) };
}

/** Solo retira la copia automática; una revisión del médico se conserva. */
export function limpiarAntecedentesPersonalesReinicio(registro: any, interrogatorioId: string): Record<string, 1> {
  const fuente = registro.fuenteAntecedentesPersonales;
  if (!fuente || String(fuente.interrogatorioId) !== interrogatorioId) return {};
  const normalizar = (v: any): any => Array.isArray(v) ? v.map(normalizar) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).filter(k => k !== '_id').sort().map(k => [k, normalizar(v[k])])) : v;
  const igual = JSON.stringify(normalizar(registro.seccionInterrogatorioPrincipal?.antecedentesPersonalesReferidos)) === JSON.stringify(normalizar(fuente.datos));
  return { fuenteAntecedentesPersonales: 1, ...(igual ? { 'seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos': 1 as const } : {}) };
}
