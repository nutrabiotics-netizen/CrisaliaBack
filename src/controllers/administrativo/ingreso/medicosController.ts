import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Medico from '../../../models/Medico';

/** Listar médicos ya registrados en la plataforma (para Gestión de Personal y Registro) */
export const listar = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicos = await Medico.find({ activo: true })
      .select('nombre apellido especialidad')
      .sort({ nombre: 1, apellido: 1 })
      .lean();
    res.json({ success: true, data: medicos });
  } catch (error: any) {
    console.error('Error al listar médicos:', error);
    res.status(500).json({ success: false, message: 'Error al listar médicos', error: error.message });
  }
};
