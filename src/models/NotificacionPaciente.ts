import mongoose, { Schema, Document } from 'mongoose';

export type TipoNotificacionPaciente =
  | 'recordatorio_preconsulta'
  | 'recordatorio_cita'
  | 'cita_confirmada'
  | 'cita_reagendada'
  | 'cita_cancelada'
  | 'nuevo_paraclínico';

export interface INotificacionPaciente extends Document {
  pacienteId: mongoose.Types.ObjectId;
  tipo: TipoNotificacionPaciente;
  titulo: string;
  mensaje: string;
  leida: boolean;
  datos?: Record<string, unknown>;
  createdAt: Date;
}

const NotificacionPacienteSchema = new Schema<INotificacionPaciente>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    tipo: {
      type: String,
      enum: ['recordatorio_preconsulta', 'recordatorio_cita', 'cita_confirmada', 'cita_reagendada', 'cita_cancelada', 'nuevo_paraclínico'],
      required: true,
    },
    titulo:  { type: String, required: true, trim: true },
    mensaje: { type: String, required: true, trim: true },
    leida:   { type: Boolean, default: false },
    datos:   { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

NotificacionPacienteSchema.index({ pacienteId: 1, createdAt: -1 });
NotificacionPacienteSchema.index({ pacienteId: 1, leida: 1 });

export default mongoose.model<INotificacionPaciente>('NotificacionPaciente', NotificacionPacienteSchema);
