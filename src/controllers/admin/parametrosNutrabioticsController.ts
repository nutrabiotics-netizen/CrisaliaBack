import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ParametroNutrabiotics from '../../models/ParametroNutrabiotics';

export const buscarParametrosNutrabiotics = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const parametros = await ParametroNutrabiotics.find({
      activo: true,
      $or: [
        { codigoParametro: regex },
        { nombre: regex },
        { codigoCups: regex }
      ]
    })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: parametros
    });
  } catch (error: any) {
    console.error('Error al buscar parámetros Nutrabiotics:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar parámetros',
      error: error.message
    });
  }
};
