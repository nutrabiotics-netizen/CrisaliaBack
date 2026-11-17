import type { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../../middleware/auth';
import Cita from '../../models/Cita';
import { registrarAccion } from '../../utils/auditoriaHelper';

const ESTADOS_EDITABLES = ['pendiente', 'confirmada', 'en_espera'];
const CAMPOS_RESPUESTA = '_id modalidad actualizadoPor actualizadoPorRol updatedAt';

export const cambiarModalidadCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;
    const modalidad: unknown = req.body?.modalidad;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (typeof citaId !== 'string' || !mongoose.isValidObjectId(citaId)) {
      res.status(400).json({ success: false, message: 'Identificador de cita inválido' });
      return;
    }
    if (modalidad !== 'virtual' && modalidad !== 'presencial') {
      res.status(400).json({ success: false, message: 'La modalidad debe ser virtual o presencial' });
      return;
    }

    const anterior = await Cita.findOne({ _id: citaId, medicoId })
      .select(`${CAMPOS_RESPUESTA} estado`).lean();
    if (!anterior) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }
    if (!ESTADOS_EDITABLES.includes(anterior.estado)) {
      res.status(409).json({ success: false, message: 'Solo puedes cambiar la modalidad antes de iniciar la consulta' });
      return;
    }
    if (anterior.modalidad === modalidad) {
      res.json({ success: true, message: 'La cita ya tiene esta modalidad', data: anterior });
      return;
    }

    // Verificar de nuevo el estado al guardar para no sobrescribir un inicio o cambio simultáneo.
    const actualizada = await Cita.findOneAndUpdate(
      { _id: citaId, medicoId, estado: anterior.estado, modalidad: anterior.modalidad },
      { $set: { modalidad, actualizadoPor: medicoId, actualizadoPorRol: 'Medico' } },
      { new: true, runValidators: true },
    ).select(CAMPOS_RESPUESTA).lean();
    if (!actualizada) {
      res.status(409).json({ success: false, message: 'La cita cambió mientras guardabas. Recarga la página e inténtalo de nuevo' });
      return;
    }
    await registrarAccion(req, 'actualizar', 'Cita', citaId,
      { modalidad: anterior.modalidad },
      { modalidad: actualizada.modalidad, actualizadoPor: medicoId, actualizadoPorRol: 'Medico' },
      'Cambio de modalidad desde la preparación de consulta');
    res.json({ success: true, message: 'Modalidad actualizada correctamente', data: actualizada });
  } catch (error) {
    console.error('Error al cambiar modalidad de cita:', error);
    res.status(500).json({ success: false, message: 'No se pudo guardar la modalidad. Inténtalo de nuevo' });
  }
};
