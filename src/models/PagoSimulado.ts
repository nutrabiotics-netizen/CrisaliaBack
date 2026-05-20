import mongoose, { Schema, Document } from 'mongoose';

export type EstadoPago = 'pendiente' | 'pagado' | 'reembolsado';
export type CuotaPago = 1 | 2;

export interface IPagoSimulado extends Document {
  pacienteId: mongoose.Types.ObjectId;
  cuota: CuotaPago;
  monto: number;
  descuentoAplicado: number;
  codigoDescuentoId?: mongoose.Types.ObjectId;
  estado: EstadoPago;
  descripcion: string;
  fechaPago?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PagoSimuladoSchema = new Schema<IPagoSimulado>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true
    },
    cuota: {
      type: Number,
      enum: [1, 2],
      required: true
    },
    monto: {
      type: Number,
      required: true,
      default: 0
    },
    descuentoAplicado: {
      type: Number,
      default: 0
    },
    codigoDescuentoId: {
      type: Schema.Types.ObjectId,
      ref: 'CodigoDescuento'
    },
    estado: {
      type: String,
      enum: ['pendiente', 'pagado', 'reembolsado'],
      default: 'pendiente'
    },
    descripcion: {
      type: String,
      required: true
    },
    fechaPago: {
      type: Date
    }
  },
  { timestamps: true }
);

PagoSimuladoSchema.index({ pacienteId: 1, cuota: 1 }, { unique: true });

export default mongoose.model<IPagoSimulado>('PagoSimulado', PagoSimuladoSchema);
