import mongoose, { Schema, Document } from 'mongoose';

export interface IInterrogatorio extends Document {
  pacienteId: mongoose.Types.ObjectId;
  tipo: 'primera_vez' | 'control';
  estado: 'en_proceso' | 'completado' | 'pendiente';
  progreso: number; // Porcentaje de completitud (0-100)
  respuestas: Record<string, any>; // Respuestas del paciente
  observacionesIA?: string[]; // Observaciones de la IA sobre incoherencias
  analisisIA?: string; // Análisis completo de la IA
  objetivos?: string[]; // Objetivos identificados por la IA
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InterrogatorioSchema = new Schema<IInterrogatorio>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
      index: true
    },
    tipo: {
      type: String,
      enum: ['primera_vez', 'control'],
      required: true,
      default: 'primera_vez'
    },
    estado: {
      type: String,
      enum: ['en_proceso', 'completado', 'pendiente'],
      default: 'pendiente'
    },
    progreso: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    respuestas: {
      type: Schema.Types.Mixed,
      default: {}
    },
    observacionesIA: {
      type: [String],
      default: []
    },
    analisisIA: {
      type: String
    },
    objetivos: {
      type: [String],
      default: []
    },
    creadoPor: {
      type: Schema.Types.ObjectId,
      refPath: 'creadoPorRol'
    },
    creadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    },
    actualizadoPor: {
      type: Schema.Types.ObjectId,
      refPath: 'actualizadoPorRol'
    },
    actualizadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    }
  },
  {
    timestamps: true
  }
);

// Índice compuesto para búsquedas frecuentes
InterrogatorioSchema.index({ pacienteId: 1, tipo: 1 });
InterrogatorioSchema.index({ pacienteId: 1, estado: 1 });

export default mongoose.model<IInterrogatorio>('Interrogatorio', InterrogatorioSchema);

