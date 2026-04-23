import mongoose, { Schema, Document } from 'mongoose';

export interface IRipsPaquete extends Document {
  periodo: string;
  totalRegistros: number;
  archivosGenerados: string[];
  fechaGeneracion: Date;
  faseActual: 'borrador' | 'consolidado' | 'validado' | 'enviado' | 'auditado';
  estado: 'Validado' | 'Enviado';
  erroresValidacion: string[];
  archivoGeneradoUrl?: string;
  fechaEnvio?: Date;
  enviadoA?: string;
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
    faseActual: {
      type: String,
      enum: ['borrador', 'consolidado', 'validado', 'enviado', 'auditado'],
      default: 'borrador'
    },
    estado: {
      type: String,
      enum: ['Validado', 'Enviado'],
      default: 'Validado'
    },
    erroresValidacion: { type: [String], default: [] },
    archivoGeneradoUrl: { type: String, trim: true },
    fechaEnvio: { type: Date },
    enviadoA: { type: String, trim: true },
    generadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'Administrativo',
      required: false
    }
  },
  { timestamps: true }
);

export default mongoose.model<IRipsPaquete>('RipsPaquete', RipsPaqueteSchema);
