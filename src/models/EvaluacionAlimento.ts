import mongoose, { Schema, Document } from 'mongoose';

/**
 * Análisis nutricional puntual: foto de un plato + chat con la IA.
 * Cada evaluación es un documento independiente; el paciente puede tener historial.
 */

export interface IAlimentoMensaje {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  creadoEn: Date;
}

export interface IAlimentoPerfilSnapshot {
  nombre?: string;
  apellido?: string;
  fechaNacimiento?: Date;
  sexoBiologico?: string;
  eps?: string;
  zonasDolor?: string[];
  edadAnios?: number;
}

export interface IEvaluacionAlimento extends Document {
  pacienteId: mongoose.Types.ObjectId;
  s3Key: string;
  urlArchivo?: string;
  mensajes: IAlimentoMensaje[];
  perfilSnapshot?: IAlimentoPerfilSnapshot;
  modeloIA?: string;       // ej: "anthropic.claude-3-5-sonnet-20240620-v1:0"
  simulado?: boolean;      // true si la respuesta fue mock (degradación elegante)
  errorAnalisis?: string;  // si Bedrock falla, registramos el motivo
  createdAt: Date;
  updatedAt: Date;
}

const MensajeSchema = new Schema<IAlimentoMensaje>(
  {
    id: { type: String, required: true },
    rol: { type: String, enum: ['usuario', 'asistente'], required: true },
    texto: { type: String, required: true },
    creadoEn: { type: Date, default: Date.now }
  },
  { _id: false }
);

const PerfilSnapshotSchema = new Schema<IAlimentoPerfilSnapshot>(
  {
    nombre: String,
    apellido: String,
    fechaNacimiento: Date,
    sexoBiologico: String,
    eps: String,
    zonasDolor: [String],
    edadAnios: Number
  },
  { _id: false }
);

const EvaluacionAlimentoSchema = new Schema<IEvaluacionAlimento>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    s3Key: { type: String, required: true },
    urlArchivo: String,
    mensajes: [MensajeSchema],
    perfilSnapshot: PerfilSnapshotSchema,
    modeloIA: String,
    simulado: { type: Boolean, default: false },
    errorAnalisis: String
  },
  { timestamps: true }
);

EvaluacionAlimentoSchema.index({ pacienteId: 1, createdAt: -1 });

export default mongoose.model<IEvaluacionAlimento>('EvaluacionAlimento', EvaluacionAlimentoSchema);
