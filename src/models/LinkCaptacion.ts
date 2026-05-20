import mongoose, { Schema, Document } from 'mongoose';

export interface ILinkCaptacion extends Document {
  codigo: string; // 8 chars alfanumérico
  tipo: 'referido' | 'evento' | 'webinar' | 'invitacion_paciente';
  medicoReferidorId?: mongoose.Types.ObjectId;
  pacienteQueInvitoId?: mongoose.Types.ObjectId;
  descuentoAsociado: number; // porcentaje 0-100
  estado: 'activo' | 'usado' | 'expirado';
  usadoPorMedicoId?: mongoose.Types.ObjectId;
  expiresAt: Date;
  creadoPor: 'admin' | 'sistema' | 'medico';
  // Datos del médico invitado (para invitaciones a médico externo)
  medicoInvitadoNombre?: string;
  medicoInvitadoTelefono?: string;
  medicoInvitadoEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LinkCaptacionSchema = new Schema<ILinkCaptacion>(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    tipo: {
      type: String,
      enum: ['referido', 'evento', 'webinar', 'invitacion_paciente'],
      required: true
    },
    medicoReferidorId: { type: Schema.Types.ObjectId, ref: 'Medico' },
    pacienteQueInvitoId: { type: Schema.Types.ObjectId, ref: 'Paciente' },
    descuentoAsociado: { type: Number, default: 0, min: 0, max: 100 },
    estado: {
      type: String,
      enum: ['activo', 'usado', 'expirado'],
      default: 'activo'
    },
    usadoPorMedicoId: { type: Schema.Types.ObjectId, ref: 'Medico' },
    expiresAt: { type: Date, required: true },
    creadoPor: {
      type: String,
      enum: ['admin', 'sistema', 'medico'],
      required: true
    },
    medicoInvitadoNombre: { type: String, trim: true },
    medicoInvitadoTelefono: { type: String, trim: true },
    medicoInvitadoEmail: { type: String, trim: true, lowercase: true }
  },
  { timestamps: true }
);

LinkCaptacionSchema.index({ estado: 1, expiresAt: 1 });

export default mongoose.model<ILinkCaptacion>('LinkCaptacion', LinkCaptacionSchema);
