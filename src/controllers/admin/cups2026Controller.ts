import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Cups2026 from '../../models/Cups2026';

export const buscarCups2026 = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    const searchTerm = (q as string)?.trim() || '';

    if (!searchTerm || searchTerm.length < 2) {
      res.json({
        success: true,
        data: []
      });
      return;
    }

    // Buscar por código o nombre (case-insensitive)
    const regex = new RegExp(searchTerm, 'i');
    const cups = await Cups2026.find({
      $or: [
        { codigo: regex },
        { nombre: regex }
      ]
    })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: cups
    });
  } catch (error: any) {
    console.error('Error al buscar CUPS2026:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar códigos CUPS',
      error: error.message
    });
  }
};
