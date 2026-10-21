import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import Interrogatorio from '../../models/Interrogatorio';
import RegistroRDA from '../../models/RegistroRDA';
import { AppError, handleError } from '../../utils/errors';
import { cancelarPreparacionFase2 } from './fase2Controller';
import { conservarRespuestasFase1, filtroGeneracionFase2, generacionFase2, solicitudDeGeneracionActual } from '../../services/paciente/reinicioFase2Flow';

/** Herramienta de desarrollo: nunca reinicia historias ligadas a una consulta o RDA transmitido. */
export const reiniciarFase2 = async (req: AuthRequest, res: Response): Promise<void> => {
  let token: string | undefined;
  let id: string | undefined;
  try {
    if (process.env.NODE_ENV === 'production') throw new AppError('El reinicio de pruebas no está disponible en producción.', 403);
    if (!req.userId) throw new AppError('No autenticado', 401);
    id = req.params.interrogatorioId as string;
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new AppError('Interrogatorio inválido', 400);
    const { requestId, generacion } = req.body;
    if (typeof requestId !== 'string' || !requestId || requestId.length > 100) throw new AppError('requestId requerido', 400);
    const doc = await Interrogatorio.findOne({ _id: id, pacienteId: req.userId, tipo: 'primera_vez' }).lean();
    if (!doc) throw new AppError('Interrogatorio no encontrado', 404);
    if (!doc.fase1?.confirmada) throw new AppError('Debes tener la fase 1 confirmada para reiniciar solo la fase 2.', 409);
    if (doc.fase2Reinicio?.requestId === requestId && !doc.fase2Reinicio.pendiente) {
      res.json({ success: true, data: { guardado: true, generacion: generacionFase2(doc) } }); return;
    }
    if (!solicitudDeGeneracionActual(doc, generacion)) throw new AppError('La entrevista ya fue reiniciada. Recarga la página.', 409);
    const registros = await RegistroRDA.find({ pacienteId: req.userId, 'fuenteFase1.interrogatorioId': doc._id }).lean();
    if (registros.some(r => r.estado !== 'borrador' || r.tipoRegistro === 'consulta'))
      throw new AppError('Este interrogatorio está vinculado a un RDA de consulta, listo o transmitido. Usa una entrevista de pruebas con RDA inicial en borrador.', 409);
    const anterior = doc.fase2Operacion;
    if (anterior?.reiniciando && anterior.venceEn > new Date()) throw new AppError('Ya hay un reinicio en curso. Reintenta en unos segundos.', 409);
    token = randomUUID();
    const nuevaGeneracion = doc.fase2Reinicio?.pendiente ? doc.fase2Reinicio.generacion : generacionFase2(doc) + 1;
    const filtroOperacion = anterior ? { 'fase2Operacion.token': anterior.token } : { fase2Operacion: { $exists: false } };
    const reservado = await Interrogatorio.findOneAndUpdate({ _id: id, pacienteId: req.userId, ...filtroGeneracionFase2(doc), ...filtroOperacion },
      { $set: { fase2Operacion: { token, requestId, reiniciando: true, venceEn: new Date(Date.now() + 60000) },
        fase2Reinicio: { requestId, pendiente: true, generacion: nuevaGeneracion } } }, { new: true }).lean();
    if (!reservado) throw new AppError('La entrevista cambió. Reintenta el reinicio.', 409);
    if (anterior) cancelarPreparacionFase2(anterior.token);
    for (const registro of registros) {
      const limpiar = registro.seccionInterrogatorioPrincipal?.interrogatorioOposicionOrganosId?.toString() === id;
      const quitar = Object.fromEntries((limpiar ? ['oposicionDonarOrganos', 'respuestaOposicionOrganos', 'fechaRespuestaOposicionOrganos', 'interrogatorioOposicionOrganosId'] : [])
        .map(k => [`seccionInterrogatorioPrincipal.${k}`, 1]));
      if (registro.seccionInterrogatorioPrincipal?.interrogatorioDiscapacidadId?.toString() === id) {
        quitar['seccionInterrogatorioPrincipal.discapacidades'] = 1;
        quitar['seccionInterrogatorioPrincipal.interrogatorioDiscapacidadId'] = 1;
      }
      if (registro.seccionInterrogatorioPrincipal?.interrogatorioFactoresRiesgoId?.toString() === id) {
        for (const campo of ['factoresRiesgo', 'estadoFactoresRiesgo', 'interrogatorioFactoresRiesgoId']) quitar[`seccionInterrogatorioPrincipal.${campo}`] = 1;
      }
      const guardado = await RegistroRDA.findOneAndUpdate({ _id: registro._id, pacienteId: req.userId, tipoRegistro: 'inicial',
        estado: 'borrador', updatedAt: registro.updatedAt },
        { $set: { generacionPruebasFase2: nuevaGeneracion,
          ...(registro.seccionInterrogatorioPrincipal?.oposicionOrganos ? { 'seccionInterrogatorioPrincipal.oposicionOrganos':
            registro.seccionInterrogatorioPrincipal.oposicionOrganos.filter(r => r.interrogatorioId?.toString() !== id) } : {}) },
          ...(Object.keys(quitar).length ? { $unset: quitar } : {}) }, { new: true }).lean();
      if (!guardado) throw new AppError('El RDA cambió durante el reinicio. No se ha modificado ningún registro transmitido. Reintenta.', 409);
    }
    const quitar = Object.fromEntries(['fase2', 'fase2Operacion', 'analisisIA', 'historiaClinica', 'analisisFisiologicoIA',
      'recomendacionAutomatica', 'alertaMedica', 'objetivos', 'observacionesIA', 'perfilRadar'].map(k => [k, 1]));
    const guardado = await Interrogatorio.findOneAndUpdate({ _id: id, pacienteId: req.userId, 'fase2Operacion.token': token, ...filtroGeneracionFase2(doc) },
      { $set: { respuestas: conservarRespuestasFase1(doc), estado: 'en_proceso', progreso: 10,
        fase2Generacion: nuevaGeneracion, fase2Reinicio: { requestId, pendiente: false, generacion: nuevaGeneracion },
        actualizadoPor: req.userId, actualizadoPorRol: 'Paciente' }, $unset: quitar }, { new: true }).lean();
    if (!guardado) throw new AppError('No se pudo finalizar el reinicio. Reintenta la misma petición.', 409);
    token = undefined;
    res.json({ success: true, data: { guardado: true, generacion: nuevaGeneracion } });
  } catch (error: any) { handleError(error, res); }
  finally { if (token && id) await Interrogatorio.updateOne({ _id: id, 'fase2Operacion.token': token }, { $unset: { fase2Operacion: 1 } }).catch(() => {}); }
};
