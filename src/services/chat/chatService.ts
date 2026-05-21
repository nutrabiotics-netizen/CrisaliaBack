/**
 * Lógica de negocio del chat de teleconsulta. Reutilizada por:
 *  - REST (controllers paciente/medico)
 *  - WebSocket (ws/chatWs.ts)
 */

import mongoose from 'mongoose';
import Cita from '../../models/Cita';
import ChatMessage, { ChatFromRole, IChatMessage } from '../../models/ChatMessage';
import { UserRole } from '../../types';

export interface ChatMessageDTO {
  _id: string;
  citaId: string;
  fromUserId: string;
  fromRole: ChatFromRole;
  text: string;
  attachmentUrl?: string;
  attachmentType?: string;
  createdAt: string;
  readAt?: string | null;
}

function toDTO(doc: IChatMessage): ChatMessageDTO {
  return {
    _id: String(doc._id),
    citaId: String(doc.citaId),
    fromUserId: String(doc.fromUserId),
    fromRole: doc.fromRole,
    text: doc.text,
    attachmentUrl: doc.attachmentUrl,
    attachmentType: doc.attachmentType,
    createdAt: doc.createdAt.toISOString(),
    readAt: doc.readAt ? doc.readAt.toISOString() : null
  };
}

/**
 * Verifica que un usuario (médico o paciente) tenga acceso a una cita.
 * Devuelve `null` si no tiene acceso o la cita no existe.
 */
export async function getCitaForUser(
  citaId: string,
  userId: string,
  role: UserRole
): Promise<{ medicoId: string; pacienteId: string } | null> {
  if (!mongoose.Types.ObjectId.isValid(citaId)) return null;
  const cita = await Cita.findById(citaId).lean();
  if (!cita) return null;
  const medicoId = (cita as any).medicoId?.toString?.() ?? '';
  const pacienteId = (cita as any).pacienteId?.toString?.() ?? '';
  if (role === UserRole.MEDICO && medicoId === userId) return { medicoId, pacienteId };
  if (role === UserRole.PACIENTE && pacienteId === userId) return { medicoId, pacienteId };
  return null;
}

/** Lista los mensajes de una cita en orden cronológico. */
export async function listMessagesByCita(citaId: string): Promise<ChatMessageDTO[]> {
  const docs = await ChatMessage.find({
    citaId: new mongoose.Types.ObjectId(citaId)
  })
    .sort({ createdAt: 1 })
    .lean<IChatMessage[]>();
  return (docs as unknown as IChatMessage[]).map(toDTO);
}

/** Crea un nuevo mensaje en la cita. */
export async function createMessage(params: {
  citaId: string;
  fromUserId: string;
  fromRole: ChatFromRole;
  text: string;
  attachmentUrl?: string;
  attachmentType?: string;
}): Promise<ChatMessageDTO> {
  const doc = await ChatMessage.create({
    citaId: new mongoose.Types.ObjectId(params.citaId),
    fromUserId: new mongoose.Types.ObjectId(params.fromUserId),
    fromRole: params.fromRole,
    text: params.text.trim(),
    attachmentUrl: params.attachmentUrl,
    attachmentType: params.attachmentType
  });
  return toDTO(doc);
}

/** Marca como leídos todos los mensajes de la cita que envió el OTRO rol. */
export async function markMessagesRead(citaId: string, readerRole: ChatFromRole): Promise<number> {
  const senderRole: ChatFromRole = readerRole === 'MEDICO' ? 'PACIENTE' : 'MEDICO';
  const res = await ChatMessage.updateMany(
    { citaId: new mongoose.Types.ObjectId(citaId), fromRole: senderRole, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return res.modifiedCount ?? 0;
}
