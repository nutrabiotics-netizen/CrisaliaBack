import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import HistoriaClinicaHeridas from '../../../models/HistoriaClinicaHeridas';

/**
 * GET /medico/historia-clinica-heridas/cita/:citaId
 * Devuelve la HC de heridas asociada a una cita (o null si aún no existe).
 */
export const obtenerPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const hc = await HistoriaClinicaHeridas.findOne({ citaId, medicoId, activo: true }).lean();
    res.json({ success: true, data: hc });
  } catch (error: any) {
    console.error('[HCHeridas.obtenerPorCita]', error);
    res.status(500).json({ success: false, message: 'Error al obtener HC de heridas', error: error.message });
  }
};

/**
 * POST /medico/historia-clinica-heridas/cita/:citaId
 * Crea o actualiza la HC de heridas para una cita (upsert por citaId+medicoId).
 * Body: cualquier subset de las 14 secciones.
 */
export const crearOActualizar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const { pacienteId, activo, fechaRegistro, creadoPor, creadoPorRol, _id, __v, createdAt, updatedAt, ...rest } = req.body ?? {};
    if (!pacienteId || !mongoose.isValidObjectId(pacienteId)) {
      res.status(400).json({ success: false, message: 'pacienteId requerido' });
      return;
    }

    const set: any = {
      ...rest,
      pacienteId: new mongoose.Types.ObjectId(pacienteId),
      medicoId:   new mongoose.Types.ObjectId(medicoId),
      citaId:     new mongoose.Types.ObjectId(citaId),
      actualizadoPor: new mongoose.Types.ObjectId(medicoId)
    };

    const hc = await HistoriaClinicaHeridas.findOneAndUpdate(
      { citaId, medicoId },
      {
        $set: set,
        $setOnInsert: {
          fechaRegistro: new Date(),
          creadoPor: new mongoose.Types.ObjectId(medicoId),
          creadoPorRol: 'Medico',
          activo: true
        }
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.status(200).json({ success: true, data: hc });
  } catch (error: any) {
    console.error('[HCHeridas.crearOActualizar]', error);
    res.status(500).json({ success: false, message: 'Error al guardar HC de heridas', error: error.message });
  }
};

/**
 * GET /medico/historia-clinica-heridas/paciente/:pacienteId
 * Lista las HC de heridas de un paciente atendidas por el médico (para seguimiento longitudinal).
 */
export const listarPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const pacienteId = req.params.pacienteId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(pacienteId)) { res.status(400).json({ success: false, message: 'pacienteId inválido' }); return; }

    const items = await HistoriaClinicaHeridas
      .find({ pacienteId, medicoId, activo: true })
      .sort({ fechaRegistro: -1 })
      .lean();
    res.json({ success: true, data: items });
  } catch (error: any) {
    console.error('[HCHeridas.listarPorPaciente]', error);
    res.status(500).json({ success: false, message: 'Error al listar', error: error.message });
  }
};
