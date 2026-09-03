import mongoose, { Schema, Document } from 'mongoose';

export type SeccionHistorial = 'historia_clinica' | 'formulas_medicas' | 'paraclinicos' | 'interrogatorio' | 'citas';

export interface ICompartirHistorial extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  secciones: SeccionHistorial[];
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CompartirHistorialSchema = new Schema<ICompartirHistorial>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    medicoId:   { type: Schema.Types.ObjectId, ref: 'Medico',   required: true },
    secciones:  {
      type: [String],
      enum: ['historia_clinica', 'formulas_medicas', 'paraclinicos', 'interrogatorio', 'citas'],
      default: [],
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CompartirHistorialSchema.index({ pacienteId: 1, medicoId: 1 }, { unique: true });
CompartirHistorialSchema.index({ medicoId: 1, activo: 1 });

export default mongoose.model<ICompartirHistorial>('CompartirHistorial', CompartirHistorialSchema);
