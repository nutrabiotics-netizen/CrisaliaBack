import mongoose, { Schema, Document } from 'mongoose';

export interface IMedicamento {
  denominacionComun: string;
  concentracion: string;
  unidadMedida: string;
  formaFarmaceutica: string;
  dosis: string;
  viaAdministracion: string;
  frecuencia: string;
  diasTratamiento: string;
  cantidadNumeros: string;
  cantidadLetras: string;
  indicaciones: string;
  fechaInicio?: Date;
  horaInicio?: string;
  recordatorios?: Array<{
    fecha: Date;
    hora: string;
  }>;
}

export interface IFormulaMedica extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  historiaClinicaId?: mongoose.Types.ObjectId; // Referencia a la historia clínica
  
  // Medicamentos prescritos
  medicamentos: IMedicamento[];
  
  // Diagnósticos asociados (copiados de la historia clínica)
  diagnosticos?: Array<{
    codigo?: string;
    descripcion: string;
    tipo?: string;
    relacionado?: string;
  }>;
  
  // Información adicional
  observaciones?: string;
  pdfUrl?: string;
  /** Orden generada para ALIVIA suplementos */
  ordenAlivia?: {
    json: Record<string, unknown>;
    estado: 'pendiente_envio' | 'enviado' | 'pagado' | 'cancelado';
    linkCarrito?: string;
    fechaEnvio?: Date;
  };
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MedicamentoSchema = new Schema<IMedicamento>({
  denominacionComun: { type: String, required: true },
  concentracion: { type: String, required: true },
  unidadMedida: { type: String, required: true },
  formaFarmaceutica: { type: String, required: true },
  dosis: { type: String, required: true },
  viaAdministracion: { type: String, required: true },
  frecuencia: { type: String, required: true },
  diasTratamiento: { type: String, required: true },
  cantidadNumeros: { type: String },
  cantidadLetras: { type: String },
  indicaciones: { type: String, required: true },
  fechaInicio: { type: Date },
  horaInicio: { type: String },
  recordatorios: [{
    fecha: { type: Date },
    hora: { type: String }
  }]
}, { _id: false });

const FormulaMedicaSchema = new Schema<IFormulaMedica>(
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
    medicamentos: {
      type: [MedicamentoSchema],
      required: true,
      validate: {
        validator: (v: IMedicamento[]) => v.length > 0,
        message: 'Debe haber al menos un medicamento en la fórmula'
      }
    },
    diagnosticos: [{
      codigo: String,
      descripcion: { type: String, required: true },
      tipo: String,
      relacionado: String
    }],
    observaciones: String,
    pdfUrl: String,
    ordenAlivia: {
      type: new Schema({
        json: { type: Schema.Types.Mixed, required: true },
        estado: {
          type: String,
          enum: ['pendiente_envio', 'enviado', 'pagado', 'cancelado'],
          default: 'pendiente_envio'
        },
        linkCarrito: { type: String, trim: true },
        fechaEnvio: { type: Date }
      }, { _id: false }),
      default: undefined
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
FormulaMedicaSchema.index({ pacienteId: 1, createdAt: -1 });
FormulaMedicaSchema.index({ medicoId: 1, createdAt: -1 });
FormulaMedicaSchema.index({ citaId: 1 }, { unique: true });
FormulaMedicaSchema.index({ historiaClinicaId: 1 });

export default mongoose.model<IFormulaMedica>('FormulaMedica', FormulaMedicaSchema);
