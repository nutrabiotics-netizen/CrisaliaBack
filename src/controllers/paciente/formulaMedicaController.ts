import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import FormulaMedica from '../../models/FormulaMedica';

export const obtenerFormulaVigente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    // Buscamos la última fórmula generada para el paciente
    const formula = await FormulaMedica.findOne({ pacienteId })
      .sort({ createdAt: -1 })
      .populate('medicoId', 'nombre apellido especialidad')
      .lean();

    if (!formula) {
      res.status(404).json({ success: false, message: 'No hay ninguna Estrategia Terapéutica disponible' });
      return;
    }

    res.json({
      success: true,
      data: formula
    });
  } catch (error: any) {
    console.error('Error al obtener la fórmula médica vigente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la fórmula médica',
      error: error.message
    });
  }
};
