import { normalizarRespuesta, PreguntaFase1, OpcionesRespondidas } from './fase1Flow';
export { registrarOpcionesRespondidas } from './fase1Flow';
import { contextoClinicoRDA } from '../paciente/preguntasRDAFlow';
import type { AgentDecision } from './anamnesisAgentService';

export interface PreguntaFase2 extends PreguntaFase1 {
  items?: { id: string; label: string }[];
  scale_type?: string;
  seccionId: string;
  textoPaciente?: string;
}
export interface EstadoFase2 {
  examenesPendientes?: boolean;
  contextoRDA?: string;
  version: number;
  estado: 'preguntando' | 'decidiendo' | 'resumen' | 'confirmada' | 'alerta';
  ronda: number;
  preguntas: PreguntaFase2[];
  preguntaId: string | null;
  progreso: number;
  respondidas: string[];
  historial: { rol: 'ia' | 'usuario'; texto: string; payload?: Record<string, any>; opcionesRespondidas?: OpcionesRespondidas }[];
  turnos: { id: string; respuesta: Record<string, any> }[];
  decision?: AgentDecision;
  resumenPaciente?: string[];
  ultimaRespuesta?: Record<string, any>;
}
const propia = (r: Record<string, any>, id: string) => Object.prototype.hasOwnProperty.call(r, id);

