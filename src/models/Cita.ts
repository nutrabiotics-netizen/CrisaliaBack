import mongoose, { Schema, Document } from 'mongoose';

export interface ICita extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  fecha: Date;
  hora: string;
  tipo: 'preconsulta' | 'consulta' | 'control';
  modalidad: 'presencial' | 'virtual';
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  motivoCancelacion?: string;
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  canceladoPor?: mongoose.Types.ObjectId;
  canceladoPorRol?: string;
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
    estado: {
      type: String,
      enum: ['pendiente', 'confirmada', 'cancelada', 'completada'],
      default: 'pendiente'
    },
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
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<ICita>('Cita', CitaSchema);

