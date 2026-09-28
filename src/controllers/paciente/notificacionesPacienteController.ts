import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import NotificacionPaciente from '../../models/NotificacionPaciente';

export const listarNotificaciones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const notificaciones = await NotificacionPaciente.find({ pacienteId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const noLeidas = notificaciones.filter(n => !n.leida).length;
    res.json({ success: true, data: { notificaciones, noLeidas } });
  } catch {
    res.status(500).json({ success: false, message: 'Error al obtener notificaciones' });
  }
};

export const marcarLeida = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await NotificacionPaciente.findOneAndUpdate(
      { _id: id, pacienteId: req.userId },
      { leida: true }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Error al marcar notificación' });
  }
};

export const marcarTodasLeidas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await NotificacionPaciente.updateMany({ pacienteId: req.userId, leida: false }, { leida: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Error al marcar notificaciones' });
  }
};

export const eliminarNotificacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await NotificacionPaciente.findOneAndDelete({ _id: id, pacienteId: req.userId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Error al eliminar notificación' });
  }
};

