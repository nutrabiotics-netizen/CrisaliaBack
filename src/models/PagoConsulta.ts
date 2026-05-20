import mongoose, { Schema, Document } from 'mongoose';

export type TipoPagoConsulta = 'preconsulta' | 'consulta' | 'control';
export type EstadoPagoConsulta = 'pendiente' | 'completado' | 'reembolsado';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'tercero_aliado';

export interface IPagoConsulta extends Document {
  medicoId: mongoose.Types.ObjectId;
  pacienteId: mongoose.Types.ObjectId;
  citaId?: mongoose.Types.ObjectId;
  tipo: TipoPagoConsulta;
  monto: number;
  estado: EstadoPagoConsulta;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
  fechaPago?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PagoConsultaSchema = new Schema<IPagoConsulta>(
  {
    medicoId: { type: Schema.Types.ObjectId, ref: 'Medico', required: true },
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    citaId: { type: Schema.Types.ObjectId, ref: 'Cita' },
    tipo: {
      type: String,
      enum: ['preconsulta', 'consulta', 'control'],
      required: true
    },
    monto: { type: Number, required: true, min: 0 },
    estado: {
      type: String,
      enum: ['pendiente', 'completado', 'reembolsado'],
      default: 'pendiente'
    },
    metodo: {
      type: String,
      enum: ['efectivo', 'transferencia', 'tarjeta', 'tercero_aliado'],
      required: true
    },
    referencia: { type: String, trim: true },
    notas: { type: String, trim: true },
    fechaPago: { type: Date }
  },
  { timestamps: true }
);

PagoConsultaSchema.index({ medicoId: 1, createdAt: -1 });
PagoConsultaSchema.index({ medicoId: 1, estado: 1 });
PagoConsultaSchema.index({ citaId: 1 }, { sparse: true });

export default mongoose.model<IPagoConsulta>('PagoConsulta', PagoConsultaSchema);
