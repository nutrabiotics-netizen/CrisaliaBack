/** Estado de la primera entrevista. El avance depende de respuestas, no de texto del LLM. */
export interface PreguntaFase1 {
  id: string;
  text: string;
  type: string;
  options?: { label: string; value: string; requiresFollowUp?: boolean }[];
  columns?: string[];
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  required?: boolean;
  adultoOnly?: boolean;
  allergyRole?: 'type' | 'substance' | 'more';
  allergyIndex?: number;
  showIf?: { questionId: string; notIn?: string[] };
  search?: { source: string; placeholder?: string; allowCustom?: boolean; notFoundLabel?: string;
    multiple?: boolean; showCode?: boolean; showDescription?: boolean; unknownLabel?: string;
    manualLabel?: string; manualHelp?: string; manualAddLabel?: string; selectedLabel?: string;
    parentescos?: { codigo: string; descripcion: string }[];
  };
}

export interface EstadoFase1 {
  version: number;
  estado: 'recopilando' | 'resumen' | 'alerta';
  preguntaId: string | null;
  preguntas: PreguntaFase1[];
  historial: { rol: 'usuario' | 'ia'; texto: string }[];
  ultimaRespuesta?: Record<string, any>;
  turnos: { id: string; respuesta: Record<string, any> }[];
  ciuoCandidatos?: { codigo: string; nombre: string }[];
  confirmada?: boolean;
  preguntasProgreso?: string[];
  alertaPresencialMostrada?: boolean;
  cierre?: { hash: string; contenido: CierreNarrativoFase1; generadoEn: string };
}

export interface CierreNarrativoFase1 {
  resumen: string[];
  enfoque: string;
  sintesis: string;
  causas: { titulo: string; desc: string; evidencias: string[] }[];
}

/** Solo información pertinente al caso; excluye nombre, teléfono y contacto de emergencia. */
export function datosParaCierre(respuestas: Record<string, any>): Record<string, any> {
  const clinicos = /^s01_(edad|sexo|ocupacion|anos_ocupacion|jornada|talla|peso_actual|grasa_corporal|masa_muscular|perimetro_abdominal|peso_12meses|medicion_electronica|dispositivos|diagnosticado_peso|atleta)$/;
  return Object.fromEntries(Object.entries(respuestas).filter(([k, v]) =>
    (k.startsWith('s03_') || k === 's01_tipo_alergia' || k === 's01_alergias' || k === 's01_enfermedades_familia' || k === 's01_medicamentos_actuales' || clinicos.test(k) || k === 'zonasDolor') && v !== undefined && v !== null && v !== ''
  ).sort(([a], [b]) => a.localeCompare(b)));
}

const tiene = (obj: Record<string, any>, id: string) => Object.prototype.hasOwnProperty.call(obj, id);
const norm = (v: string) => v.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const SIN_CONTACTO_EMERGENCIA = 'No dispone de contacto de emergencia';
export const CONTACTO_NO_COMPARTIDO = 'Prefiere no compartir un contacto de emergencia';

/** Ausencia explícita y teléfono faltante son situaciones diferentes. */
export function declaracionSinContacto(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const texto = norm(valor).replace(/[¿?¡!.,;:]/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:ya te dije que|ya dije que|te digo que|la verdad es que|es que|que|pues|en realidad)\s+)+/, '');
  if (texto === norm(SIN_CONTACTO_EMERGENCIA)) return SIN_CONTACTO_EMERGENCIA;
  if (texto === norm(CONTACTO_NO_COMPARTIDO)) return CONTACTO_NO_COMPARTIDO;
  if (/^(?:no tengo(?: (?:a )?nadie(?: para contactar)?| ninguno| ningun contacto(?: de emergencia)?| (?:un )?contacto(?: de emergencia| para emergencias)?)?|no cuento con (?:nadie|(?:un|ningun) contacto(?: de emergencia)?)|no dispongo de (?:un )?contacto(?: de emergencia)?|no hay nadie|nadie|ningun[oa])$/.test(texto)) return SIN_CONTACTO_EMERGENCIA;
  if (/^(?:prefiero no (?:darlo|compartirlo|compartir(?: un| el| mi)? contacto(?: de emergencia)?)|no (?:quiero|deseo) (?:darlo|compartirlo|compartir(?: un| el| mi)? contacto(?: de emergencia)?))$/.test(texto)) return CONTACTO_NO_COMPARTIDO;
  return undefined;
}

