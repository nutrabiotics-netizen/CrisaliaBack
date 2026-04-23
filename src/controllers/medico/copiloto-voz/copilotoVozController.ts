import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { handleError } from '../../../utils/errors';
import {
  actualizarCopilotoVozConfig,
  obtenerCopilotoVozConfig,
  obtenerEstadoSaludCopilotoVoz
} from '../../../services/medico/copiloto-voz/copilotoVozService';

export const getCopilotoVozHealth = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = obtenerEstadoSaludCopilotoVoz();
    res.status(200).json({
      success: true,
      message: 'Estado del copiloto por voz',
      data
    });
  } catch (error: unknown) {
    handleError(error instanceof Error ? error : new Error(String(error)), res);
  }
};

export const getCopilotoVozConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const data = await obtenerCopilotoVozConfig(medicoId);
    res.status(200).json({
      success: true,
      message: 'Configuración del copiloto por voz',
      data
    });
  } catch (error: unknown) {
    handleError(error instanceof Error ? error : new Error(String(error)), res);
  }
};

export const putCopilotoVozConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const body = req.body as { habilitado?: boolean };
    if (body.habilitado === undefined) {
      res.status(400).json({
        success: false,
        message: 'Debe enviar habilitado (true o false)'
      });
      return;
    }
    const data = await actualizarCopilotoVozConfig(medicoId, body);
    res.status(200).json({
      success: true,
      message: 'Configuración actualizada',
      data
    });
  } catch (error: unknown) {
    handleError(error instanceof Error ? error : new Error(String(error)), res);
  }
};
