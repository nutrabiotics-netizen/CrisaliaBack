import { randomUUID, createHash } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Paciente from '../../models/Paciente';
import Interrogatorio from '../../models/Interrogatorio';
import { guardarRDAInicial } from '../../services/paciente/registroRDAInicialService';
import { AppError, handleError } from '../../utils/errors';
import { buscarCIE10, obtenerCIE10 } from '../../utils/buscarCIE10';
import { buscarCUM, obtenerCUM } from '../../utils/buscarCUM';
import { buscarCIUO, obtenerCIUO } from '../../utils/buscarCIUO';
import { registrarAccion } from '../../utils/auditoriaHelper';
import { cargarSecciones } from '../../services/ai/anamnesisOrchestratorService';
import { interpretarTurnoFase1, generarCierrePersonalizadoFase1 } from '../../services/ai/fase1Interpreter';
import { agregarSeguimientos, cierreDeterminista, EstadoFase1, normalizarRespuesta, preguntasIniciales,
  presentarPregunta, respuestasDelPerfil, siguientePregunta, PreguntaFase1, declaracionSinContacto,
  aclararPregunta, datosParaCierre, calcularProgresoFase1, obtenerSeguimientoAlergia, esPreguntaAplicable, agregarOtraAlergia, actualizarRegistroAlergias } from '../../services/ai/fase1Flow';

const preguntaCIUO = (s: EstadoFase1): PreguntaFase1 => ({ id: '_ciuo', text: '¿Cuál de estas describe mejor tu ocupación actual?', type: 'single',
  options: [...(s.ciuoCandidatos || []).map(c => ({ value: c.codigo, label: c.nombre })), { value: 'ninguna', label: 'Ninguna de estas' }] });

async function respuestaConRDA(doc: any, respuesta: Record<string, any>) {
  if (!doc?.fase1?.confirmada) return respuesta;
  try {
    const registro = await guardarRDAInicial(doc);
    return { ...respuesta, registroRDAInicialId: registro?._id.toString() };
  } catch (error: any) {
    console.warn('[Fase1] guardado RDA inicial fallido', { name: error.name, code: error.code,
      camposIndice: error.keyPattern ? Object.keys(error.keyPattern) : undefined });
    throw new AppError('La entrevista está guardada, pero falta guardar el borrador RDA. Reintenta la misma respuesta.', 503);
  }
}

export const buscarOcupacionesFase1 = (req: AuthRequest, res: Response): void => {
  const texto = req.query.buscar;
  if (typeof texto !== 'string' || texto.length > 100) {
    res.status(400).json({ success: false, message: 'Escribe una búsqueda de hasta 100 caracteres.' });
    return;
  }
  res.json({ success: true, data: texto.trim().length >= 3 ? buscarCIUO(texto.trim(), 10) : [] });
};

export const buscarEnfermedadesFase1 = (req: AuthRequest, res: Response): void => {
  const texto = req.query.buscar;
  if (typeof texto !== 'string' || texto.length > 100) {
    res.status(400).json({ success: false, message: 'Escribe una búsqueda de hasta 100 caracteres.' }); return;
  }
  res.json({ success: true, data: texto.trim().length >= 3 ? buscarCIE10(texto.trim()) : [] });
};

export const buscarMedicamentosFase1 = (req: AuthRequest, res: Response): void => {
  const texto = req.query.buscar;
  if (typeof texto !== 'string' || texto.length > 100) {
    res.status(400).json({ success: false, message: 'Escribe una búsqueda de hasta 100 caracteres.' }); return;
  }
  res.json({ success: true, data: texto.trim().length >= 3 ? buscarCUM(texto.trim()) : [] });
};

