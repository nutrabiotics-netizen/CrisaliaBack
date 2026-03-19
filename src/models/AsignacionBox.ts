import mongoose, { Schema, Document } from 'mongoose';

export interface IAsignacionBox extends Document {
  boxId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  // Guardamos la fecha normalizada sin hora
  fecha: Date;
  horaInicio: string;
  horaFin: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AsignacionBoxSchema = new Schema<IAsignacionBox>(
  {
    boxId: { type: Schema.Types.ObjectId, ref: 'BoxConsultorio', required: true },
    medicoId: { type: Schema.Types.ObjectId, ref: 'Medico', required: true },
    fecha: { type: Date, required: true, index: true },
    horaInicio: { type: String, required: true, trim: true },
    horaFin: { type: String, required: true, trim: true },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Índice para evitar conflictos de agendamiento o búsquedas rápidas
AsignacionBoxSchema.index({ boxId: 1, fecha: 1 });
AsignacionBoxSchema.index({ medicoId: 1, fecha: 1 });

export default mongoose.model<IAsignacionBox>('AsignacionBox', AsignacionBoxSchema);
