/**
 * Controlador REST de chat de teleconsulta.
 * Reutilizado por las rutas de paciente y médico — el rol se infiere del JWT.
 */

import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  createMessage,
  getCitaForUser,
  listMessagesByCita,
  markMessagesRead
} from '../../../services/chat/chatService';

/** GET /:rolePrefix/chat/cita/:citaId — historial completo. */
export const getMessagesByCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const role = req.userRole as UserRole | undefined;
    const citaId = req.params.citaId as string;
    if (!userId || !role || !citaId) {
      res.status(400).json({ success: false, message: 'Solicitud inválida' });
      return;
    }
    const cita = await getCitaForUser(citaId, userId, role);
    if (!cita) {
      res.status(403).json({ success: false, message: 'No tienes acceso a esta cita' });
      return;
    }
    const messages = await listMessagesByCita(citaId);
    res.status(200).json({ success: true, messages });
  } catch (err) {
    console.error('[Chat][getMessagesByCita]', err);
    res.status(500).json({ success: false, message: 'Error al obtener el chat' });
  }
};

/** POST /:rolePrefix/chat/cita/:citaId — enviar mensaje. */
export const postMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const role = req.userRole as UserRole | undefined;
    const citaId = req.params.citaId as string;
    const { text, attachmentUrl, attachmentType } = req.body ?? {};
    if (!userId || !role || !citaId) {
      res.status(400).json({ success: false, message: 'Solicitud inválida' });
      return;
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
      return;
    }
    const cita = await getCitaForUser(citaId, userId, role);
    if (!cita) {
      res.status(403).json({ success: false, message: 'No tienes acceso a esta cita' });
      return;
    }
    const fromRole = role === UserRole.MEDICO ? 'MEDICO' : 'PACIENTE';
    const message = await createMessage({
      citaId,
      fromUserId: userId,
      fromRole,
      text,
      attachmentUrl,
      attachmentType
    });
    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('[Chat][postMessage]', err);
    res.status(500).json({ success: false, message: 'Error al enviar el mensaje' });
  }
};

/** POST /:rolePrefix/chat/cita/:citaId/leido — marcar como leídos los del otro rol. */
export const postMarkRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const role = req.userRole as UserRole | undefined;
    const citaId = req.params.citaId as string;
    if (!userId || !role || !citaId) {
      res.status(400).json({ success: false, message: 'Solicitud inválida' });
      return;
    }
    const cita = await getCitaForUser(citaId, userId, role);
    if (!cita) {
      res.status(403).json({ success: false, message: 'No tienes acceso a esta cita' });
      return;
    }
    const fromRole = role === UserRole.MEDICO ? 'MEDICO' : 'PACIENTE';
    const count = await markMessagesRead(citaId, fromRole);
    res.status(200).json({ success: true, count });
  } catch (err) {
    console.error('[Chat][postMarkRead]', err);
    res.status(500).json({ success: false, message: 'Error al marcar como leídos' });
  }
};