export const responderFase1 = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) throw new AppError('No autenticado', 401);
    const { mensajeUsuario, interrogatorioId, requestId, version, questionId, accion, valorRespuesta } = req.body;
    const zonas = req.body.zonasDolorMarcadas;
    if (interrogatorioId !== undefined && (typeof interrogatorioId !== 'string' || !/^[a-f\d]{24}$/i.test(interrogatorioId))) throw new AppError('Interrogatorio inválido', 400);
    if (accion !== 'reanudar' && (typeof mensajeUsuario !== 'string' || !mensajeUsuario.trim() || mensajeUsuario.length > 16000 ||
      typeof requestId !== 'string' || !requestId || requestId.length > 100)) throw new AppError('Mensaje y requestId requeridos', 400);
    if (zonas !== undefined && (!Array.isArray(zonas) || zonas.length > 30 || zonas.some(z => typeof z !== 'string' || z.length > 100))) throw new AppError('Zonas inválidas', 400);

    let doc = await Interrogatorio.findOne({ ...(interrogatorioId ? { _id: interrogatorioId } : {}), pacienteId,
      tipo: 'primera_vez', estado: { $in: ['pendiente', 'en_proceso'] } }).sort({ createdAt: -1 }).lean();
    if (!doc && interrogatorioId) throw new AppError('Interrogatorio no encontrado', 404);
    if (accion === 'reanudar') {
      if (!doc?.fase1?.ultimaRespuesta) throw new AppError('No hay una sesión de fase 1 para retomar', 404);
      res.json({ success: true, data: await respuestaConRDA(doc, { ...doc.fase1.ultimaRespuesta, interrogatorioId: doc._id.toString(), historial: doc.fase1.historial, progresoFase1: calcularProgresoFase1(doc.fase1, doc.respuestas || {}) }) });
      return;
    }
    let existente = doc?.fase1 as EstadoFase1 | undefined;
    const repetido = existente?.turnos.find(t => t.id === requestId);
    if (repetido) { res.json({ success: true, data: await respuestaConRDA(doc, repetido.respuesta) }); return; }
    if (existente && (version !== existente.version || questionId !== existente.preguntaId)) {
      throw new AppError('La entrevista cambió en otra pestaña. Recarga para retomar la pregunta guardada.', 409);
    }
    if (existente?.estado === 'alerta') { res.json({ success: true, data: existente.ultimaRespuesta }); return; }
    if (existente?.confirmada && accion !== 'regenerar_cierre') throw new AppError('La fase inicial ya está confirmada. Recarga para continuar.', 409);

    let r: Record<string, any> = { ...(doc?.respuestas || {}) };
    let estado: EstadoFase1;
    if (existente) {
      estado = structuredClone(existente);
    } else {
      const paciente = await Paciente.findById(pacienteId).select('nombre apellido email telefono fechaNacimiento sexoBiologico genero ocupacion escolaridad direccion ocupacionCIUO').lean();
      if (!paciente) throw new AppError('Paciente no encontrado', 404);
      const secciones = cargarSecciones(['s01', 's03']);
      const preguntaAlergia = secciones.s01?.questions?.find((q: PreguntaFase1) => q.id === 's01_tipo_alergia');
      if (!secciones.s01?.questions?.length || !preguntaAlergia || !secciones.s03?.questions?.length) throw new AppError('No se pudo cargar el cuestionario. Intenta más tarde.', 503);
      r = { ...respuestasDelPerfil(paciente), ...r };
      if (r.s01_identidad_genero?.codigo) r.s01_identidad_genero = r.s01_identidad_genero.codigo;
      estado = { version: 0, estado: 'recopilando', preguntaId: null,
        preguntas: agregarSeguimientos(preguntasIniciales([...secciones.s01.questions, ...secciones.s03.questions], paciente)),
        historial: (r.historialChat || []).filter((m: any) => ['usuario', 'ia'].includes(m.rol) && typeof m.texto === 'string'), turnos: [] };
      estado.preguntasProgreso = estado.preguntas.filter(q => !Object.prototype.hasOwnProperty.call(r, q.id) || !normalizarRespuesta(q, r[q.id]).valido).map(q => q.id);
      estado.ultimaRespuesta = { progresoFase1: calcularProgresoFase1(estado, r), respuesta: 'Cuéntame qué molestia o problema de salud quieres consultar.', opciones: [], tipoOpciones: 'single',
        questionId: null, fase1Version: 0, fase1Estado: 'recopilando', finConversacion: false };
      // Crear la sesión antes de interpretar. Una recarga nunca confunde este documento con fase 2.
      if (!doc) {
        doc = await Interrogatorio.findOneAndUpdate({ pacienteId, tipo: 'primera_vez', estado: { $in: ['pendiente', 'en_proceso'] } },
          { $setOnInsert: { pacienteId, tipo: 'primera_vez', estado: 'en_proceso', progreso: 0, respuestas: r, fase1: estado, creadoPor: pacienteId, creadoPorRol: 'Paciente' } },
          { upsert: true, new: true }).lean();
        if (!doc) throw new AppError('No se pudo crear la sesión', 503);
        if (doc.fase1?.version !== 0 || doc.fase1.turnos.length) throw new AppError('Ya hay una entrevista activa. Recarga para retomarla.', 409);
        existente = doc.fase1;
      }
    }
    // Conservar respuestas de la versión anterior que ubicó esta pregunta en s02.
    if (estado.preguntas.some(q => q.id === 's02_tipo_alergia')) {
      estado.preguntas = estado.preguntas.map(q => q.id === 's02_tipo_alergia' ? { ...q, id: 's01_tipo_alergia' } : q);
      if (estado.preguntaId === 's02_tipo_alergia') estado.preguntaId = 's01_tipo_alergia';
      estado.preguntasProgreso = estado.preguntasProgreso?.map(id => id === 's02_tipo_alergia' ? 's01_tipo_alergia' : id);
      if (r.s01_tipo_alergia === undefined && r.s02_tipo_alergia !== undefined) r.s01_tipo_alergia = r.s02_tipo_alergia;
      delete r.s02_tipo_alergia;
    }
    // Incorporar la nueva pregunta a entrevistas que todavía recopilan respuestas, sin reabrir cierres confirmados.
    if (existente && estado.estado === 'recopilando' && !estado.confirmada && !estado.preguntas.some(q => q.id === 's01_tipo_alergia')) {
      const preguntaAlergia = cargarSecciones(['s01']).s01?.questions?.find((q: PreguntaFase1) => q.id === 's01_tipo_alergia');
      if (!preguntaAlergia) throw new AppError('No se pudo cargar la pregunta de alergias. Intenta más tarde.', 503);
      const posicion = estado.preguntas.findIndex(q => q.id.startsWith('s03_') && q.id !== 's03_sintoma_principal');
      estado.preguntas.splice(posicion < 0 ? estado.preguntas.length : posicion, 0, preguntaAlergia);
      if (estado.preguntasProgreso && !estado.preguntasProgreso.includes(preguntaAlergia.id)) estado.preguntasProgreso.push(preguntaAlergia.id);
    }
    // Actualizar solo entrevistas que siguen recopilando datos; conservar la categoría ya respondida.
    if (estado.estado === 'recopilando' && !estado.confirmada &&
      (!estado.preguntas.some(q => q.id === 's01_sustancia_alergia') || !estado.preguntas.some(q => q.id === 's01_mas_alergias'))) {
      const bloque = cargarSecciones(['s01']).s01?.questions?.filter((q: PreguntaFase1) => ['s01_tipo_alergia', 's01_sustancia_alergia', 's01_mas_alergias'].includes(q.id));
      if (bloque?.length !== 3) throw new AppError('No se pudo cargar el bloque de alergias. Intenta más tarde.', 503);
      const posicion = estado.preguntas.findIndex(q => q.id === 's01_tipo_alergia');
      const ids = bloque.map((q: PreguntaFase1) => q.id);
      estado.preguntas = estado.preguntas.filter(q => !ids.includes(q.id));
      estado.preguntas.splice(posicion, 0, ...bloque);
      if (estado.preguntasProgreso) estado.preguntasProgreso = [...new Set([...estado.preguntasProgreso, ...ids])];
    }
    if (estado.estado === 'recopilando' && !estado.confirmada && !estado.preguntas.some(q => q.id === 's01_enfermedades_familia')) {
      const familiar = cargarSecciones(['s01']).s01?.questions?.find((q: PreguntaFase1) => q.id === 's01_enfermedades_familia');
      if (!familiar) throw new AppError('No se pudo cargar la pregunta de antecedentes familiares.', 503);
      const posicion = estado.preguntas.findIndex(q => q.id.startsWith('s03_') && q.id !== 's03_sintoma_principal');
      estado.preguntas.splice(posicion < 0 ? estado.preguntas.length : posicion, 0, familiar);
      estado.preguntasProgreso?.push(familiar.id);
    }
    if (estado.estado === 'recopilando' && !estado.confirmada && !estado.preguntas.some(q => q.id === 's01_medicamentos_actuales')) {
      const medicamentos = cargarSecciones(['s01']).s01?.questions?.find((q: PreguntaFase1) => q.id === 's01_medicamentos_actuales');
      if (!medicamentos) throw new AppError('No se pudo cargar la pregunta de medicamentos.', 503);
      const posicion = estado.preguntas.findIndex(q => q.id.startsWith('s03_') && q.id !== 's03_sintoma_principal');
      estado.preguntas.splice(posicion < 0 ? estado.preguntas.length : posicion, 0, medicamentos);
      estado.preguntasProgreso?.push(medicamentos.id);
    }
    const editando = estado.estado === 'resumen';
    const ocupacionAnterior = r.s01_ocupacion;
    const pregunta = estado.ciuoCandidatos?.length ? preguntaCIUO(estado) : estado.preguntas.find(q => q.id === estado.preguntaId);
    let aceptada = !pregunta && !editando;
    let aclaracion = '';
    let urgente = false, presencial = false;
    let comentario = '';

    if (accion === 'confirmar' || accion === 'regenerar_cierre') {
      if (!editando) throw new AppError('Completa las preguntas antes de confirmar.', 409);
      if (accion === 'confirmar') estado.confirmada = true;
      aceptada = true;
    } else if (pregunta?.type === 'search' && pregunta.search?.source === 'medicamentos') {
      const codigos = valorRespuesta?.codigos ?? [];
      const manuales = valorRespuesta?.noEncontrados ?? [];
      if (!Array.isArray(codigos) || !Array.isArray(manuales) || codigos.length + manuales.length > 30 ||
          (valorRespuesta?.sinDatos === true && (codigos.length || manuales.length))) throw new AppError('Revisa los medicamentos seleccionados.', 400);
      let respuesta;
      if (valorRespuesta?.sinDatos === true && pregunta.search.unknownLabel) {
        respuesta = { estado: 'no_toma', medicamentos: [] };
      } else {
        const medicamentos = codigos.map((codigo: unknown) => {
          const entrada = typeof codigo === 'string' ? obtenerCUM(codigo) : undefined;
          if (!entrada) throw new AppError('Selecciona un medicamento válido del catálogo.', 400);
          return { codigo: entrada.codigo, nombre: entrada.nombre };
        });
        const declarados = manuales.map((nombre: unknown) => {
          if (!pregunta.search?.allowCustom || typeof nombre !== 'string' || !nombre.trim() || nombre.length > 1000) throw new AppError('Escribe el nombre del medicamento que no aparece.', 400);
          return { codigo: null, nombre: nombre.trim(), origen: 'declarado' };
        });
        const unicos = [...new Map([...medicamentos, ...declarados].map(m => [m.codigo ?? `texto:${m.nombre.toLocaleLowerCase('es')}`, m])).values()];
        respuesta = { estado: 'toma', medicamentos: unicos };
      }
      if (!normalizarRespuesta(pregunta, respuesta).valido) throw new AppError('Selecciona tus medicamentos o indica «No tomo medicamentos».', 400);
      r[pregunta.id] = respuesta;
      aceptada = true;
    } else if (pregunta?.type === 'search' && pregunta.search?.source === 'cie10') {
      if (valorRespuesta?.sinDatos === true && pregunta.search.unknownLabel) {
        r[pregunta.id] = { estado: 'no_conoce', familiares: [] };
      } else {
        if (!Array.isArray(valorRespuesta?.familiares) || !valorRespuesta.familiares.length || valorRespuesta.familiares.length > 4) throw new AppError('Registra un parentesco y sus enfermedades.', 400);
        const vistos = new Set<string>();
        const familiares = valorRespuesta.familiares.map((f: any) => {
          const parentesco = pregunta.search?.parentescos?.find(p => p.codigo === f?.parentescoCodigo);
          if (!parentesco || vistos.has(parentesco.codigo) || !Array.isArray(f.codigos) || !f.codigos.length || f.codigos.length > 30) throw new AppError('Revisa el parentesco y las enfermedades seleccionadas.', 400);
          vistos.add(parentesco.codigo);
          const enfermedades = f.codigos.map((codigo: unknown) => {
            const entrada = typeof codigo === 'string' ? obtenerCIE10(codigo) : undefined;
            if (!entrada) throw new AppError('Selecciona una enfermedad válida del catálogo.', 400);
            return entrada;
          });
          return { parentesco, enfermedades: [...new Map(enfermedades.map((e: any) => [e.codigo, e])).values()] };
        });
        const respuesta = { estado: 'registradas', familiares };
        if (!normalizarRespuesta(pregunta, respuesta).valido) throw new AppError('No pudimos validar los antecedentes seleccionados.', 400);
        r[pregunta.id] = respuesta;
      }
      aceptada = true;
    } else if ((pregunta?.type === 'search' || pregunta?.id === 's01_ocupacion') && valorRespuesta && typeof valorRespuesta === 'object' && !Array.isArray(valorRespuesta)) {
      if (typeof valorRespuesta.codigo === 'string') {
        const source = pregunta.search?.source || 'ocupaciones';
        const ocupacion = source === 'ocupaciones' ? obtenerCIUO(valorRespuesta.codigo) : undefined;
        if (!ocupacion) throw new AppError('Elige una ocupación válida del buscador.', 400);
        r[pregunta.id] = ocupacion.nombre;
        if (pregunta.id === 's01_ocupacion') r.s01_ocupacion_ciuo = ocupacion;
      } else if (valorRespuesta.noEncontrada === true && (pregunta.search?.allowCustom === true || (!pregunta.search && pregunta.id === 's01_ocupacion')) && typeof valorRespuesta.texto === 'string' &&
        valorRespuesta.texto.trim() && valorRespuesta.texto.length <= 1000) {
        r[pregunta.id] = valorRespuesta.texto.trim();
        if (pregunta.id === 's01_ocupacion') delete r.s01_ocupacion_ciuo;
      } else throw new AppError('Selecciona tu ocupación o escríbela usando «No encuentro mi ocupación».', 400);
      delete estado.ciuoCandidatos;
      aceptada = true;
    } else if (pregunta?.id === '_ciuo') {
      const seleccion = normalizarRespuesta(pregunta, valorRespuesta ?? mensajeUsuario);
      aceptada = seleccion.valido;
      if (aceptada) {
        const candidato = estado.ciuoCandidatos?.find(c => c.codigo === seleccion.valor);
        if (candidato) r.s01_ocupacion_ciuo = candidato;
        else delete r.s01_ocupacion_ciuo;
        delete estado.ciuoCandidatos;
      }
    } else {
      const ausenciaDeclarada = pregunta?.id === 's01_contacto_emergencia' ? declaracionSinContacto(mensajeUsuario) : undefined;
      const directa = pregunta && (valorRespuesta !== undefined || ausenciaDeclarada !== undefined)
        ? normalizarRespuesta(pregunta, ausenciaDeclarada ?? valorRespuesta) : undefined;
      // Los widgets solo mandan valores canónicos; el texto libre siempre pasa por interpretación.
      if (directa?.valido) {
        r[pregunta!.id] = directa.valor;
        aceptada = true;
      } else {
        const datos = Object.fromEntries(Object.entries(r).filter(([id]) => id.startsWith('s01_') || id.startsWith('s03_')));
        const interpretacion = await interpretarTurnoFase1({ mensaje: mensajeUsuario.trim(), pregunta, preguntas: estado.preguntas,
          respuestas: datos, historial: estado.historial.slice(-8), editando });
        urgente = interpretacion.alertaUrgente === true;
        presencial = interpretacion.alertaPresencial === true;
        aclaracion = interpretacion.aclaracion?.slice(0, 600) || '';
        let cambios = 0;
        for (const item of interpretacion.respuestas) {
          const q = estado.preguntas.find(p => p.id === item.id);
          if (!q || ['cie10', 'medicamentos'].includes(q.search?.source || '') || !esPreguntaAplicable(q, r, estado.preguntas) || (!editando && Object.prototype.hasOwnProperty.call(r, item.id) && item.id !== pregunta?.id)) continue;
          // Mencionar un síntoma no responde toda la tabla clínica (duración, intensidad, etc.).
          if (!editando && q.type === 'table' && q.id !== pregunta?.id &&
            (!Array.isArray(item.valor) || !item.valor.length || !item.valor.every(row => q.columns?.every(col => typeof row?.[col] === 'string' && row[col].trim())))) continue;
          const valor = normalizarRespuesta(q, item.valor);
          if (!valor.valido) continue;
          r[q.id] = valor.valor;
          cambios++;
          if (q.id === pregunta?.id) aceptada = true;
        }
        if (editando) aceptada = cambios > 0;
      }
      if (!pregunta && !editando) r.s03_sintoma_principal = mensajeUsuario.trim();
      if (aceptada && (pregunta?.id === 's01_ocupacion' || editando)) {
        if (r.s01_ocupacion !== ocupacionAnterior) delete r.s01_ocupacion_ciuo;
        const candidatos = typeof r.s01_ocupacion === 'string' ? buscarCIUO(r.s01_ocupacion) : [];
        if (candidatos.length === 1) r.s01_ocupacion_ciuo = candidatos[0];
        else if (candidatos.length > 1 && !r.s01_ocupacion_ciuo) estado.ciuoCandidatos = candidatos;
      }
    }
    for (const q of [...estado.preguntas]) {
      if (esPreguntaAplicable(q, r, estado.preguntas)) agregarOtraAlergia(estado, q, r);
    }
    actualizarRegistroAlergias(estado, r);
    estado.historial.push({ rol: 'usuario', texto: mensajeUsuario.trim() });
    if (Array.isArray(zonas)) r.zonasDolor = zonas;
    let payload: Record<string, any>;
    if (urgente) {
      estado.estado = 'alerta';
      estado.preguntaId = null;
      payload = { respuesta: 'Lo que describes podría requerir atención médica inmediata. Comunícate con los servicios de emergencia o acude a urgencias.',
        opciones: [], tipoOpciones: 'single', finConversacion: false, alertaUrgente: true, questionId: null };
    } else if (!aceptada && editando) {
      payload = { ...cierreDeterminista(r, estado.preguntas), finConversacion: false, finFaseInicial: false,
        respuesta: aclaracion || 'Dime qué dato quieres corregir y cuál es la respuesta correcta.', editando: true };
    } else {
      const siguiente = !aceptada && pregunta ? pregunta : estado.ciuoCandidatos?.length ? preguntaCIUO(estado) : siguientePregunta(estado, r);
      estado.preguntaId = siguiente?.id || null;
      estado.estado = siguiente ? 'recopilando' : 'resumen';
      payload = siguiente ? presentarPregunta(siguiente) : cierreDeterminista(r, estado.preguntas);
      if (!siguiente) {
        const hash = createHash('sha256').update('cierre-personalizado-v1:' + JSON.stringify(datosParaCierre(r))).digest('hex');
        if (estado.cierre?.hash !== hash || accion === 'regenerar_cierre') {
          delete estado.cierre;
          try {
            const contenido = await generarCierrePersonalizadoFase1(r, estado.preguntas);
            estado.cierre = { hash, contenido, generadoEn: new Date().toISOString() };
          } catch (error) {
            // Una caída del generador nunca descarta respuestas ni vuelve a abrir preguntas.
            console.warn('[Fase1] cierre pendiente', { name: (error as Error).name });
          }
        }
        if (estado.cierre) Object.assign(payload, { resumenItems: estado.cierre.contenido.resumen,
          enfoqueAbordaje: estado.cierre.contenido.enfoque, informeResumen: estado.cierre.contenido.sintesis,
          causas: estado.cierre.contenido.causas, cierreEstado: 'generado', cierreGeneradoEn: estado.cierre.generadoEn });
      }
      // El modelo no puede anunciar otra pregunta mientras esta siga pendiente.
      // El texto, las opciones y el widget corresponden siempre al mismo ID y type.
      if (!aceptada && pregunta) payload.respuesta = aclararPregunta(pregunta, mensajeUsuario, estado.historial);
      else if (aceptada && editando && accion !== 'confirmar' && accion !== 'regenerar_cierre') comentario = 'He actualizado la información. ';
      else if (aceptada && pregunta?.id === 's01_contacto_emergencia' && declaracionSinContacto(r.s01_contacto_emergencia)) {
        comentario = 'Está bien, lo dejamos registrado sin contacto de emergencia. ';
      }
      payload.respuesta = comentario + payload.respuesta;
    }
    if (accion === 'confirmar' && payload.enfoqueAbordaje) payload.respuesta = payload.enfoqueAbordaje;
    if (presencial && !estado.alertaPresencialMostrada) {
      estado.alertaPresencialMostrada = true;
      payload.alertaPresencial = true;
      payload.respuesta = 'Lo que describes requiere valoración médica presencial. ' + payload.respuesta;
    }
    estado.version++;
    Object.assign(payload, { interrogatorioId: doc!._id.toString(), fase1Version: estado.version,
      fase1Estado: estado.estado, fase1Confirmada: estado.confirmada === true,
      seguimientoAlergia: obtenerSeguimientoAlergia(estado, r), progresoFase1: calcularProgresoFase1(estado, r), sintomaInicial: r.s03_sintoma_principal || 'Consulta general', guardado: true });
    estado.historial.push({ rol: 'ia', texto: payload.respuesta });
    estado.ultimaRespuesta = payload;
    estado.turnos = [...estado.turnos, { id: requestId || randomUUID(), respuesta: payload }].slice(-30);
    r.historialChat = estado.historial;
    if (payload.finConversacion) {
      r.mensajeFinal = mensajeUsuario.trim();
      r.causas = payload.causas || [];
      r.cierreFase1 = { resumen: payload.resumenItems, enfoque: payload.enfoqueAbordaje, sintesis: payload.informeResumen,
        causas: payload.causas || [], estado: payload.cierreEstado, generadoEn: payload.cierreGeneradoEn };
    }
    const guardado = await Interrogatorio.findOneAndUpdate({ _id: doc!._id, pacienteId,
      ...(existente ? { 'fase1.version': existente.version } : { fase1: { $exists: false } }) },
      { $set: { fase1: estado, respuestas: r, estado: 'en_proceso', progreso: payload.finConversacion ? Math.max(doc!.progreso || 0, 10) : doc!.progreso || 0,
        actualizadoPor: pacienteId, actualizadoPorRol: 'Paciente' } }, { new: true }).lean();
    if (!guardado) {
      // Dos solicitudes simultáneas con el mismo ID: devolver el resultado que ganó el CAS.
      const actual = await Interrogatorio.findOne({ _id: doc!._id, pacienteId }).lean();
      const cache = actual?.fase1?.turnos.find((t: any) => t.id === requestId);
      if (cache) { res.json({ success: true, data: await respuestaConRDA(actual, cache.respuesta) }); return; }
      throw new AppError('La entrevista cambió. Recarga para retomar la respuesta guardada.', 409);
    }
    await registrarAccion(req, 'actualizar', 'Interrogatorio', doc!._id.toString(), undefined,
      { fase: 'fase1', version: estado.version, estado: estado.estado, questionId: estado.preguntaId });
    res.json({ success: true, data: await respuestaConRDA(guardado, payload) });
  } catch (err: any) {
    // No registrar el texto clínico ni devolver éxito si la persistencia falló.
    console.warn('[Fase1] turno fallido', { code: err.statusCode || 500, name: err.name });
    handleError(err.code === 11000 ? new AppError('Ya hay una entrevista activa. Recarga para retomarla.', 409) : err, res);
  }
};
