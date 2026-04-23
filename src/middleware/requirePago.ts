import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import PagoSimulado from '../models/PagoSimulado';

/**
 * Middleware que verifica que el paciente tenga la cuota 1 pagada.
 * Aplica a rutas que requieren haber iniciado el proceso de pago.
 */
export const requireCuota1 = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const cuota1 = await PagoSimulado.findOne({ pacienteId, cuota: 1, estado: 'pagado' });
    if (!cuota1) {
      res.status(403).json({
        mensaje: 'Acceso restringido. Se requiere haber completado la Cuota 1.',
        requierePago: true,
        redirigirA: '/paciente/pago'
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ mensaje: 'Error verificando estado de pago.' });
  }
};