export function normalizarRespuesta(q: PreguntaFase1, valor: unknown): { valido: boolean; valor?: any } {
  if (valor === null) return { valido: q.required === false, valor: null };
  if (q.type === 'search' && q.search?.source === 'medicamentos') {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { valido: false };
    const dato = valor as Record<string, unknown>;
    if (!Array.isArray(dato.medicamentos)) return { valido: false };
    if (dato.estado === 'no_toma') return { valido: dato.medicamentos.length === 0, valor };
    const vistos = new Set<string>();
    const valido = dato.estado === 'toma' && dato.medicamentos.length > 0 && dato.medicamentos.length <= 30 && dato.medicamentos.every((m: any) => {
      if (!m || typeof m.nombre !== 'string' || !m.nombre.trim() || m.nombre.length > 1000) return false;
      if (!(typeof m.codigo === 'string' && m.codigo.trim()) && !(m.codigo === null && m.origen === 'declarado')) return false;
      const clave = m.codigo === null ? `texto:${norm(m.nombre)}` : `codigo:${m.codigo}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave); return true;
    });
    return { valido, valor };
  }
  if (q.type === 'search' && q.search?.source === 'cie10') {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { valido: false };
    const dato = valor as Record<string, unknown>;
    if (!Array.isArray(dato.familiares)) return { valido: false };
    if (dato.estado === 'no_conoce') return { valido: dato.familiares.length === 0, valor };
    const codigos = new Set<string>();
    const valido = dato.estado === 'registradas' && dato.familiares.length > 0 && dato.familiares.length <= 4 && dato.familiares.every((f: any) => {
      const parentesco = q.search?.parentescos?.find(p => p.codigo === f?.parentesco?.codigo && p.descripcion === f.parentesco.descripcion);
      if (!parentesco || codigos.has(parentesco.codigo)) return false;
      codigos.add(parentesco.codigo);
      return Array.isArray(f.enfermedades) && f.enfermedades.length > 0 && f.enfermedades.length <= 30 &&
        new Set(f.enfermedades.map((e: any) => e?.codigo)).size === f.enfermedades.length &&
        f.enfermedades.every((e: any) => e && ['codigo', 'nombre', 'descripcion'].every(k => typeof e[k] === 'string' && e[k].trim()));
    });
    return { valido, valor };
  }
  if (q.allergyRole === 'substance' && (typeof valor !== 'string' || /^(?:s[ií]|no|no s[eé]|no tengo|ningun[oa]|no tengo alergias conocidas)[.! ]*$/i.test(valor.trim()))) return { valido: false };
  if (q.id === 's01_contacto_emergencia') {
    const ausencia = declaracionSinContacto(valor);
    if (ausencia) return { valido: true, valor: ausencia };
    return { valido: typeof valor === 'string' && /[a-záéíóúñ]/i.test(valor) && valor.replace(/\D/g, '').length >= 7 && valor.length <= 1000, valor };
  }
  if (q.type === 'single') {
    if (typeof valor !== 'string') return { valido: false };
    const opcion = q.options?.find(o => norm(o.value) === norm(valor) || norm(o.label) === norm(valor));
    return opcion ? { valido: true, valor: opcion.value } : { valido: false };
  }
  if (q.type === 'checkbox') {
    if (!Array.isArray(valor) || !valor.length) return { valido: false };
    const opciones = valor.map(v => typeof v === 'string' ? q.options?.find(o => norm(o.value) === norm(v) || norm(o.label) === norm(v)) : undefined);
    if (opciones.some(o => !o)) return { valido: false };
    const values = [...new Set(opciones.map(o => o!.value))];
    return values.includes('ninguno') && values.length > 1 ? { valido: false } : { valido: true, valor: values };
  }
  if (q.type === 'scale') {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return { valido: false };
    return { valido: (q.min === undefined || valor >= q.min) && (q.max === undefined || valor <= q.max), valor };
  }
  if (q.type === 'table') {
    if (!Array.isArray(valor) || valor.length > 30) return { valido: false };
    const valido = valor.every(row => row && typeof row === 'object' && !Array.isArray(row) &&
      Object.keys(row).length > 0 && Object.entries(row).every(([k, v]) => q.columns?.includes(k) && typeof v === 'string' && v.length <= 2000) &&
      Object.values(row).some(v => typeof v === 'string' && v.trim()));
    return { valido, valor };
  }
  return { valido: typeof valor === 'string' && !!valor.trim() && valor.length <= 8000, valor: typeof valor === 'string' ? valor.trim() : valor };
}

export function preguntasIniciales(preguntas: PreguntaFase1[], paciente: any): PreguntaFase1[] {
  const fecha = paciente.fechaNacimiento ? new Date(paciente.fechaNacimiento) : null;
  const hoy = new Date();
  const edad = fecha && Number.isFinite(fecha.getTime()) ? hoy.getFullYear() - fecha.getFullYear() -
    (hoy.getMonth() < fecha.getMonth() || (hoy.getMonth() === fecha.getMonth() && hoy.getDate() < fecha.getDate()) ? 1 : 0) : undefined;
  return preguntas.filter(q => q.type !== 'file_upload' && !(edad !== undefined && edad < 18 && q.adultoOnly));
}

export function respuestasDelPerfil(paciente: any): Record<string, any> {
  const r: Record<string, any> = {};
  const mapping: Record<string, any> = {
    s01_nombre: [paciente.nombre, paciente.apellido].filter(Boolean).join(' '),
    s01_nacimiento: paciente.fechaNacimiento ? new Date(paciente.fechaNacimiento).toISOString().slice(0, 10) : undefined,
    s01_sexo: paciente.sexoBiologico || (typeof paciente.genero === 'string' ? paciente.genero : undefined),
    s01_identidad_genero: paciente.genero?.codigo,
    s01_educacion: paciente.escolaridad,
    // Profesión no implica que sea la ocupación actual.
    s01_ocupacion: paciente.ocupacion || paciente.ocupacionCIUO?.nombre,
    s01_email: paciente.email, s01_celular: paciente.telefono, s01_direccion: paciente.direccion,
  };
  for (const [id, v] of Object.entries(mapping)) if (v !== undefined && v !== '') r[id] = v;
  if (paciente.fechaNacimiento) {
    const d = new Date(paciente.fechaNacimiento), now = new Date();
    r.s01_edad = String(now.getFullYear() - d.getFullYear() - (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate()) ? 1 : 0));
  }
  return r;
}

export function agregarSeguimientos(preguntas: PreguntaFase1[]): PreguntaFase1[] {
  const siNo = [{ label: 'Sí', value: 'si' }, { label: 'No', value: 'no' }, { label: 'No lo sé', value: 'no_se' }];
  // Se guardan como parte de la secuencia estable; su aplicabilidad se calcula con datos aceptados.
  return [{ id: 's03_sintoma_principal', text: '¿Cuál es el principal motivo por el que quieres consultar?', type: 'text' },
    ...preguntas, { id: 's01_diagnosticado_peso', text: '¿Te han diagnosticado obesidad o sobrepeso?', type: 'single', options: siNo },
    { id: 's01_atleta', text: '¿Eres atleta de alto rendimiento?', type: 'single', options: siNo }];
}

function seguimiento(id: string, r: Record<string, any>): boolean {
  const peso = r.s01_peso_actual, talla = r.s01_talla, grasa = r.s01_grasa_corporal;
  const masculino = r.s01_sexo === 'masculino', femenino = r.s01_sexo === 'femenino';
  if (id === 's01_diagnosticado_peso') return (typeof peso === 'number' && (peso > 100 || (typeof talla === 'number' && talla > 0 && peso / ((talla / 100) ** 2) >= 30))) ||
    (typeof grasa === 'number' && ((masculino && grasa > 25) || (femenino && grasa > 35)));
  if (id === 's01_atleta') return typeof grasa === 'number' && ((masculino && grasa <= 6) || (femenino && grasa <= 10));
  return false;
}

/** Dependencias declaradas en el JSON; un padre omitido también omite sus descendientes. */
export function esPreguntaAplicable(q: PreguntaFase1, respuestas: Record<string, any>, preguntas: PreguntaFase1[], visitadas = new Set<string>()): boolean {
  if (!q.showIf) return true;
  if (visitadas.has(q.id)) return false;
  visitadas.add(q.id);
  const padre = preguntas.find(p => p.id === q.showIf!.questionId);
  return !!padre && esPreguntaAplicable(padre, respuestas, preguntas, visitadas) &&
    normalizarRespuesta(padre, respuestas[padre.id]).valido && !q.showIf.notIn?.includes(respuestas[padre.id]);
}

/** Añade un nuevo ciclo únicamente cuando el paciente pide registrar otra alergia. */
export function agregarOtraAlergia(estado: EstadoFase1, pregunta: PreguntaFase1, respuestas: Record<string, any>): void {
  if (pregunta.allergyRole !== 'more' || respuestas[pregunta.id] !== 'si') return;
  const indice = (pregunta.allergyIndex || 1) + 1;
  if (estado.preguntas.some(q => q.allergyRole === 'type' && q.allergyIndex === indice)) return;
  const bases = estado.preguntas.filter(q => q.allergyIndex === 1);
  if (bases.length !== 3) throw new Error('El bloque de alergias está incompleto');
  const ids = Object.fromEntries(bases.map(q => [q.id, `${q.id}_${indice}`]));
  const nuevas = bases.map(q => ({ ...q, id: ids[q.id], allergyIndex: indice,
    options: q.allergyRole === 'type' ? q.options?.filter(o => o.value !== 'sin_alergias_conocidas') : q.options,
    showIf: q.allergyRole === 'type' ? { questionId: pregunta.id, notIn: ['no'] }
      : q.showIf ? { ...q.showIf, questionId: ids[q.showIf.questionId] } : undefined,
  }));
  estado.preguntas.splice(estado.preguntas.findIndex(q => q.id === pregunta.id) + 1, 0, ...nuevas);
  // El progreso considera el bloque completo; no retrocede al añadir ciclos.
}

export function actualizarRegistroAlergias(estado: EstadoFase1, respuestas: Record<string, any>): void {
  if (!estado.preguntas.some(q => q.allergyRole)) return;
  respuestas.s01_alergias = estado.preguntas.filter(q => q.allergyRole === 'type' && esPreguntaAplicable(q, respuestas, estado.preguntas))
    .flatMap(q => {
      const sustancia = estado.preguntas.find(p => p.allergyRole === 'substance' && p.allergyIndex === q.allergyIndex);
      return q.options?.some(o => o.value === respuestas[q.id] && o.requiresFollowUp) && sustancia && normalizarRespuesta(sustancia, respuestas[sustancia.id]).valido
        ? [{ tipo: respuestas[q.id], sustancia: respuestas[sustancia.id].trim() }] : [];
    });
}

export function siguientePregunta(estado: EstadoFase1, respuestas: Record<string, any>): PreguntaFase1 | undefined {
  for (const q of estado.preguntas) {
    if (!esPreguntaAplicable(q, respuestas, estado.preguntas)) continue;
    if (q.id.startsWith('s01_') && !['s01_diagnosticado_peso', 's01_atleta'].includes(q.id)) {
      // Los seguimientos clínicos aparecen justo después de la medición relevante.
      if (tiene(respuestas, q.id) && ['s01_peso_actual', 's01_grasa_corporal'].includes(q.id)) {
        for (const id of ['s01_diagnosticado_peso', 's01_atleta']) {
          if (!tiene(respuestas, id) && seguimiento(id, respuestas)) return estado.preguntas.find(p => p.id === id);
        }
      }
    }
    if (['s01_diagnosticado_peso', 's01_atleta'].includes(q.id) && !seguimiento(q.id, respuestas)) continue;
    if (!tiene(respuestas, q.id) || !normalizarRespuesta(q, respuestas[q.id]).valido) return q;
  }
  return undefined;
}

/** Avance de esta fase, independiente del porcentaje global de la preconsulta. */
export function calcularProgresoFase1(estado: EstadoFase1, respuestas: Record<string, any>): {
  porcentaje: number; pasosCompletados: number; totalPasos: number;
} {
  const ids = estado.preguntasProgreso ? new Set(estado.preguntasProgreso) : undefined;
  const aplicables = estado.preguntas.filter(q => !q.allergyRole && (!ids || ids.has(q.id)) && esPreguntaAplicable(q, respuestas, estado.preguntas) &&
    (!['s01_diagnosticado_peso', 's01_atleta'].includes(q.id) || seguimiento(q.id, respuestas)));
  const respondidas = aplicables.filter(q => tiene(respuestas, q.id) && normalizarRespuesta(q, respuestas[q.id]).valido).length;
  const pendienteCIUO = !!estado.ciuoCandidatos?.length;
  // Revisar y confirmar el resumen es el último paso; llegar al resumen aún no es finalizar.
  const confirmacion = estado.confirmada && !pendienteCIUO && !siguientePregunta(estado, respuestas) ? 1 : 0;
  const tipoAlergia = estado.preguntas.find(q => q.allergyRole === 'type' && q.allergyIndex === 1);
  const sinAlergias = tipoAlergia && respuestas[tipoAlergia.id] === 'sin_alergias_conocidas';
  const sustancias = estado.preguntas.filter(q => q.allergyRole === 'substance' && esPreguntaAplicable(q, respuestas, estado.preguntas));
  const cierres = estado.preguntas.filter(q => q.allergyRole === 'more' && esPreguntaAplicable(q, respuestas, estado.preguntas));
  const pasosAlergia = !tipoAlergia ? 0 : sinAlergias ? 3 :
    (normalizarRespuesta(tipoAlergia, respuestas[tipoAlergia.id]).valido ? 1 : 0) +
    (sustancias.some(q => normalizarRespuesta(q, respuestas[q.id]).valido) ? 1 : 0) +
    (cierres.length && respuestas[cierres[cierres.length - 1].id] === 'no' ? 1 : 0);
  const totalPasos = aplicables.length + (tipoAlergia ? 3 : 0) + 1 + (pendienteCIUO ? 1 : 0);
  const pasosCompletados = respondidas + pasosAlergia + confirmacion;
  return { porcentaje: Math.floor(100 * pasosCompletados / totalPasos), pasosCompletados, totalPasos };
}

/** La selección de tipo determina si se requiere identificar la sustancia. */
export function obtenerSeguimientoAlergia(estado: EstadoFase1, respuestas: Record<string, any>): { tipo: string; requerido: boolean } | undefined {
  const opcion = estado.preguntas.find(q => q.id === 's01_tipo_alergia')?.options?.find(o => o.value === respuestas.s01_tipo_alergia);
  return opcion ? { tipo: opcion.value, requerido: opcion.requiresFollowUp === true } : undefined;
}

const textos: Record<string, string> = {
  s01_nombre: 'Para dirigirnos a ti, ¿cuál es tu nombre completo?',
  s01_nacimiento: '¿Cuál es tu fecha de nacimiento? Puedes escribirla como día, mes y año.',
  s01_edad: '¿Cuántos años tienes?',
  s01_sexo: 'Para completar tus datos de salud, ¿cuál es tu sexo biológico?',
  s01_identidad_genero: '¿Con qué identidad de género te identificas?',
  s01_educacion: 'Cuéntame un poco sobre tu formación: ¿cuál es tu nivel educativo?',
  s01_ocupacion: '¿A qué te dedicas actualmente? Busca tu ocupación y elige la opción que mejor te describa. Si no aparece, puedes escribirla.',
  s01_anos_ocupacion: '¿Cuántos años llevas en esa ocupación?',
  s01_jornada: 'Para conocer un poco mejor tu día a día, ¿cómo es tu jornada de trabajo?',
  s01_contacto_emergencia: '¿A quién podemos contactar en una emergencia? Indica su nombre y teléfono. Si no tienes a nadie como contacto, puedes decírmelo.',
  s01_como_nos_conociste: 'Antes de seguir, ¿cómo nos conociste?',
  s01_talla: 'Ahora vamos con algunas medidas que ayudarán a preparar tu consulta. ¿Cuánto mides en centímetros?',
  s01_peso_actual: '¿Cuál es tu peso actual en kilogramos?',
  s01_grasa_corporal: '¿Conoces tu porcentaje de grasa corporal? Si no lo sabes, está bien indicarlo.',
  s01_masa_muscular: '¿Conoces tu porcentaje de masa muscular? También puedes indicar que no lo sabes.',
  s01_perimetro_abdominal: '¿Conoces la medida de tu perímetro abdominal en centímetros? Si no la tienes, puedes indicarlo.',
  s01_peso_12meses: 'Pensando en los últimos doce meses, ¿cómo ha cambiado tu peso?',
  s01_medicion_electronica: '¿Has utilizado algún aparato electrónico para conocer tus medidas corporales?',
  s01_dispositivos: '¿Utilizas algún dispositivo para seguir tu salud? Puedes marcar los que uses habitualmente o elegir «Ninguno».',
  s03_sintomas_tabla: 'Ahora cuéntame qué molestias te gustaría trabajar en la consulta. Puedes registrar cada síntoma con sus detalles, empezando por el que más te preocupa.',
  s03_limitacion: 'En tu día a día, ¿cuánto afectan estas molestias a tus actividades?',
  s03_que_hacias_bien: 'Piensa en una época en que te sentías bien. ¿Qué hacías entonces que te ayudaba a sentirte así?',
  s03_evento_inicio: '¿Recuerdas algún cambio o situación que coincidiera con el inicio o empeoramiento de las molestias?',
  s03_objetivo_a: 'Pensando en lo que esperas de la consulta, ¿qué te gustaría mejorar primero en tu salud?',
  s03_objetivo_b: '¿Hay otro objetivo de bienestar que quieras trabajar?',
  s03_disposicion: 'Para avanzar hacia esos objetivos, ¿cómo te sientes ante la idea de hacer cambios en tus hábitos?',
};

export function aclararPregunta(q: PreguntaFase1, mensaje: string, historial: { rol: string; texto: string }[]): string {
  if (q.id === 's01_contacto_emergencia') {
    const texto = norm(mensaje);
    const tieneTelefono = mensaje.replace(/\D/g, '').length >= 7;
    const ultimaIA = [...historial].reverse().find(m => m.rol === 'ia')?.texto || '';
    if (!tieneTelefono && !/no (?:tengo|se|conozco).*(?:numero|telefono)/.test(texto)) {
      return 'Para guardar ese contacto me falta su número de teléfono. ¿Cuál es? Si no tienes contacto de emergencia o prefieres no compartirlo, puedes decirlo.';
    }
    if (tieneTelefono && !/[a-záéíóúñ]/i.test(mensaje) && !/numero de telefono/i.test(ultimaIA)) {
      return 'Ya tengo el número. ¿Cómo se llama la persona a la que podemos contactar?';
    }
    return 'Podemos dejar el contacto sin registrar si no tienes uno o prefieres no compartirlo. Si deseas agregarlo, indícame el nombre y un teléfono de esa persona.';
  }
  if (q.type === 'single' || q.type === 'checkbox') return `Para registrar tu respuesta, puedes elegir ${q.type === 'single' ? 'una de las opciones' : 'las opciones que correspondan'} que aparecen aquí. ${textos[q.id] || q.text}`;
  if (q.type === 'scale') return `Para esta medida puedes usar el control que aparece aquí${q.required === false ? ' o indicar que no la conoces' : ''}. ${textos[q.id] || q.text}`;
  return `Quiero asegurarme de entenderte bien. ${textos[q.id] || q.text}`;
}

export function presentarPregunta(q: PreguntaFase1): Record<string, any> {
  if (['single', 'checkbox'].includes(q.type) && !q.options?.length) throw new Error(`Faltan opciones en ${q.id}`);
  if (q.type === 'search' && !q.search?.source) throw new Error(`Falta catálogo de búsqueda en ${q.id}`);
  if (q.type === 'table' && !q.columns?.length) throw new Error(`Faltan columnas en ${q.id}`);
  return { questionId: q.id, respuesta: textos[q.id] || q.text, opciones: q.options?.map(o => o.label) || [],
    questionType: q.type, busqueda: q.type === 'search' ? q.search : undefined,
    tipoOpciones: q.type === 'table' ? 'tabla_dinamica' : ['single', 'checkbox', 'scale', 'search'].includes(q.type) ? q.type : 'single',
    columnas: q.columns || [], scaleData: q.type === 'scale' ? { min: q.min, max: q.max, step: q.step, minLabel: q.minLabel, maxLabel: q.maxLabel, required: q.required !== false } : undefined,
    finConversacion: false };
}

export function cierreDeterminista(respuestas: Record<string, any>, preguntas: PreguntaFase1[] = []): Record<string, any> {
  const alergia = preguntas.find(q => q.id === 's01_tipo_alergia')?.options?.find(o => o.value === respuestas.s01_tipo_alergia)?.label;
  const familiares = respuestas.s01_enfermedades_familia;
  const antecedentes = familiares?.estado === 'registradas' ? familiares.familiares.map((f: any) => `${f.parentesco.descripcion}: ${f.enfermedades.map((e: any) => e.nombre).join(', ')}`).join('; ') : familiares?.estado === 'no_conoce' ? 'No conoces enfermedades en tu familia' : '';
  const resumen = [respuestas.s03_sintoma_principal, ...(Array.isArray(respuestas.s03_sintomas_tabla)
    ? respuestas.s03_sintomas_tabla.map((row: any) => Object.entries(row).map(([k, v]) => `${k}: ${v}`).join('; ')) : []),
    Array.isArray(respuestas.s01_alergias) && respuestas.s01_alergias.length ? `Alergias referidas: ${respuestas.s01_alergias.map((a: { tipo: string; sustancia: string }) => `${preguntas.find(q => q.id === 's01_tipo_alergia')?.options?.find(o => o.value === a.tipo)?.label || a.tipo}: ${a.sustancia}`).join('; ')}` : alergia ? `Alergias referidas: ${alergia}` : '',
    antecedentes ? `Antecedentes familiares referidos: ${antecedentes}` : '',
    respuestas.s01_medicamentos_actuales?.estado === 'toma' ? `Medicamentos que refieres tomar actualmente: ${respuestas.s01_medicamentos_actuales.medicamentos.map((m: any) => m.nombre).join('; ')}` : respuestas.s01_medicamentos_actuales?.estado === 'no_toma' ? 'Refieres que no tomas medicamentos actualmente' : '',
    respuestas.s03_evento_inicio ? `Relacionas el inicio o empeoramiento con: ${respuestas.s03_evento_inicio}` : '',
    respuestas.s03_que_hacias_bien ? `Recuerdas sentirte mejor cuando: ${respuestas.s03_que_hacias_bien}` : '',
    preguntas.find(q => q.id === 's03_limitacion')?.options?.find(o => o.value === respuestas.s03_limitacion)?.label,
    respuestas.s03_objetivo_a ? `Tu primer objetivo: ${respuestas.s03_objetivo_a}` : '',
    respuestas.s03_objetivo_b ? `Otro objetivo: ${respuestas.s03_objetivo_b}` : ''].filter(Boolean);
  return { questionId: null, respuesta: 'Gracias. Revisemos lo que me has contado antes de continuar.', opciones: [], tipoOpciones: 'single',
    resumenItems: resumen, enfoqueAbordaje: 'En Crisal-IA organizaremos lo que nos has contado sobre tus molestias, su evolución y tus objetivos para que tu médico pueda revisar el caso contigo y definir los siguientes pasos.',
    informeResumen: 'Este resumen recoge lo que compartiste durante la primera parte de tu entrevista. Tu médico revisará la evolución de las molestias y tus objetivos en la consulta.',
    causas: [], cierreEstado: 'pendiente',
    finConversacion: true, finFaseInicial: true };
}
