import mongoose, { Schema, Document } from 'mongoose';

/** Secciones clínicas (debe coincidir con TranscriptionSession.CLINICAL_SECTIONS). */
const CLINICAL_SECTIONS = [
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

/** Rol del hablante: quien está hablando en ese fragmento (asignado por el cliente según quién tiene el micrófono o selección manual). */
export const SPEAKER_ROLES = ['MEDICO', 'PACIENTE'] as const;
export type SpeakerRoleType = (typeof SPEAKER_ROLES)[number];

export interface ITranscriptionSegment extends Document {
  sessionId: mongoose.Types.ObjectId;
  /** Texto transcrito (parcial o final). */
  text: string;
  /** Rol del hablante. */
  speakerRole: SpeakerRoleType;
  /** Sección clínica a la que pertenece este fragmento. */
  clinicalSection: ClinicalSectionType;
  /** Posición en la sesión para reconstruir orden cronológico. */
  sequence: number;
  /** Si es resultado parcial (Transcribe puede enviar varios parciales antes del final). */
  isPartial: boolean;
  /** Timestamp del servidor al recibir el fragmento. */
  timestamp: Date;
  /** Timestamp de inicio del segmento en el audio (opcional, si Transcribe lo devuelve). */
  startTimeMs?: number;
  /** Timestamp de fin del segmento en el audio (opcional). */
  endTimeMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptionSegmentSchema = new Schema<ITranscriptionSegment>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'TranscriptionSession',
      required: true,
      index: true
    },
    text: { type: String, required: true, trim: true },
    speakerRole: {
      type: String,
      enum: SPEAKER_ROLES,
      required: true
    },
    clinicalSection: {
      type: String,
      enum: CLINICAL_SECTIONS,
      required: true
    },
    sequence: { type: Number, required: true, default: 0 },
    isPartial: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
    startTimeMs: { type: Number },
    endTimeMs: { type: Number }
  },
  { timestamps: true }
);

/** Orden cronológico por sesión. */
TranscriptionSegmentSchema.index({ sessionId: 1, sequence: 1 });

export default mongoose.model<ITranscriptionSegment>('TranscriptionSegment', TranscriptionSegmentSchema);
