import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import ReglaAgenda from '../../../models/ReglaAgenda';

export const listarReglas = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reglas = await ReglaAgenda.find().populate('medicoId', 'nombre apellido').sort({ tipo: 1, nombre: 1 }).lean();
    res.json({ success: true, data: reglas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al listar reglas', error: error.message });
  }
};

export const crearRegla = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rule = await ReglaAgenda.create(req.body);
    res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error crear regla', error: error.message });
  }
};

export const actualizarRegla = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rule = await ReglaAgenda.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!rule) {
      res.status(404).json({ success: false, message: 'Regla no encontrada' });
      return;
    }
    res.json({ success: true, data: rule });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error actualizar regla', error: error.message });
  }
};

export const eliminarRegla = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ReglaAgenda.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Mantenimiento regla completado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error eliminar regla', error: error.message });
  }
};
