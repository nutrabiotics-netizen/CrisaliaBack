import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import Interrogatorio from '../../models/Interrogatorio';
import Cita from '../../models/Cita';
import { crearNotificacionMedico } from '../../utils/notificacionHelper';
import { AppError, handleError } from '../../utils/errors';
import { registrarAccion } from '../../utils/auditoriaHelper';
import { cargarIndex, cargarSecciones, calcularScores, consultarSiguientePaso } from '../../services/ai/anamnesisOrchestratorService';
import { interpretarRespuestaFase2, resumirInformeFase2, redactarPreguntasFase2 } from '../../services/ai/fase2Interpreter';
import { EstadoFase2, catalogoFase2, contextoClinicoFase2, elegirPreguntasAgent, guardarRespuestaFase2,
  medicacionFase2, presentarPreguntaFase2, textoRespaldoFase2, respuestaGuardadaFase2, validarDecisionFase2, validarRespuestaFase2 } from '../../services/ai/fase2Flow';
import interrogatorioService from '../../services/paciente/interrogatorio/interrogatorioService';
import { contextoClinicoRDA, preguntasRDACompletas } from '../../services/paciente/preguntasRDAFlow';
import { filtroGeneracionFase2, generacionFase2, solicitudDeGeneracionActual } from '../../services/paciente/reinicioFase2Flow';

// La reserva en MongoDB protege también entre procesos; este mapa cancela trabajo local innecesario.
const preparaciones = new Map<string, AbortController>();
export const cancelarPreparacionFase2 = (token: string) => preparaciones.get(token)?.abort();

const informacionResumen = (estado: EstadoFase2) => ({ respuesta: 'Revisemos el informe de tu entrevista antes de enviarlo a tu médico.',
  resumenItems: estado.resumenPaciente || [], opciones: [], tipoOpciones: 'single', questionId: null, finRonda: false });
async function redactarRonda(preguntas: EstadoFase2['preguntas'], respuestas: Record<string, any>, signal?: AbortSignal) {
  const pendientes = preguntas.filter(q => !q.textoPaciente && !respuestaGuardadaFase2(q, respuestas));
  if (!pendientes.length) return;
  try {
    const textos = await redactarPreguntasFase2(pendientes, contextoClinicoFase2(respuestas), signal);
    pendientes.forEach((q, i) => { q.textoPaciente = textos[i].texto; });
  } catch {
    signal?.throwIfAborted();
    pendientes.forEach(q => { q.textoPaciente = textoRespaldoFase2(q); });
    console.warn('[Fase2] redacción no disponible; se conserva la selección del Agent con texto de respaldo');
  }
}

