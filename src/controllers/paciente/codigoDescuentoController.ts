import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import CodigoDescuento from '../../models/CodigoDescuento';

/** POST /api/paciente/codigo-descuento/validar */
export const validarCodigoDescuento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { codigo } = req.body;
    if (!codigo) {
      res.status(400).json({ valido: false, mensaje: 'Código requerido.' });
      return;
    }

    const descuento = await CodigoDescuento.findOne({
      codigo: codigo.toUpperCase().trim(),
      activo: true,
      expiresAt: { $gt: new Date() }
    });

    if (!descuento) {
      res.json({ valido: false, mensaje: 'Código inválido o expirado.' });
      return;
    }

    if (descuento.usos >= descuento.maxUsos) {
      res.json({ valido: false, mensaje: 'Este código ya alcanzó el máximo de usos.' });
      return;
    }

    res.json({
      valido: true,
      descuento: {
        id: descuento._id,
        codigo: descuento.codigo,
        tipo: descuento.tipo,
        valor: descuento.valor,
        descripcion: descuento.tipo === 'porcentaje'
          ? `${descuento.valor}% de descuento`
          : `$${descuento.valor.toLocaleString()} de descuento`
      }
    });
  } catch (error) {
    console.error('[CodigoDescuento] Error validando:', error);
    res.status(500).json({ valido: false, mensaje: 'Error al validar el código.' });
  }
};
