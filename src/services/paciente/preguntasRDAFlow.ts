import catalogo from '../../data/rda_questions.json';

export interface PreguntaRDA {
  id: string; type: 'single' | 'checkbox' | 'text'; text: string; description: string;
  options: { value: string; label: string; nombre?: string }[];
}
export const PREGUNTAS_RDA = catalogo as PreguntaRDA[];
export function fechaRespuestaRDA(instant: string) {
  const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(instant));
  const valor = (tipo: string) => partes.find(p => p.type === tipo)!.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
export function normalizarRespuestaRDA(pregunta: PreguntaRDA, valor: unknown): string | string[] | undefined {
  if (pregunta.type === 'text') return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= 2000 ? valor.trim() : undefined;
  if (pregunta.type === 'checkbox') {
    if (!Array.isArray(valor) || !valor.length || valor.length > pregunta.options.length || new Set(valor).size !== valor.length
      || valor.some(v => typeof v !== 'string' || !pregunta.options.some(o => o.value === v))
      || (valor.includes('sin_certeza') && valor.length !== 1)) return undefined;
    return pregunta.options.filter(o => valor.includes(o.value)).map(o => o.value);
  }
  return typeof valor === 'string' && pregunta.options.some(o => o.value === valor) ? valor : undefined;
}
export function respuestaRDAValida(pregunta: PreguntaRDA, respuestas: Record<string, any>) {
  const dato = respuestas[pregunta.id];
  return !!dato && normalizarRespuestaRDA(pregunta, dato.valor) !== undefined && typeof dato.respondidoEn === 'string'
    && Number.isFinite(Date.parse(dato.respondidoEn));
}
export function preguntasRDAParaRespuestas(respuestas: Record<string, any>): PreguntaRDA[] {
  const seleccion = PREGUNTAS_RDA.find(p => p.id === 'rda_factores_riesgo')!;
  if (!respuestaRDAValida(seleccion, respuestas)) return PREGUNTAS_RDA;
  const tipos: Record<string, string> = { '01': 'químico', '02': 'físico', '03': 'biomecánico', '04': 'psicosocial', '05': 'biológico', '06': 'de otro tipo' };
  return [...PREGUNTAS_RDA, ...seleccion.options.filter(o => o.value !== 'sin_certeza' && respuestas[seleccion.id].valor.includes(o.value)).map(o => ({
    id: `rda_factor_detalle_${o.value}`, type: 'text' as const, text: `¿A qué factor ${tipos[o.value]} estás expuesto?`,
    description: 'Cuéntalo con tus palabras. No necesitas conocer el término técnico', options: [],
  }))];
}
export function etiquetaRespuestaRDA(pregunta: PreguntaRDA, valor: string | string[]) {
  if (pregunta.type === 'text') return valor as string;
  const seleccion = Array.isArray(valor) ? valor : [valor];
  return pregunta.options.filter(o => seleccion.includes(o.value)).map(o => o.label).join('; ');
}
export const siguientePreguntaRDA = (respuestas: Record<string, any>) => preguntasRDAParaRespuestas(respuestas).find(p => !respuestaRDAValida(p, respuestas));
export const preguntasRDACompletas = (respuestas: Record<string, any>) => !siguientePreguntaRDA(respuestas);

/** Es una declaración sobre oposición escrita; nunca acredita consentimiento ni inventa la fecha del documento. */
export function proyectarOposicionRDA(respuestas: Record<string, any>, interrogatorioId: unknown): Record<string, any> {
  const pregunta = PREGUNTAS_RDA.find(p => p.id === 'rda_oposicion_donacion')!;
  if (!respuestaRDAValida(pregunta, respuestas)) return {};
  const { valor, respondidoEn } = respuestas[pregunta.id];
  return { oposicionOrganos: [{ respuesta: valor,
    oposicion: valor === 'si_escrita' ? true : valor === 'no_escrita' ? false : null,
    fecha: fechaRespuestaRDA(respondidoEn), interrogatorioId }] };
}
export function completarOposicionRDA(actual: Record<string, any>, respuestas: Record<string, any>, interrogatorioId: unknown) {
  const registros = [...(actual.oposicionOrganos || [])];
  const tieneLegacy = actual.respuestaOposicionOrganos !== undefined || actual.oposicionDonarOrganos !== undefined;
  // Datos médicos antiguos sin fuente: conservarlos sin atribuirles una entrevista.
  if (tieneLegacy && !actual.interrogatorioOposicionOrganosId) return {};
  let migrado = false;
  if (tieneLegacy && !registros.some(r => String(r.interrogatorioId) === String(actual.interrogatorioOposicionOrganosId))) {
    registros.push({ fecha: actual.fechaRespuestaOposicionOrganos, interrogatorioId: actual.interrogatorioOposicionOrganosId,
      respuesta: actual.respuestaOposicionOrganos, oposicion: actual.oposicionDonarOrganos });
    migrado = true;
  }
  const nuevo = proyectarOposicionRDA(respuestas, interrogatorioId).oposicionOrganos?.[0];
  if (nuevo && !registros.some(r => String(r.interrogatorioId) === String(interrogatorioId))) registros.push(nuevo);
  else if (!migrado) return {};
  return registros.length ? { oposicionOrganos: registros } : {};
}
export const camposOposicionLegacy = ['respuestaOposicionOrganos', 'oposicionDonarOrganos', 'fechaRespuestaOposicionOrganos', 'interrogatorioOposicionOrganosId'];
export function filtroOposicionRDA(actual: Record<string, any>) {
  return Object.fromEntries([...camposOposicionLegacy, 'oposicionOrganos', 'discapacidades', 'interrogatorioDiscapacidadId', 'factoresRiesgo', 'estadoFactoresRiesgo', 'interrogatorioFactoresRiesgoId'].map(k =>
    [`seccionInterrogatorioPrincipal.${k}`, actual[k] === undefined ? { $exists: false } : actual[k]]));
}
export function quitarOposicionLegacy(actual: Record<string, any>) {
  return actual.interrogatorioOposicionOrganosId ? Object.fromEntries(camposOposicionLegacy.map(k => [`seccionInterrogatorioPrincipal.${k}`, 1])) : {};
}

