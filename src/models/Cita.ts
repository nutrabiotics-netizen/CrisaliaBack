import mongoose, { Schema, Document } from 'mongoose';
import { Cita } from '../types';

export interface ICita extends Document, Omit<Cita, '_id'> {
  createdAt: Date;
  updatedAt: Date;
}

const CitaSchema = new Schema<ICita>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fecha: {
      type: Date,
      required: true
    },
    hora: {
      type: String,
      required: true
    },
    tipo: {
      type: String,
      enum: ['preconsulta', 'consulta', 'control'],
      required: true
    },
    estado: {
      type: String,
      enum: ['pendiente', 'confirmada', 'cancelada', 'completada'],
      default: 'pendiente'
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<ICita>('Cita', CitaSchema);

