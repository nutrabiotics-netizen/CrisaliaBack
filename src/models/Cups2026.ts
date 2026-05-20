import mongoose, { Document, Schema } from 'mongoose';

export interface ICups2026 extends Document {
  codigo: string;
  nombre: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const cups2026Schema = new Schema<ICups2026>(
  {
    codigo: {
      type: String,
      required: true,
      trim: true
    },
    nombre: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true,
    collection: 'cups2026'
  }
);

// Índice compuesto para búsquedas rápidas
cups2026Schema.index({ codigo: 1 });

const Cups2026 = mongoose.model<ICups2026>('Cups2026', cups2026Schema);

export default Cups2026;
