import mongoose, { Schema, Document } from 'mongoose';

export interface IReferidoMedico extends Document {
  medicoReferidorId: mongoose.Types.ObjectId;
  medicoReferidoId: mongoose.Types.ObjectId;
  linkCaptacionId?: mongoose.Types.ObjectId;
  estado: 'pendiente' | 'registrado' | 'activo' | 'bonificado';
  montoBonus: number;
  fechaRegistro?: Date;
  fechaBonificacion?: Date;
  notas?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReferidoMedicoSchema = new Schema<IReferidoMedico>(
  {
    medicoReferidorId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true,
      index: true
    },
    medicoReferidoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true,
      index: true
    },
    linkCaptacionId: { type: Schema.Types.ObjectId, ref: 'LinkCaptacion' },
    estado: {
      type: String,
      enum: ['pendiente', 'registrado', 'activo', 'bonificado'],
      default: 'pendiente'
    },
    montoBonus: { type: Number, default: 0, min: 0 },
    fechaRegistro: { type: Date },
    fechaBonificacion: { type: Date },
    notas: { type: String, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model<IReferidoMedico>('ReferidoMedico', ReferidoMedicoSchema);
