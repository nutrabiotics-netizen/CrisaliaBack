import mongoose, { Schema, Document } from 'mongoose';

export interface ICita extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  fecha: Date;
  hora: string;
  tipo: 'preconsulta' | 'consulta' | 'control';
  modalidad: 'presencial' | 'virtual';
  modulo?: 'general' | 'heridas';
  estado: 'pendiente' | 'confirmada' | 'en_espera' | 'en_consulta' | 'cancelada' | 'completada';
  horaLlegada?: Date; // Si estado es en_espera, guardamos cuando llegó físicamente
  meetingId?: string; // ID de reunión AWS Chime para videoconsultas
  /** Ruta S3 de la grabación de videoconsulta (ej. s3://bucket/prefix/pipelineId/) para poder generar link de visualización */
  grabacionUrl?: string;
  motivoCancelacion?: string;
  pdfResumenUrl?: string; // PDF resumen de la consulta (historia + fórmulas + incapacidades + etc.)
  /** Marca de envío de recordatorio WhatsApp (~24 h antes de la cita) */
  notifRecordatorio24hAt?: Date;
  /** Marca de envío de recordatorio WhatsApp (~2 h antes de la cita) */
  notifRecordatorio2hAt?: Date;
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  canceladoPor?: mongoose.Types.ObjectId;
  canceladoPorRol?: string;
  /** Demora detectada automáticamente si la cita no inicia en su hora */
  demora?: {
    detectadaEn: Date;
    minutosDemora: number;
    motivo?: string;
    registradoPor?: mongoose.Types.ObjectId;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CitaSchema = new Schema<ICita>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true
    },
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true
    },
    fecha: {
      type: Date,
      required: true
    },
    hora: {
      type: String,
      required: true
    },
    tipo: {
      type: String,
      enum: ['preconsulta', 'consulta', 'control'],
      required: true
    },
    modalidad: {
      type: String,
      enum: ['presencial', 'virtual'],
      required: true
    },
    modulo: {
      type: String,
      enum: ['general', 'heridas'],
      default: 'general'
    },
    estado: {
      type: String,
      enum: ['pendiente', 'confirmada', 'en_espera', 'en_consulta', 'cancelada', 'completada'],
      default: 'pendiente'
    },
    horaLlegada: {
       type: Date
    },
    meetingId: {
      type: String,
      trim: true
    },
    grabacionUrl: { type: String, trim: true },
    pdfResumenUrl: { type: String, trim: true },
    notifRecordatorio24hAt: { type: Date },
    notifRecordatorio2hAt: { type: Date },
    motivoCancelacion: {
      type: String,
      trim: true
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
    },
    canceladoPor: {
      type: Schema.Types.ObjectId,
      refPath: 'canceladoPorRol'
    },
    canceladoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    },
    demora: {
      type: new Schema({
        detectadaEn: { type: Date, required: true },
        minutosDemora: { type: Number, required: true },
        motivo: { type: String, trim: true },
        registradoPor: { type: Schema.Types.ObjectId }
      }, { _id: false }),
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

// Índices compuestos para consultas frecuentes del médico y del paciente
CitaSchema.index({ medicoId: 1, fecha: 1 });
CitaSchema.index({ pacienteId: 1, fecha: -1 });
CitaSchema.index({ medicoId: 1, estado: 1, fecha: 1 });

export default mongoose.model<ICita>('Cita', CitaSchema);

