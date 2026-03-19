import mongoose, { Schema, Document } from 'mongoose';

export interface IRipsPaquete extends Document {
  periodo: string; // Formato YYYY-MM
  totalRegistros: number;
  archivosGenerados: string[]; // Ej: ['US', 'AC', 'AP', 'CT']
  fechaGeneracion: Date;
  estado: 'Validado' | 'Enviado';
  generadoPor: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RipsPaqueteSchema = new Schema<IRipsPaquete>(
  {
    periodo: {
      type: String,
      required: true,
      index: true
    },
    totalRegistros: {
      type: Number,
      required: true
    },
    archivosGenerados: {
      type: [String],
      required: true
    },
    fechaGeneracion: {
      type: Date,
      default: Date.now
    },
    estado: {
      type: String,
      enum: ['Validado', 'Enviado'],
      default: 'Validado'
    },
    generadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'Administrativo',
      required: false
    }
  },
  { timestamps: true }
);

export default mongoose.model<IRipsPaquete>('RipsPaquete', RipsPaqueteSchema);