export function completarDiscapacidadRDA(actual: Record<string, any>, respuestas: Record<string, any>, interrogatorioId: unknown): Record<string, any> {
  if (actual.discapacidades?.length || actual.interrogatorioDiscapacidadId) return {};
  const pregunta = PREGUNTAS_RDA.find(p => p.id === 'rda_discapacidad')!;
  if (!respuestaRDAValida(pregunta, respuestas)) return {};
  const opcion = pregunta.options.find(o => o.value === respuestas[pregunta.id].valor)!;
  return { discapacidades: [{ codigo: opcion.value, nombre: opcion.label }], interrogatorioDiscapacidadId: interrogatorioId };
}
export function completarPreguntasRDA(actual: Record<string, any>, respuestas: Record<string, any>, interrogatorioId: unknown) {
  return { ...completarOposicionRDA(actual, respuestas, interrogatorioId), ...completarDiscapacidadRDA(actual, respuestas, interrogatorioId), ...completarFactoresRDA(actual, respuestas, interrogatorioId) };
}

export function completarFactoresRDA(actual: Record<string, any>, respuestas: Record<string, any>, interrogatorioId: unknown): Record<string, any> {
  if (actual.factoresRiesgo?.length || actual.estadoFactoresRiesgo || actual.interrogatorioFactoresRiesgoId) return {};
  const pregunta = PREGUNTAS_RDA.find(p => p.id === 'rda_factores_riesgo')!;
  if (!respuestaRDAValida(pregunta, respuestas)) return {};
  const seleccion = respuestas[pregunta.id].valor as string[];
  if (seleccion.includes('sin_certeza')) return { factoresRiesgo: [], estadoFactoresRiesgo: 'sin_certeza', interrogatorioFactoresRiesgoId: interrogatorioId };
  const detalles = preguntasRDAParaRespuestas(respuestas).filter(p => p.id.startsWith('rda_factor_detalle_'));
  if (!detalles.every(p => respuestaRDAValida(p, respuestas))) return {};
  return { factoresRiesgo: pregunta.options.filter(o => seleccion.includes(o.value)).map(o => ({
    codigo: o.value, tipo: o.nombre!, nombre: respuestas[`rda_factor_detalle_${o.value}`].valor,
  })), estadoFactoresRiesgo: 'registrados', interrogatorioFactoresRiesgoId: interrogatorioId };
}

/** Información clínica declarada para el Agent: descripciones, sin códigos administrativos ni metadatos RDA. */
export function contextoClinicoRDA(respuestas: Record<string, any>): Record<string, any> {
  const contexto: Record<string, any> = {};
  const discapacidad = PREGUNTAS_RDA.find(p => p.id === 'rda_discapacidad')!;
  if (respuestaRDAValida(discapacidad, respuestas)) contexto.discapacidadDeclarada = discapacidad.options.find(o => o.value === respuestas[discapacidad.id].valor)!.label;
  const exposicion = PREGUNTAS_RDA.find(p => p.id === 'rda_factores_riesgo')!;
  if (respuestaRDAValida(exposicion, respuestas)) {
    const seleccion = respuestas[exposicion.id].valor as string[];
    contexto.exposicionDeclarada = seleccion.includes('sin_certeza') ? { estado: 'No tengo certeza' } : {
      estado: 'Factores declarados por el paciente',
      factores: exposicion.options.filter(o => seleccion.includes(o.value)).map(o => {
        const detalle = preguntasRDAParaRespuestas(respuestas).find(p => p.id === `rda_factor_detalle_${o.value}`)!;
        return { tipo: o.nombre, ...(respuestaRDAValida(detalle, respuestas) ? { descripcion: respuestas[detalle.id].valor } : {}) };
      }),
    };
  }
  return contexto;
}
