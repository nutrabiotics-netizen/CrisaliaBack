import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import Interrogatorio from '../../models/Interrogatorio';
import RegistroRDA from '../../models/RegistroRDA';
import { AppError, handleError } from '../../utils/errors';
import { guardarRDAInicial } from '../../services/paciente/registroRDAInicialService';
import { filtroOposicionRDA, quitarOposicionLegacy, completarPreguntasRDA, fechaRespuestaRDA, preguntasRDAParaRespuestas, normalizarRespuestaRDA, etiquetaRespuestaRDA, respuestaRDAValida, siguientePreguntaRDA, contextoClinicoRDA, preguntasRDACompletas } from '../../services/paciente/preguntasRDAFlow';
import { cancelarPreparacionFase2 } from './fase2Controller';
import { filtroGeneracionFase2, generacionFase2, solicitudDeGeneracionActual } from '../../services/paciente/reinicioFase2Flow';
import { crearOpcionesRespondidas } from '../../services/ai/fase1Flow';

async function obtenerDocumento(req: AuthRequest) {
  if (!req.userId) throw new AppError('No autenticado', 401);
  const id = req.params.interrogatorioId;
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new AppError('Interrogatorio inválido', 400);
  const doc = await Interrogatorio.findOne({ _id: id, pacienteId: req.userId, tipo: 'primera_vez' }).lean();
  if (!doc) throw new AppError('Interrogatorio no encontrado', 404);
  if (!doc.fase1?.confirmada) throw new AppError('Completa primero la fase 1.', 409);
  if (doc.fase2Reinicio?.pendiente) throw new AppError('Hay un reinicio de pruebas pendiente. Reintenta el reinicio.', 409);
  return doc;
}

async function sincronizarRDA(doc: Awaited<ReturnType<typeof obtenerDocumento>>) {
  try {
    const inicial = await guardarRDAInicial(doc);
    if (!inicial || inicial.estado === 'transmitido' || inicial.activo === false) return;
    const cambios = completarPreguntasRDA(inicial.seccionInterrogatorioPrincipal || {}, doc.respuestas || {}, doc._id);
    if (!Object.keys(cambios).length) return;
    const campos = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`seccionInterrogatorioPrincipal.${k}`, v]));
    // No sobrescribir un RDA transmitido ni datos registrados por el médico durante la lectura.
    await RegistroRDA.findOneAndUpdate({ _id: inicial._id, pacienteId: doc.pacienteId, estado: { $ne: 'transmitido' }, activo: { $ne: false },
      ...(generacionFase2(doc) > 0 ? { generacionPruebasFase2: generacionFase2(doc) }
        : { $or: [{ generacionPruebasFase2: { $exists: false } }, { generacionPruebasFase2: 0 }] }),
      ...filtroOposicionRDA(inicial.seccionInterrogatorioPrincipal || {}) },
      { $set: campos, $unset: quitarOposicionLegacy(inicial.seccionInterrogatorioPrincipal || {}) }, { new: true, runValidators: true }).lean();
  } catch {
    throw new AppError('Tu respuesta está guardada en la entrevista, pero falta actualizar el RDA. Reintenta para completar el guardado.', 503);
  }
}
/** Una preparación anterior a las respuestas clínicas RDA no puede decidir el informe o las preguntas definitivas. */
async function actualizarPreparacionRDA(inicial: Awaited<ReturnType<typeof obtenerDocumento>>) {
  if (!preguntasRDACompletas(inicial.respuestas || {})) return;
  let doc = inicial;
  for (let intento = 0; intento < 3; intento++) {
    const operacion = doc.fase2Operacion;
    const fase = doc.fase2;
    if (!(operacion?.preparandoExamenes || fase?.examenesPendientes) || (operacion && !operacion.preparandoExamenes)) return;
    const contexto = JSON.stringify(contextoClinicoRDA(doc.respuestas || {}));
    if ((operacion?.contextoRDA ?? fase?.contextoRDA) === contexto) {
      return !operacion && fase?.estado === 'decidiendo' ? { version: fase.version } : undefined;
    }
    const version = (fase?.version || 0) + 1;
    const guardado = await Interrogatorio.findOneAndUpdate({ _id: doc._id, pacienteId: doc.pacienteId, ...filtroGeneracionFase2(doc),
      'fase2Reinicio.pendiente': { $ne: true }, estado: { $ne: 'completado' },
      ...(fase ? { 'fase2.version': fase.version } : { fase2: { $exists: false } }),
      ...(operacion ? { 'fase2Operacion.token': operacion.token } : { fase2Operacion: { $exists: false } }) }, {
      $set: { fase2: { version, estado: 'decidiendo', ronda: fase?.ronda || 0, preguntas: [], preguntaId: null,
        progreso: Math.min(95, fase?.progreso || 10), respondidas: fase?.respondidas || [], historial: fase?.historial || [], turnos: [],
        examenesPendientes: true, contextoRDA: contexto } },
      $unset: { fase2Operacion: 1, analisisFisiologicoIA: 1, recomendacionAutomatica: 1, alertaMedica: 1 },
    }, { new: true }).lean();
    if (guardado) {
      if (operacion) cancelarPreparacionFase2(operacion.token);
      return { version };
    }
    const actual = await Interrogatorio.findOne({ _id: doc._id, pacienteId: doc.pacienteId, ...filtroGeneracionFase2(doc), 'fase2Reinicio.pendiente': { $ne: true } }).lean();
    if (!actual) throw new AppError('La entrevista cambió. Recarga para continuar.', 409);
    doc = actual;
  }
  throw new AppError('La preparación cambió mientras guardábamos el contexto RDA. Reintenta.', 409);
}