export const responderFase2 = async (req: AuthRequest, res: Response): Promise<void> => {
  let token: string | undefined;
  let id: string | undefined;
  let preparacionToken: string | undefined;
  let cancelacion: AbortController | undefined;
  try {
    const pacienteId = req.userId;
    if (!pacienteId) throw new AppError('No autenticado', 401);
    const { interrogatorioId, requestId, version, questionId, valorRespuesta, mensajeUsuario, accion } = req.body;
    id = interrogatorioId;
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new AppError('Interrogatorio inválido', 400);
    if (mensajeUsuario !== undefined && (typeof mensajeUsuario !== 'string' || mensajeUsuario.length > 16000)) throw new AppError('Mensaje inválido', 400);
    if (accion !== undefined && !['preparar', 'reanudar', 'continuar', 'confirmar', 'editar', 'aclarar', 'responder'].includes(accion)) throw new AppError('Acción inválida', 400);
    let doc = await Interrogatorio.findOne({ _id: id, pacienteId }).lean();
    if (!doc) throw new AppError('Interrogatorio no encontrado', 404);
    if (doc.fase2Reinicio?.pendiente) throw new AppError('Hay un reinicio de fase 2 pendiente. Reintenta el reinicio.', 409);
    if (!solicitudDeGeneracionActual(doc, req.body.generacion)) throw new AppError('La entrevista fue reiniciada. Recarga para continuar.', 409);
    const respuestasPrevias = doc.respuestas || {};
    const previo = doc.fase2;
    const requiereRedaccion = previo?.estado === 'preguntando' && previo.preguntas.some(q => !q.textoPaciente && !respuestaGuardadaFase2(q, respuestasPrevias));
    const repetido = previo?.turnos.find(t => t.id === requestId);
    if (repetido) { res.json({ success: true, data: { ...repetido.respuesta, ...(accion === 'reanudar' ? { historial: previo!.historial } : {}) } }); return; }
    if (doc.estado === 'completado') {
      if (mensajeUsuario || accion === 'editar' || accion === 'confirmar') throw new AppError('La entrevista ya está confirmada.', 409);
      res.json({ success: true, data: { ...previo?.ultimaRespuesta, interrogatorioId: id, fase2Estado: 'confirmada', fase2Version: previo?.version || 0,
        progreso: 100, guardado: true, finFase2: true, historial: previo?.historial || [], respuesta: previo?.ultimaRespuesta?.respuesta || 'Tu entrevista ya está completada.' } }); return;
    }
    if (doc.tipo === 'primera_vez' && !doc.fase1?.confirmada) throw new AppError('Completa y confirma la primera fase antes de continuar.', 409);
    if (doc.tipo === 'primera_vez' && accion !== 'preparar' && !(accion === 'reanudar' && previo?.estado === 'alerta')
      && !preguntasRDACompletas(doc.respuestas || {})) throw new AppError('Completa primero las preguntas de datos RDA.', 409);
    if (accion === 'preparar' && previo && !previo.examenesPendientes) throw new AppError('La preparación inicial ya terminó.', 409);
    // Reanudar es una lectura del estado guardado, sin volver a consultar al Agent.
    if (!requiereRedaccion && !mensajeUsuario && accion !== 'confirmar' && previo && previo.estado !== 'decidiendo' && !(previo.examenesPendientes && accion === 'continuar')) {
      res.json({ success: true, data: { ...previo.ultimaRespuesta, historial: previo.historial } }); return;
    }
    if (typeof requestId !== 'string' || !requestId || requestId.length > 100) throw new AppError('requestId requerido', 400);
    if (previo && (version !== previo.version || questionId !== previo.preguntaId)) throw new AppError('La entrevista cambió. Recarga para retomar la pregunta guardada.', 409);
    if (previo?.examenesPendientes && (mensajeUsuario || accion === 'confirmar')) throw new AppError('Termina primero la subida de exámenes o indica que no tienes.', 409);
    token = randomUUID();
    const filtroVersion = { ...filtroGeneracionFase2(doc), ...(previo ? { 'fase2.version': previo.version } : { fase2: { $exists: false } }) };
    const reservado = await Interrogatorio.findOneAndUpdate({ _id: id, pacienteId, estado: { $ne: 'completado' }, 'fase2Reinicio.pendiente': { $ne: true }, ...filtroVersion,
      $or: [{ fase2Operacion: { $exists: false } }, { 'fase2Operacion.venceEn': { $lt: new Date() } }] },
      { $set: { fase2Operacion: { token, requestId, preparandoExamenes: accion === 'preparar', contextoRDA: JSON.stringify(contextoClinicoRDA(respuestasPrevias)), venceEn: new Date(Date.now() + 480000) } } }, { new: true }).lean();
    if (!reservado) throw new AppError('Ya se está guardando un turno de esta entrevista. Reintenta la misma petición.', 409);
    doc = reservado;
    if (accion === 'preparar') {
      preparacionToken = token; cancelacion = new AbortController(); preparaciones.set(token, cancelacion);
    }
    const r: Record<string, any> = { ...(doc.respuestas || {}) };
    const estado: EstadoFase2 = previo ? structuredClone(previo) : { version: 0, estado: 'decidiendo', ronda: 0, preguntas: [],
      preguntaId: null, progreso: Math.min(95, doc.progreso || 0), respondidas: [], historial: [], turnos: [] };
    if (!previo && accion === 'preparar') estado.examenesPendientes = true;
    const liberarPreparacion = estado.examenesPendientes && accion === 'continuar';
    if (liberarPreparacion) {
      estado.examenesPendientes = false;
      if (estado.contextoRDA !== JSON.stringify(contextoClinicoRDA(r))) {
        estado.estado = 'decidiendo'; estado.preguntaId = null; estado.preguntas = [];
        delete estado.decision; delete estado.resumenPaciente;
      }
    }
    const index = cargarIndex();
    const secciones = cargarSecciones(index.sections.filter((s: any) => !s.for_ai_only && !['s01', 's03'].includes(s.id)).map((s: any) => s.id));
    const catalogo = catalogoFase2(secciones, r);
    if (!previo) estado.respondidas = catalogo.flatMap(q => q.type === 'symptom_table' ? (q.items || []).filter(i =>
      typeof r[i.id] === 'number' && Number.isInteger(r[i.id]) && r[i.id] >= 0 && r[i.id] <= 3).map(i => i.id) : respuestaGuardadaFase2(q, r) ? [q.id] : []);
    const cambios: Record<string, any> = {};
    const eliminar: Record<string, 1> = { fase2Operacion: 1 };
    const extras: Record<string, any> = {};
    if (liberarPreparacion && estado.estado === 'decidiendo') Object.assign(eliminar, { analisisFisiologicoIA: 1, recomendacionAutomatica: 1, alertaMedica: 1 });
    const nuevos: EstadoFase2['historial'] = [];
    let payload: Record<string, any>;
    let completada = false;

    const refrescarPresentacion = !!requiereRedaccion && !mensajeUsuario && accion !== 'confirmar';
    if (refrescarPresentacion) {
      await redactarRonda(estado.preguntas, r, cancelacion?.signal);
      payload = presentarPreguntaFase2(estado.preguntas.find(q => q.id === estado.preguntaId)!);
    } else if (liberarPreparacion && estado.estado !== 'decidiendo') {
      // Sin resultados nuevos se reutiliza la decisión ya preparada por el Agent.
      payload = { ...estado.ultimaRespuesta };
    } else if (accion === 'confirmar') {
      if (estado.estado !== 'resumen' || estado.decision?.accion !== 'generar_s37') throw new AppError('El Agent todavía no ha terminado el informe de esta entrevista.', 409);
      estado.estado = 'confirmada'; estado.progreso = 100; completada = true;
      payload = { ...informacionResumen(estado), respuesta: '✅ ¡Listo! Tu médico recibirá y valorará toda esta información antes de tu consulta. Gracias por completar tu preconsulta.', finFase2: true };
      nuevos.push({ rol: 'usuario', texto: 'Sí, está correcto' });
    } else if (accion === 'aclarar') {
      if (!mensajeUsuario?.trim() || !['resumen', 'preguntando'].includes(estado.estado)) throw new AppError('Escribe la información que quieres agregar.', 400);
      cambios.aclaraciones_fase2 = [...(Array.isArray(r.aclaraciones_fase2) ? r.aclaraciones_fase2 : []), { texto: mensajeUsuario.trim(), fecha: new Date().toISOString() }].slice(-50);
      r.aclaraciones_fase2 = cambios.aclaraciones_fase2;
      estado.estado = 'decidiendo'; estado.preguntaId = null; delete estado.decision; delete estado.resumenPaciente;
      Object.assign(eliminar, { analisisFisiologicoIA: 1, recomendacionAutomatica: 1, analisisIA: 1, historiaClinica: 1 });
      estado.progreso = Math.min(95, estado.progreso);
      payload = { respuesta: 'He guardado la información adicional. El Agent revisará nuevamente tu caso.', opciones: [], questionId: null, finRonda: true };
      nuevos.push({ rol: 'usuario', texto: mensajeUsuario.trim() });
    } else if (accion === 'editar') {
      if (!mensajeUsuario?.trim() || !['resumen', 'preguntando'].includes(estado.estado)) throw new AppError('Indica qué respuesta deseas corregir.', 400);
      const editables = catalogo.flatMap(q => {
        if (q.type !== 'symptom_table') return estado.respondidas.includes(q.id) && respuestaGuardadaFase2(q, r) ? [q] : [];
        const items = q.items?.filter(i => estado.respondidas.includes(i.id));
        return items?.length ? [{ ...q, items }] : [];
      });
      const interpretacion = await interpretarRespuestaFase2({ mensaje: mensajeUsuario.trim(), preguntas: editables, respuestas: contextoClinicoFase2(r), editando: true });
      for (const item of interpretacion.respuestas) {
        const q = editables.find(q => q.id === item.id);
        if (!q) continue;
        const valor = validarRespuestaFase2(q, item.valor);
        if (!valor.valido) continue;
        Object.assign(cambios, guardarRespuestaFase2(q, valor.valor, r));
      }
      if (interpretacion.alertaUrgente) {
        cambios.relatoAlertaFase2 = mensajeUsuario.trim(); r.relatoAlertaFase2 = mensajeUsuario.trim();
        estado.estado = 'decidiendo'; estado.preguntaId = null; delete estado.decision; delete estado.resumenPaciente;
        Object.assign(eliminar, { analisisFisiologicoIA: 1, recomendacionAutomatica: 1 });
        payload = { respuesta: 'Voy a priorizar la valoración de lo que acabas de describir.', opciones: [], questionId: null, finRonda: true };
      } else if (!Object.keys(cambios).length) {
        payload = estado.estado === 'resumen' ? informacionResumen(estado) : presentarPreguntaFase2(estado.preguntas.find(q => q.id === estado.preguntaId)!);
        payload.respuesta = interpretacion.aclaracion?.slice(0, 600) || 'Indica qué respuesta de esta fase quieres corregir y cuál es el dato correcto.';
      } else {
        estado.estado = 'decidiendo'; estado.preguntaId = null; delete estado.decision; delete estado.resumenPaciente;
        Object.assign(eliminar, { analisisFisiologicoIA: 1, recomendacionAutomatica: 1, analisisIA: 1, historiaClinica: 1 });
        estado.progreso = Math.min(95, estado.progreso);
        payload = { respuesta: 'He guardado tu corrección. El Agent revisará nuevamente el contexto.', opciones: [], questionId: null, finRonda: true };
      }
      nuevos.push({ rol: 'usuario', texto: mensajeUsuario.trim() });
    } else if (mensajeUsuario?.trim()) {
      if (estado.estado !== 'preguntando') throw new AppError('Retoma la entrevista antes de responder.', 409);
      const q = estado.preguntas.find(p => p.id === estado.preguntaId);
      if (!q) throw new AppError('No se pudo recuperar la pregunta pendiente.', 503);
      let resultado = validarRespuestaFase2(q, valorRespuesta);
      let aclaracion = '';
      let urgente = false;
      if (valorRespuesta !== undefined && !resultado.valido) throw new AppError('Revisa el valor de la respuesta seleccionada.', 400);
      if (valorRespuesta === undefined) {
        const interpretacion = await interpretarRespuestaFase2({ mensaje: mensajeUsuario.trim(), pregunta: q, preguntas: [q], respuestas: contextoClinicoFase2(r), editando: false });
        resultado = validarRespuestaFase2(q, interpretacion.respuestas.find(i => i.id === q.id)?.valor);
        aclaracion = interpretacion.aclaracion?.slice(0, 600) || '';
        urgente = interpretacion.alertaUrgente === true;
      }
      if (resultado.valido) {
        Object.assign(cambios, guardarRespuestaFase2(q, resultado.valor, r));
        estado.respondidas = [...new Set([...estado.respondidas, ...Object.keys(cambios)])];
      }
      if (urgente) {
        // El Agent conserva la responsabilidad de decidir la alerta; recibe el relato inmediatamente.
        cambios.relatoAlertaFase2 = mensajeUsuario.trim(); r.relatoAlertaFase2 = mensajeUsuario.trim();
        estado.estado = 'decidiendo'; estado.preguntaId = null;
        payload = { respuesta: 'Voy a priorizar la valoración de lo que acabas de describir.', opciones: [], questionId: null, finRonda: true };
      } else {
        const siguiente = resultado.valido ? estado.preguntas.find(p => !respuestaGuardadaFase2(p, r)) : q;
        estado.preguntaId = siguiente?.id || null; estado.estado = siguiente ? 'preguntando' : 'decidiendo';
        if (siguiente) await redactarRonda(estado.preguntas, r, cancelacion?.signal);
        payload = siguiente ? presentarPreguntaFase2(siguiente) : { respuesta: 'Tus respuestas están guardadas. Revisemos qué información necesitamos ahora.', opciones: [], questionId: null, finRonda: true };
        if (!resultado.valido) payload.respuesta = aclaracion || `Para poder registrarlo, necesito que aclares tu respuesta. ${q.textoPaciente || textoRespaldoFase2(q)}`;
      }
      nuevos.push({ rol: 'usuario', texto: mensajeUsuario.trim() });
    } else {
      if (estado.estado !== 'decidiendo') throw new AppError('La ronda actual aún tiene una pregunta pendiente.', 409);
      const contexto = contextoClinicoFase2(r);
      const scores = calcularScores(r, index.sections);
      let decision;
      let preguntas = [] as EstadoFase2['preguntas'];
      // Un segundo intento corrige una selección técnica inválida; nunca sustituye el criterio clínico del Agent.
      let errorDecision: string | undefined;
      for (let intento = 0; intento < 2; intento++) {
        decision = validarDecisionFase2(await consultarSiguientePaso({ sintomaInicial: r.s03_sintoma_principal || 'Consulta de salud',
          seccionesCompletadas: [...new Set(catalogo.filter(q => estado.respondidas.includes(q.id) || q.items?.some(i => estado.respondidas.includes(i.id))).map(q => q.seccionId))],
          scores, medicacionActual: medicacionFase2(r), resumenRespuestas: JSON.stringify(contexto),
          preguntasContestadas: catalogo.flatMap(q => [...(respuestaGuardadaFase2(q, r) ? [q.id] : []), ...(q.items || []).filter(i =>
            typeof r[i.id] === 'number' && Number.isInteger(r[i.id]) && r[i.id] >= 0 && r[i.id] <= 3).map(i => i.id)]),
          preguntasDisponibles: catalogo.filter(q => !respuestaGuardadaFase2(q, r)).map(q => ({ id: q.id, seccion: q.seccionId,
            items: q.items?.filter(i => !(typeof r[i.id] === 'number' && Number.isInteger(r[i.id]) && r[i.id] >= 0 && r[i.id] <= 3)).map(i => i.id) })),
          relatoAlerta: r.relatoAlertaFase2, errorDecision, historialReciente: estado.historial.filter(m => m.rol === 'usuario').slice(-12).map(({ rol, texto }) => ({ rol, texto })) }, {
            sessionId: preparacionToken ? `fase2-${id}-prep-${preparacionToken}` : `fase2-${id}-g${generacionFase2(doc)}`, abortSignal: cancelacion?.signal }));
        cancelacion?.signal.throwIfAborted();
        if (decision.accion !== 'entrevistar') { errorDecision = undefined; break; }
        try {
          preguntas = elegirPreguntasAgent(decision, catalogo, r);
          if (!preguntas.length) throw Error('La selección solo contiene preguntas ya respondidas');
          errorDecision = undefined; break;
        } catch (error: any) { errorDecision = error.message; }
      }
      if (!decision || errorDecision) throw new AppError('El Agent no devolvió una ronda válida. Reintenta continuar.', 503);
      estado.decision = decision; estado.contextoRDA = JSON.stringify(contextoClinicoRDA(r)); estado.ronda++;
      estado.progreso = Math.min(95, Math.max(estado.progreso, Math.min(95, decision.progreso || 0)));
      if (decision.accion === 'entrevistar') {
        await redactarRonda(preguntas, r, cancelacion?.signal);
        estado.preguntas = preguntas; estado.preguntaId = preguntas[0].id; estado.estado = 'preguntando';
        payload = presentarPreguntaFase2(preguntas[0]);
      } else if (decision.accion === 'alerta_medica') {
        estado.estado = 'alerta'; estado.preguntaId = null;
        payload = { respuesta: decision.instruccion, opciones: [], questionId: null, decision, finRonda: false };
        extras.alertaMedica = { motivo: decision.motivo, instruccion: decision.instruccion, mensajeUrgencias: decision.mensaje_urgencias || '', banderasRojas: decision.banderas_rojas || [], registradoEn: new Date() };
      } else {
        estado.estado = 'resumen'; estado.preguntaId = null; estado.progreso = 99;
        estado.resumenPaciente = [r.s03_sintoma_principal ? `Consultaste por: ${r.s03_sintoma_principal}` : 'Tu entrevista ha quedado registrada.',
          ...decision.disfunciones_probables.slice(0, 5).map(d => `El informe propone valorar con tu médico: ${d.nombre}.`),
          'Estos aspectos requieren valoración médica; no representan diagnósticos confirmados.'];
        try { estado.resumenPaciente = await resumirInformeFase2(decision, contextoClinicoFase2(r), cancelacion?.signal); }
        catch { console.warn('[Fase2] resumen legible pendiente; se conserva el informe del Agent'); }
        extras.analisisFisiologicoIA = decision.disfunciones_probables;
        extras.recomendacionAutomatica = { semaforizacion: Object.values(scores.porSeccion), recomendacionesOTC: decision.disfunciones_probables.flatMap(d => d.productos || []),
          estiloVida: [], estrategiasFuncionales: decision.disfunciones_probables, llamadoAccion: decision.nota_medico || '', generadoEn: new Date() };
        payload = informacionResumen(estado);
      }
    }
    estado.version++;
    Object.assign(payload, { interrogatorioId: id, fase2Version: estado.version, fase2Estado: estado.estado, progreso: estado.progreso,
      guardado: true, questionId: estado.preguntaId, decision: estado.decision, finFase2: completada, examenesPendientes: !!estado.examenesPendientes });
    if (refrescarPresentacion && estado.historial[estado.historial.length - 1]?.rol === 'ia' && estado.historial[estado.historial.length - 1]?.payload?.questionId === estado.preguntaId) {
      estado.historial[estado.historial.length - 1] = { rol: 'ia', texto: payload.respuesta, payload: { ...payload } };
    } else if (!estado.examenesPendientes) nuevos.push({ rol: 'ia', texto: payload.respuesta, payload: { ...payload } });
    estado.historial = [...estado.historial, ...nuevos].slice(-800);
    estado.ultimaRespuesta = payload;
    cancelacion?.signal.throwIfAborted();
    estado.turnos = [...estado.turnos, { id: requestId, respuesta: payload }].slice(-50);
    for (const campo of Object.keys(extras)) delete eliminar[campo];
    const campos = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`respuestas.${k}`, v]));
    const guardado = await Interrogatorio.findOneAndUpdate({ _id: id, pacienteId, 'fase2Operacion.token': token, ...filtroVersion },
      { $set: { ...campos, ...extras, fase2: estado, estado: completada ? 'completado' : 'en_proceso', progreso: estado.progreso, actualizadoPor: pacienteId, actualizadoPorRol: 'Paciente' },
        $unset: eliminar, $push: { 'respuestas.historialChat': { $each: nuevos.map(({ rol, texto }) => ({ rol, texto })) } } }, { new: true }).lean();
    if (!guardado) throw new AppError('La entrevista cambió antes de guardar. Reintenta la misma petición.', 409);
    token = undefined;
    await registrarAccion(req, 'actualizar', 'Interrogatorio', id, undefined, { fase: 'fase2', version: estado.version, estado: estado.estado, ronda: estado.ronda });
    if (!estado.examenesPendientes && (completada || estado.estado === 'alerta')) {
      try {
        const cita = await Cita.findOne({ pacienteId, estado: { $in: ['pendiente', 'confirmada', 'en_espera', 'en_consulta'] } }).sort({ fecha: 1 }).lean();
        if (cita?.medicoId) await crearNotificacionMedico({ medicoId: cita.medicoId.toString(), pacienteId,
          tipo: completada ? 'seguimiento_evolucion' : 'alerta_medica', categoria: 'seguimiento_clinico',
          titulo: completada ? 'Preconsulta completada' : 'Alerta médica durante la preconsulta',
          cuerpo: completada ? 'Tu paciente confirmó la entrevista. El informe del Agent está disponible para revisión.' : 'El Agent detectó una alerta médica. Revisa la información de la entrevista.',
          requiereAccion: true, accionUrl: `/medico/pacientes?pacienteId=${pacienteId}`, metadata: { interrogatorioId: id, version: estado.version } });
      } catch { console.warn('[Fase2] aviso al médico pendiente'); }
    }
    if (completada) void interrogatorioService.completarInterrogatorio(id, pacienteId).catch(() => console.warn('[Fase2] análisis posterior pendiente'));
    res.json({ success: true, data: { ...payload, ...(!mensajeUsuario && accion !== 'confirmar' ? { historial: estado.historial } : {}) } });
  } catch (error: any) {
    if (cancelacion?.signal.aborted) { handleError(new AppError('La preparación fue sustituida por los nuevos resultados.', 409), res); return; }
    console.warn('[Fase2] turno fallido', { name: error.name, code: error.statusCode || 500 });
    handleError(error, res);
  } finally {
    if (preparacionToken) preparaciones.delete(preparacionToken);
    if (token && id) await Interrogatorio.updateOne({ _id: id, 'fase2Operacion.token': token }, { $unset: { fase2Operacion: 1 } }).catch(() => {});
  }
};
