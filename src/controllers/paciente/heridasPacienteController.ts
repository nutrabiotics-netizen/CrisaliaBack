import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middleware/auth';
import Cita from '../../models/Cita';
import Medico from '../../models/Medico';

export const infoCitaHeridas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const cita = await Cita.findOne({ _id: citaId, pacienteId }).lean();
    if (!cita) { res.status(404).json({ success: false, message: 'Cita no encontrada' }); return; }

    const medico: any = await Medico.findById(cita.medicoId).select('nombre apellido especialidad foto').lean();

    res.json({
      success: true,
      data: {
        citaId: String(cita._id),
        pacienteId: String(cita.pacienteId),
        medicoId: String(cita.medicoId),
        medicoNombre: medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : '',
        medicoEspecialidad: medico?.especialidad ?? '',
        fecha: cita.fecha,
        hora: cita.hora,
        modulo: (cita as any).modulo ?? 'general'
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error', error: error.message });
  }
};
