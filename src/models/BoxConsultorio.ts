import mongoose, { Schema, Document } from 'mongoose';

export interface IBoxConsultorio extends Document {
  nombre: string;
  estado: 'disponible' | 'en_uso' | 'mantenimiento';
  notas?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BoxConsultorioSchema = new Schema<IBoxConsultorio>(
  {
    nombre: { type: String, required: true, trim: true, unique: true },
    estado: {
      type: String,
      enum: ['disponible', 'en_uso', 'mantenimiento'],
      default: 'disponible'
    },
    notas: { type: String, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model<IBoxConsultorio>('BoxConsultorio', BoxConsultorioSchema);
