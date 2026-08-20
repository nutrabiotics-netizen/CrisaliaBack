import mongoose, { Schema, Document } from 'mongoose';

export type TipoNotificacion =
  | 'cita_nueva'
  | 'cita_cancelada'
  | 'cita_reagendada'
  | 'cita_confirmada'
  | 'cita_recordatorio'
  | 'paciente_sala_espera'
  | 'preconsulta_50'
  | 'preconsulta_100'
  | 'resultados_cargados'
  | 'seguimiento_evolucion'
  | 'sugerencia_ia'
  | 'prescripcion_pendiente'
  | 'nuevo_paciente'
  | 'consentimiento_requerido'
  | 'seguridad_acceso'
  | 'facturacion_pago'
  | 'general';

export type CategoriaNotificacion =
  | 'citas_agenda'
  | 'preconsultas_anamnesis'
  | 'pacientes_casos'
  | 'sugerencias_ia'
  | 'prescripciones_et'
  | 'laboratorios_resultados'
  | 'seguimiento_clinico'
  | 'privacidad_seguridad'
  | 'facturacion';

export interface INotificacion extends Document {
  medicoId: mongoose.Types.ObjectId;
  tipo: TipoNotificacion;
  categoria: CategoriaNotificacion;
  titulo: string;
  cuerpo: string;
  leida: boolean;
  requiereAccion: boolean;
  accionUrl?: string;
  accionLabel?: string;
  pacienteId?: mongoose.Types.ObjectId;
  pacienteNombre?: string;
  citaId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificacionSchema = new Schema<INotificacion>(
  {
    medicoId:       { type: Schema.Types.ObjectId, ref: 'Medico', required: true, index: true },
    tipo:           { type: String, required: true },
    categoria:      { type: String, required: true, index: true },
    titulo:         { type: String, required: true, trim: true },
    cuerpo:         { type: String, required: true, trim: true },
    leida:          { type: Boolean, default: false, index: true },
    requiereAccion: { type: Boolean, default: false },
    accionUrl:      { type: String, trim: true },
    accionLabel:    { type: String, trim: true },
    pacienteId:     { type: Schema.Types.ObjectId, ref: 'Paciente' },
    pacienteNombre: { type: String, trim: true },
    citaId:         { type: Schema.Types.ObjectId, ref: 'Cita' },
    metadata:       { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Índice compuesto para queries frecuentes
NotificacionSchema.index({ medicoId: 1, leida: 1, createdAt: -1 });
NotificacionSchema.index({ medicoId: 1, categoria: 1, createdAt: -1 });

export default mongoose.model<INotificacion>('Notificacion', NotificacionSchema);