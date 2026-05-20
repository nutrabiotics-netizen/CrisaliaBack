import mongoose, { Schema, Document } from 'mongoose';

export type TipoDescuento = 'porcentaje' | 'monto_fijo';
export type OrigenDescuento = 'referido' | 'evento' | 'webinar' | 'medico' | 'admin';

export interface ICodigoDescuento extends Document {
  codigo: string;
  tipo: TipoDescuento;
  valor: number;
  medicoId?: mongoose.Types.ObjectId;
  origen: OrigenDescuento;
  usos: number;
  maxUsos: number;
  expiresAt: Date;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CodigoDescuentoSchema = new Schema<ICodigoDescuento>(
  {
    codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    tipo: { type: String, enum: ['porcentaje', 'monto_fijo'], required: true },
    valor: { type: Number, required: true, min: 0 },
    medicoId: { type: Schema.Types.ObjectId, ref: 'Medico' },
    origen: {
      type: String,
      enum: ['referido', 'evento', 'webinar', 'medico', 'admin'],
      required: true
    },
    usos: { type: Number, default: 0, min: 0 },
    maxUsos: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

CodigoDescuentoSchema.index({ activo: 1, expiresAt: 1 });

export default mongoose.model<ICodigoDescuento>('CodigoDescuento', CodigoDescuentoSchema);
