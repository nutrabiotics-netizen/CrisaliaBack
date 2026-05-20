import mongoose, { Schema, Document } from 'mongoose';

export interface IMensajeCuidador {
  rol: 'paciente' | 'cuidador';
  contenido: string;
  timestamp: Date;
}

export interface ICuidadorIAConversacion extends Document {
  pacienteId: mongoose.Types.ObjectId;
  mensajes: IMensajeCuidador[];
  contextoIntegrado: boolean; // true cuando ya se inyectó el resumen del Interrogatorio
  createdAt: Date;
  updatedAt: Date;
}

const MensajeSchema = new Schema<IMensajeCuidador>(
  {
    rol: { type: String, enum: ['paciente', 'cuidador'], required: true },
    contenido: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const CuidadorIAConversacionSchema = new Schema<ICuidadorIAConversacion>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true
    },
    mensajes: { type: [MensajeSchema], default: [] },
    contextoIntegrado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Solo una conversación activa por paciente
CuidadorIAConversacionSchema.index({ pacienteId: 1 }, { unique: true });

export default mongoose.model<ICuidadorIAConversacion>(
  'CuidadorIAConversacion',
  CuidadorIAConversacionSchema
);