export function validarRespuestaFase2(q: PreguntaFase2, valor: unknown): { valido: boolean; valor?: any } {
  if (q.type === 'symptom_table') {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor) || !q.items?.length) return { valido: false };
    const dato = valor as Record<string, unknown>;
    const valido = Object.keys(dato).length === q.items.length && q.items.every(i => typeof dato[i.id] === 'number' &&
      Number.isInteger(dato[i.id]) && Number(dato[i.id]) >= 0 && Number(dato[i.id]) <= 3);
    return { valido, valor: dato };
  }
  const resultado = normalizarRespuesta(q, valor);
  if (resultado.valido && q.type === 'scale' && typeof resultado.valor === 'number' && q.step) {
    const pasos = (resultado.valor - (q.min || 0)) / q.step;
    if (Math.abs(pasos - Math.round(pasos)) > 1e-7) return { valido: false };
  }
  return resultado;
}
export function respuestaGuardadaFase2(q: PreguntaFase2, r: Record<string, any>) {
  if (q.type !== 'symptom_table') return propia(r, q.id) && validarRespuestaFase2(q, r[q.id]).valido;
  const valores = Object.fromEntries((q.items || []).map(i => [i.id, r[i.id]]));
  return validarRespuestaFase2(q, valores).valido;
}
export function guardarRespuestaFase2(q: PreguntaFase2, valor: any, r: Record<string, any>): Record<string, any> {
  const cambio = q.type === 'symptom_table' ? valor : { [q.id]: valor };
  Object.assign(r, cambio); return cambio;
}
export function catalogoFase2(secciones: Record<string, any>, respuestas: Record<string, any>): PreguntaFase2[] {
  return Object.entries(secciones).filter(([id, s]) => !['s01', 's03', 's37'].includes(id) && !s.for_ai_only &&
    (!s.condition || respuestas[s.condition.field] === s.condition.value))
    .flatMap(([id, s]) => (s.questions || []).filter((q: any) => ['text', 'single', 'checkbox', 'table', 'scale', 'symptom_table'].includes(q.type))
      .map((q: any) => ({ ...q, seccionId: id })));
}
export function elegirPreguntasAgent(decision: any, catalogo: PreguntaFase2[], r: Record<string, any>): PreguntaFase2[] {
  if (!Array.isArray(decision.secciones) || !decision.secciones.length || decision.secciones.length > 36 ||
    decision.secciones.some((id: unknown) => typeof id !== 'string' || !catalogo.some(q => q.seccionId === id))) throw Error('Secciones no válidas en la decisión del Agent');
  const ids: unknown = decision.id_pregunta;
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== 'string'))) throw Error('Preguntas no válidas en la decisión del Agent');
  const elegidas: string[] = Array.isArray(ids) ? ids : [];
  const candidatas = [...new Set<string>(decision.secciones)].flatMap(id => catalogo.filter(q => q.seccionId === id));
  if (elegidas.some(id => !candidatas.some(q => q.id === id || q.items?.some(i => i.id === id)))) throw Error('El Agent eligió un ID fuera del catálogo aplicable');
  const ordenadas = elegidas.length ? [...candidatas].sort((a, b) => {
    const posicion = (q: PreguntaFase2) => Math.min(...[q.id, ...(q.items || []).map(i => i.id)].map(id => elegidas.indexOf(id)).filter(i => i >= 0), Infinity);
    return posicion(a) - posicion(b);
  }) : candidatas;
  return ordenadas.flatMap(q => {
    if (elegidas.length && !elegidas.includes(q.id) && !q.items?.some(i => elegidas.includes(i.id))) return [];
    let pregunta = q;
    if (q.items) {
      const items = q.items.filter(i => (!elegidas.length || elegidas.includes(q.id) || elegidas.includes(i.id)) &&
        !(typeof r[i.id] === 'number' && Number.isInteger(r[i.id]) && r[i.id] >= 0 && r[i.id] <= 3));
      if (!items.length) return [];
      pregunta = { ...q, items };
    }
    return respuestaGuardadaFase2(pregunta, r) ? [] : [pregunta];
  });
}
export function textoRespaldoFase2(q: PreguntaFase2) {
  if (q.text.includes('?')) return q.text;
  if (q.type === 'symptom_table' && (q.id.startsWith('s09_') || ['s30_omega3_consumo', 's30_omega6_consumo'].includes(q.id))) return '¿Con qué frecuencia consumes cada uno de estos alimentos? Marca una opción en cada fila.';
  if (q.type === 'symptom_table') return q.scale_type === 'intensity'
    ? '¿Qué tan intensa es cada una de estas molestias o sensaciones? Marca una opción en cada fila.'
    : '¿Con qué frecuencia te ocurre cada una de las situaciones de esta lista? Marca una opción en cada fila.';
  if (q.id.startsWith('s05_dx_')) return '¿Un profesional de salud te ha diagnosticado alguna de estas enfermedades? Puedes marcar varias opciones.';
  if (q.type === 'checkbox') return 'De las opciones de esta lista, ¿cuáles se aplican a ti? Puedes marcar varias.';
  if (q.type === 'table') return '¿Qué información puedes compartir sobre lo que aparece en esta tabla? Añade lo que recuerdes.';
  return `¿Qué puedes contarme sobre lo siguiente: ${q.text.charAt(0).toLowerCase() + q.text.slice(1)}?`;
}
export function presentarPreguntaFase2(q: PreguntaFase2): Record<string, any> {
  return { respuesta: q.textoPaciente || textoRespaldoFase2(q), questionId: q.id, opciones: q.options?.map(o => o.label) || [], opcionesData: q.options,
    questionType: q.type, tipoOpciones: q.type === 'symptom_table' ? 'tabla' : q.type === 'table' ? 'tabla_dinamica' : q.type === 'scale' ? 'scale' : q.type === 'checkbox' ? 'checkbox' : 'single',
    tablaItems: q.items, tablaEscala: q.scale_type === 'intensity' ? 'intensidad' : 'frecuencia', columnas: q.columns,
    scaleData: q.type === 'scale' ? { min: q.min, max: q.max, step: q.step, minLabel: q.minLabel, maxLabel: q.maxLabel, required: q.required !== false } : undefined,
    finRonda: false };
}
export function contextoClinicoFase2(r: Record<string, any>): Record<string, any> {
  return { ...Object.fromEntries(Object.entries(r).filter(([id]) => !['s01_nombre', 's01_contacto_emergencia', 's01_nacimiento'].includes(id) &&
    (/^s\d{2}_/.test(id) || id === 'examenes_paraclinicos' || id === 'zonasDolor' || id === 'aclaraciones_fase2'))), ...contextoClinicoRDA(r) };
}
export function medicacionFase2(r: Record<string, any>) {
  return JSON.stringify({ declaradaEnFase1: r.s01_medicamentos_actuales ?? null, detalle: r.s06_detalle_tabla ?? r.s06_detalle ?? null });
}
export function validarDecisionFase2(d: any): AgentDecision {
  if (!d || !['entrevistar', 'generar_s37', 'alerta_medica'].includes(d.accion)) throw Error('Decisión incompleta del Agent');
  if (d.progreso !== undefined && (typeof d.progreso !== 'number' || !Number.isFinite(d.progreso))) throw Error('Progreso inválido del Agent');
  if (d.accion === 'generar_s37') {
    if (!Array.isArray(d.disfunciones_probables) || d.disfunciones_probables.length > 100 || d.disfunciones_probables.some((x: any) =>
      !x || typeof x.nombre !== 'string' || !x.nombre.trim() ||
      (x.evidencia !== undefined && (!Array.isArray(x.evidencia) || x.evidencia.some((e: any) => typeof e !== 'string'))) ||
      (x.productos !== undefined && (!Array.isArray(x.productos) || x.productos.some((p: any) => typeof p !== 'string'))))) throw Error('Informe incompleto del Agent');
    return { ...d, disfunciones_probables: d.disfunciones_probables.map((x: any) => ({ ...x, productos: x.productos || [] })) };
  }
  if (d.accion === 'alerta_medica' && (typeof d.motivo !== 'string' || !d.motivo.trim() || typeof d.instruccion !== 'string')) throw Error('Alerta incompleta del Agent');
  return d;
}
