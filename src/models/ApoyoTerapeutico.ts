import mongoose, { Schema, Document } from 'mongoose';

export interface IApoyoTerapeutico extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  historiaClinicaId?: mongoose.Types.ObjectId; // Referencia a la historia clínica
  
  // Información del apoyo terapéutico
  servicioQueSolicita: string; // Especialidad del médico que solicita
  serviciosRemitidos: Array<{
    codigoCups: string;
    descripcionCups: string;
    servicio?: string;
    motivo: string; // Motivo específico para este servicio
  }>;
  motivo: string; // Motivo general del apoyo terapéutico (opcional)
  
  // Información adicional
  estado?: string; // pendiente, atendida, cancelada
  pdfUrl?: string;
  
  // Auditoría
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const ServicioRemitidoSchema = new Schema({
  codigoCups: { type: String, required: true },
  descripcionCups: { type: String, required: true },
  servicio: { type: String },
  motivo: { type: String, required: true, trim: true }
}, { _id: false });

const ApoyoTerapeuticoSchema = new Schema<IApoyoTerapeutico>(
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
    citaId: {
      type: Schema.Types.ObjectId,
      ref: 'Cita',
      required: true
    },
    historiaClinicaId: {
      type: Schema.Types.ObjectId,
      ref: 'HistoriaClinica'
    },
    servicioQueSolicita: {
      type: String,
      required: true,
      trim: true
    },
    serviciosRemitidos: {
      type: [ServicioRemitidoSchema],
      required: true,
      validate: {
        validator: (v: any[]) => v.length > 0,
        message: 'Debe haber al menos un servicio remitido'
      }
    },
    motivo: {
      type: String,
      required: false,
      trim: true
    },
    estado: {
      type: String,
      enum: ['pendiente', 'atendida', 'cancelada'],
      default: 'pendiente'
    },
    pdfUrl: {
      type: String
    },
    creadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    creadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    },
    actualizadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User'
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

// Índices compuestos para búsquedas frecuentes
ApoyoTerapeuticoSchema.index({ pacienteId: 1, createdAt: -1 });
ApoyoTerapeuticoSchema.index({ medicoId: 1, createdAt: -1 });
ApoyoTerapeuticoSchema.index({ citaId: 1 });
ApoyoTerapeuticoSchema.index({ historiaClinicaId: 1 });
ApoyoTerapeuticoSchema.index({ estado: 1 });

export default mongoose.model<IApoyoTerapeutico>('ApoyoTerapeutico', ApoyoTerapeuticoSchema);
