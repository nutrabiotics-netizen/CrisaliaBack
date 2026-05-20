import mongoose, { Schema, Document } from 'mongoose';

export interface IRegistroIngresoSalida extends Document {
  personalId?: mongoose.Types.ObjectId;
  medicoId?: mongoose.Types.ObjectId;
  /** Fecha del día (solo fecha, sin hora) */
  fecha: Date;
  horaEntrada: string;
  horaSalida?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RegistroIngresoSalidaSchema = new Schema<IRegistroIngresoSalida>(
  {
    personalId: {
      type: Schema.Types.ObjectId,
      ref: 'PersonalInstitucional',
      default: null
    },
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      default: null
    },
    fecha: {
      type: Date,
      required: true
    },
    horaEntrada: {
      type: String,
      required: true,
      trim: true
    },
    horaSalida: {
      type: String,
      trim: true,
      default: null
    }
  },
  { timestamps: true }
);

RegistroIngresoSalidaSchema.index({ fecha: 1, medicoId: 1 }, { unique: true, sparse: true });
RegistroIngresoSalidaSchema.index({ fecha: 1, personalId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IRegistroIngresoSalida>('RegistroIngresoSalida', RegistroIngresoSalidaSchema);