const presentar = (respuestas: Record<string, any>) => {
  const pregunta = siguientePreguntaRDA(respuestas);
  const historial = preguntasRDAParaRespuestas(respuestas).filter(p => respuestaRDAValida(p, respuestas)).flatMap(p => [
    { rol: 'ia', texto: [p.text, p.description].filter(Boolean).join('\n\n'), opcionesRespondidas: respuestas[p.id].opcionesRespondidas },
    { rol: 'usuario', texto: etiquetaRespuestaRDA(p, respuestas[p.id].valor) }]);
  return { completo: !pregunta, pregunta: pregunta || null, historial };
};

export const obtenerPreguntasRDA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await obtenerDocumento(req);
    if (doc.estado === 'completado') { res.json({ success: true, data: { ...presentar(doc.respuestas || {}), completo: true, pregunta: null, generacion: generacionFase2(doc) } }); return; }
    await sincronizarRDA(doc);
    const preparacionRDA = await actualizarPreparacionRDA(doc);
    res.json({ success: true, data: { ...presentar(doc.respuestas || {}), preparacionRDA, generacion: generacionFase2(doc) } });
  } catch (error: any) { handleError(error, res); }
};

export const responderPreguntaRDA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let doc = await obtenerDocumento(req);
    if (doc.estado === 'completado') throw new AppError('La entrevista ya está completada.', 409);
    if (!solicitudDeGeneracionActual(doc, req.body.generacion)) throw new AppError('La entrevista fue reiniciada. Recarga para continuar.', 409);
    const { questionId, valorRespuesta, requestId } = req.body;
    const pregunta = preguntasRDAParaRespuestas(doc.respuestas || {}).find(p => p.id === questionId);
    const valor = pregunta ? normalizarRespuestaRDA(pregunta, valorRespuesta) : undefined;
    if (!pregunta || valor === undefined || typeof requestId !== 'string' || !requestId || requestId.length > 100) throw new AppError('Responde la pregunta RDA con un valor válido.', 400);
    const previo = doc.respuestas?.[pregunta.id];
    if (previo) {
      if (JSON.stringify(previo.valor) !== JSON.stringify(valor)) throw new AppError('Esta pregunta ya fue respondida. Recarga para continuar.', 409);
    } else {
      if (siguientePreguntaRDA(doc.respuestas || {})?.id !== pregunta.id) throw new AppError('Responde primero la pregunta RDA pendiente.', 409);
      const respondidoEn = new Date().toISOString();
      const opcionesRespondidas = crearOpcionesRespondidas(pregunta, valor);
      const guardado = await Interrogatorio.findOneAndUpdate({ _id: doc._id, pacienteId: req.userId, estado: { $ne: 'completado' }, ...filtroGeneracionFase2(doc),
        'fase2Reinicio.pendiente': { $ne: true },
        'fase1.confirmada': true, [`respuestas.${pregunta.id}`]: { $exists: false } },
        { $set: { [`respuestas.${pregunta.id}`]: { valor, etiqueta: etiquetaRespuestaRDA(pregunta, valor), respondidoEn, fechaRespuesta: fechaRespuestaRDA(respondidoEn), requestId, opcionesRespondidas } },
          $push: { 'respuestas.historialChat': { $each: [{ rol: 'ia', texto: [pregunta.text, pregunta.description].filter(Boolean).join('\n\n'), opcionesRespondidas }, { rol: 'usuario', texto: etiquetaRespuestaRDA(pregunta, valor) }] } } },
        { new: true, runValidators: true }).lean();
      if (!guardado) throw new AppError('La entrevista cambió. Reintenta el guardado de la misma respuesta.', 409);
      doc = guardado;
    }
    await sincronizarRDA(doc);
    const preparacionRDA = await actualizarPreparacionRDA(doc);
    res.json({ success: true, data: { ...presentar(doc.respuestas || {}), guardado: true, preparacionRDA, generacion: generacionFase2(doc) } });
  } catch (error: any) { handleError(error, res); }
};
