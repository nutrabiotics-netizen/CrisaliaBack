import mongoose, { Schema, Document } from 'mongoose';

export interface IEncuestaSatisfaccion extends Document {
  citaId?: mongoose.Types.ObjectId; 
  pacienteId?: mongoose.Types.ObjectId; 
  calificacionAgendamiento: number;
  calificacionPreconsultaIA: number;
  calificacionRecomendaciones: number;
  calificacionAtencionPresencial: number;
  calificacionTiemposEspera: number;
  sugerencias?: string;
  esAnonimo: boolean;
  leidoPorAdministrador: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EncuestaSatisfaccionSchema = new Schema<IEncuestaSatisfaccion>(
  {
    citaId: { type: Schema.Types.ObjectId, ref: 'Cita', required: false },
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: false },
    calificacionAgendamiento: { type: Number, required: true, min: 1, max: 5 },
    calificacionPreconsultaIA: { type: Number, required: true, min: 1, max: 5 },
    calificacionRecomendaciones: { type: Number, required: true, min: 1, max: 5 },
    calificacionAtencionPresencial: { type: Number, required: true, min: 1, max: 5 },
    calificacionTiemposEspera: { type: Number, required: true, min: 1, max: 5 },
    sugerencias: { type: String, required: false },
    esAnonimo: { type: Boolean, required: true, default: false },
    leidoPorAdministrador: { type: Boolean, required: true, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IEncuestaSatisfaccion>('EncuestaSatisfaccion', EncuestaSatisfaccionSchema);
