import mongoose, { Schema, Document } from 'mongoose';

/** Secciones clínicas estándar para ordenar la transcripción en la historia clínica. */
export const CLINICAL_SECTIONS = [
  'motivo_consulta',
  'antecedentes',
  'evaluacion',
  'diagnostico',
  'plan_tratamiento',
  'motivo_atencion',
  'examen_fisico',
  'resultados_paraclinicos',
  'alertas_y_alergias',
  'analisis_y_plan',
  'diagnosticos',
  'recomendaciones'
] as const;

export type ClinicalSectionType = (typeof CLINICAL_SECTIONS)[number];

export interface ITranscriptionSession extends Document {
  medicoId: mongoose.Types.ObjectId;
  pacienteId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  /** Estado del flujo: activo mientras se transmite audio, cerrado al finalizar. */
  status: 'active' | 'closed';
  /** Sección clínica actual (la que el usuario eligió en el cliente). */
  currentClinicalSection: ClinicalSectionType;
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptionSessionSchema = new Schema<ITranscriptionSession>(
  {
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true,
      index: true
    },
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
      index: true
    },
    citaId: {
      type: Schema.Types.ObjectId,
      ref: 'Cita',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active'
    },
    currentClinicalSection: {
      type: String,
      enum: CLINICAL_SECTIONS,
      default: 'motivo_consulta'
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: { type: Date }
  },
  { timestamps: true }
);

/** Índice compuesto para evitar sesiones duplicadas activas por cita (una sesión activa por cita). */
TranscriptionSessionSchema.index({ citaId: 1, status: 1 });

export default mongoose.model<ITranscriptionSession>('TranscriptionSession', TranscriptionSessionSchema);
