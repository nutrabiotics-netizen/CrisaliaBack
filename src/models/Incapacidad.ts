import mongoose, { Schema, Document } from 'mongoose';

export interface IIncapacidad extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  historiaClinicaId?: mongoose.Types.ObjectId; // Referencia a la historia clínica
  
  // Información de la incapacidad
  lugarExpedicion: string; // Ciudad de expedición
  fechaExpedicion: Date;
  esProrroga: boolean;
  especialidadMedica?: string;
  fechaInicial: Date;
  dias: number;
  fechaFinal: Date;
  diagnosticoPrincipal: {
    codigo?: string;
    descripcion: string;
  };
  observaciones?: string;
  
  // Información adicional
  pdfUrl?: string;
  
  // Auditoría
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const IncapacidadSchema = new Schema<IIncapacidad>(
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
    lugarExpedicion: {
      type: String,
      required: true,
      trim: true
    },
    fechaExpedicion: {
      type: Date,
      required: true,
      default: Date.now
    },
    esProrroga: {
      type: Boolean,
      default: false
    },
    especialidadMedica: {
      type: String,
      trim: true
    },
    fechaInicial: {
      type: Date,
      required: true
    },
    dias: {
      type: Number,
      required: true,
      min: 1
    },
    fechaFinal: {
      type: Date,
      required: true
    },
    diagnosticoPrincipal: {
      codigo: String,
      descripcion: { type: String, required: true }
    },
    observaciones: {
      type: String,
      trim: true
    },
    pdfUrl: String,
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

// Validación: fechaFinal debe ser >= fechaInicial
IncapacidadSchema.pre('save', async function () {
  if (this.fechaFinal < this.fechaInicial) {
    throw new Error('La fecha final debe ser mayor o igual a la fecha inicial');
  }
});


// Índices compuestos para búsquedas frecuentes
IncapacidadSchema.index({ pacienteId: 1, createdAt: -1 });
IncapacidadSchema.index({ medicoId: 1, createdAt: -1 });
IncapacidadSchema.index({ citaId: 1 }, { unique: true });
IncapacidadSchema.index({ historiaClinicaId: 1 });

export default mongoose.model<IIncapacidad>('Incapacidad', IncapacidadSchema);
