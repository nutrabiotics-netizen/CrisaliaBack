import mongoose, { Schema, Document } from 'mongoose';

export interface IParaclinicoOcrValor {
  nombre: string;
  valor?: string;
  unidad?: string;
  referencia?: string;
}

export interface IParaclinico extends Document {
  pacienteId: mongoose.Types.ObjectId;
  nombre: string;
  fecha: Date;
  tipo: 'pdf' | 'imagen';
  tamañoBytes: number;
  urlArchivo: string; // URL firmada S3 u otra URL de descarga
  notasPaciente?: string;
  revisadoPorMedico: boolean; // Si el médico ya lo vio en la preconsulta/consulta
  ocrTextoPlano?: string;
  ocrValores?: IParaclinicoOcrValor[];
  ocrEstado?: 'listo' | 'error' | 'omitido';
  ocrMetodo?: 'pdf-texto' | 'vision';
  ocrError?: string;

  // Clasificación automática por IA
  tipoDocumento?: 'laboratorio' | 'imagen_diagnostica' | 'electrocardiograma' | 'biopsia' | 'formula_medica' | 'historia_clinica' | 'otro';

  // Análisis funcional IA (Fase 3)
  semaforo?: 'verde' | 'amarillo' | 'rojo';
  valorFuncional?: string;  // interpretación en rangos funcionales
  tendencia?: 'mejorando' | 'estable' | 'empeorando';
  analisisIA?: string;

  // Notas del médico
  notasHistorial?: { _id?: mongoose.Types.ObjectId; texto: string; creadoEn: Date }[];

  // Auditoría
  createdAt: Date;
  updatedAt: Date;
}

const OcrValorSchema = new Schema<IParaclinicoOcrValor>(
  {
    nombre: { type: String, required: true, trim: true },
    valor: { type: String, trim: true },
    unidad: { type: String, trim: true },
    referencia: { type: String, trim: true }
  },
  { _id: false }
);

const ParaclinicoSchema = new Schema<IParaclinico>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true
    },
    nombre: {
      type: String,
      required: true,
      trim: true
    },
    fecha: {
      type: Date,
      required: true,
      default: Date.now
    },
    tipo: {
      type: String,
      enum: ['pdf', 'imagen'],
      required: true
    },
    tamañoBytes: {
      type: Number,
      required: true,
      min: 0
    },
    urlArchivo: {
      type: String,
      required: true
    },
    notasPaciente: {
      type: String,
      trim: true
    },
    revisadoPorMedico: {
      type: Boolean,
      default: false
    },
    ocrTextoPlano: {
      type: String
    },
    ocrValores: {
      type: [OcrValorSchema],
      default: undefined
    },
    ocrEstado: {
      type: String,
      enum: ['listo', 'error', 'omitido']
    },
    ocrMetodo: {
      type: String,
      enum: ['pdf-texto', 'vision']
    },
    ocrError: {
      type: String,
      trim: true
    },

    tipoDocumento: {
      type: String,
      enum: ['laboratorio', 'imagen_diagnostica', 'electrocardiograma', 'biopsia', 'formula_medica', 'historia_clinica', 'otro'],
    },

    // Análisis funcional IA (Fase 3)
    semaforo: {
      type: String,
      enum: ['verde', 'amarillo', 'rojo']
    },
    valorFuncional: {
      type: String,
      trim: true
    },
    tendencia: {
      type: String,
      enum: ['mejorando', 'estable', 'empeorando']
    },
    analisisIA: {
      type: String
    },
    notasHistorial: {
      type: [{
        texto:    { type: String, required: true, trim: true },
        creadoEn: { type: Date, default: Date.now },
      }],
      default: [],
    }
  },
  {
    timestamps: true
  }
);

// Índices
ParaclinicoSchema.index({ pacienteId: 1, fecha: -1 });

export default mongoose.model<IParaclinico>('Paraclinico', ParaclinicoSchema);
