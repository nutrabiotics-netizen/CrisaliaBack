import mongoose, { Schema, Document } from 'mongoose';

export type EstadoAsesoria = 'pendiente' | 'asignada' | 'respondida';

export interface IAsesoria extends Document {
  pacienteId: mongoose.Types.ObjectId;
  tema: string;
  descripcion: string; // Pregunta o duda del paciente
  estado: EstadoAsesoria;
  medicoId?: mongoose.Types.ObjectId; // Asignado cuando un médico toma la asesoría
  respuesta?: string;
  fechaRespuesta?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AsesoriaSchema = new Schema<IAsesoria>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
      index: true
    },
    tema: {
      type: String,
      required: true,
      trim: true
    },
    descripcion: {
      type: String,
      required: true,
      trim: true
    },
    estado: {
      type: String,
      enum: ['pendiente', 'asignada', 'respondida'],
      default: 'pendiente',
      index: true
    },
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      default: null
    },
    respuesta: {
      type: String,
      default: null
    },
    fechaRespuesta: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

AsesoriaSchema.index({ pacienteId: 1, createdAt: -1 });
AsesoriaSchema.index({ medicoId: 1, estado: 1 });
AsesoriaSchema.index({ estado: 1 });

export default mongoose.model<IAsesoria>('Asesoria', AsesoriaSchema);
