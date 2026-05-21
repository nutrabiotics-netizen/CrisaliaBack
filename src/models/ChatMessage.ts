import mongoose, { Schema, Document } from 'mongoose';

/**
 * Mensaje de chat dentro del contexto de una cita (teleconsulta).
 * Compartido por el médico y el paciente.
 */
export const CHAT_FROM_ROLES = ['MEDICO', 'PACIENTE'] as const;
export type ChatFromRole = (typeof CHAT_FROM_ROLES)[number];

export interface IChatMessage extends Document {
  citaId: mongoose.Types.ObjectId;
  fromUserId: mongoose.Types.ObjectId;
  fromRole: ChatFromRole;
  text: string;
  /** Adjunto opcional (URL S3) — no se usa todavía pero queda preparado. */
  attachmentUrl?: string;
  attachmentType?: string;
  createdAt: Date;
  readAt?: Date | null;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    citaId: { type: Schema.Types.ObjectId, ref: 'Cita', required: true, index: true },
    fromUserId: { type: Schema.Types.ObjectId, required: true },
    fromRole: { type: String, enum: CHAT_FROM_ROLES, required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    attachmentUrl: { type: String },
    attachmentType: { type: String },
    readAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ChatMessageSchema.index({ citaId: 1, createdAt: 1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
