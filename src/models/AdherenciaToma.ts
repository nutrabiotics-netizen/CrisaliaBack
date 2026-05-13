import mongoose, { Schema, Document } from 'mongoose';

export interface IAdherenciaToma extends Document {
  pacienteId: mongoose.Types.ObjectId;
  formulaMedicaId: mongoose.Types.ObjectId;
  medicamentoIndex: number;
  fechaToma: Date;
  notas?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdherenciaTomaSchema = new Schema<IAdherenciaToma>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    formulaMedicaId: { type: Schema.Types.ObjectId, ref: 'FormulaMedica', required: true, index: true },
    medicamentoIndex: { type: Number, required: true, min: 0 },
    fechaToma: { type: Date, required: true, default: Date.now },
    notas: { type: String }
  },
  { timestamps: true }
);

AdherenciaTomaSchema.index({ pacienteId: 1, fechaToma: -1 });
AdherenciaTomaSchema.index({ formulaMedicaId: 1, medicamentoIndex: 1, fechaToma: -1 });

export default mongoose.model<IAdherenciaToma>('AdherenciaToma', AdherenciaTomaSchema);
