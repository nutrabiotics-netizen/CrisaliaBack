import mongoose, { Schema, Document } from 'mongoose';

export interface IExamenMedico extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  historiaClinicaId?: mongoose.Types.ObjectId; // Referencia a la historia clínica
  
  // Información de los exámenes
  examenes: Array<{
    codigoCups: string;
    descripcionCups: string;
    cantidad: number;
    observacion?: string;
  }>;
  
  // Información adicional
  estado?: string; // pendiente, procesado, cancelado
  pdfUrl?: string;
  
  // Auditoría
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const ExamenSchema = new Schema({
  codigoCups: { type: String, required: true, trim: true },
  descripcionCups: { type: String, required: true, trim: true },
  cantidad: { type: Number, required: true, min: 1 },
  observacion: { type: String, trim: true }
}, { _id: false });

const ExamenMedicoSchema = new Schema<IExamenMedico>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
      index: true
    },
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true,
      index: true
    },
    citaId: {
      type: Schema.Types.ObjectId,
      ref: 'Cita',
      required: true,
      index: true
    },
    historiaClinicaId: {
      type: Schema.Types.ObjectId,
      ref: 'HistoriaClinica',
      index: true
    },
    examenes: {
      type: [ExamenSchema],
      required: true,
      validate: {
        validator: (v: any[]) => v.length > 0,
        message: 'Debe haber al menos un examen'
      }
    },
    estado: {
      type: String,
      enum: ['pendiente', 'procesado', 'cancelado'],
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
ExamenMedicoSchema.index({ pacienteId: 1, createdAt: -1 });
ExamenMedicoSchema.index({ medicoId: 1, createdAt: -1 });
ExamenMedicoSchema.index({ citaId: 1 });
ExamenMedicoSchema.index({ historiaClinicaId: 1 });
ExamenMedicoSchema.index({ estado: 1 });

export default mongoose.model<IExamenMedico>('ExamenMedico', ExamenMedicoSchema);
