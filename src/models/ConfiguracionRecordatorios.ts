import mongoose, { Schema, Document } from 'mongoose';

export interface IRecordatorio {
  intervalo: number;
  unidad: 'minutos' | 'horas' | 'dias';
  activo: boolean;
}

export interface IConfiguracionRecordatorios extends Document {
  medicoId: mongoose.Types.ObjectId;
  recordatorios: IRecordatorio[];
  createdAt: Date;
  updatedAt: Date;
}

const RecordatorioSchema = new Schema<IRecordatorio>({
  intervalo: { type: Number, required: true, min: 1 },
  unidad: { type: String, enum: ['minutos', 'horas', 'dias'], required: true },
  activo: { type: Boolean, default: true }
}, { _id: true });

const ConfiguracionRecordatoriosSchema = new Schema<IConfiguracionRecordatorios>(
  {
    medicoId: { type: Schema.Types.ObjectId, ref: 'Medico', required: true, unique: true },
    recordatorios: { type: [RecordatorioSchema], default: [] }
  },
  { timestamps: true }
);

export default mongoose.model<IConfiguracionRecordatorios>('ConfiguracionRecordatorios', ConfiguracionRecordatoriosSchema);
