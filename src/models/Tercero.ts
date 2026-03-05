import mongoose, { Schema, Document } from 'mongoose';

export type TipoTercero = 'seguro' | 'convenio' | 'integracion';

export interface ITercero extends Document {
  nombre: string;
  tipo: TipoTercero;
  descripcion?: string;
  activo: boolean;
  /** Si está integrado/conectado (ej. ALIVIA) */
  integrado: boolean;
  /** Cantidad de pacientes asociados (información referencial) */
  cantidadPacientes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const TerceroSchema = new Schema<ITercero>(
  {
    nombre: {
      type: String,
      required: true,
      trim: true
    },
    tipo: {
      type: String,
      enum: ['seguro', 'convenio', 'integracion'],
      required: true,
      default: 'convenio'
    },
    descripcion: {
      type: String,
      trim: true,
      default: ''
    },
    activo: {
      type: Boolean,
      default: true
    },
    integrado: {
      type: Boolean,
      default: false
    },
    cantidadPacientes: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

TerceroSchema.index({ nombre: 1 });
TerceroSchema.index({ tipo: 1, activo: 1 });

export default mongoose.model<ITercero>('Tercero', TerceroSchema);
