import mongoose, { Schema, Document } from 'mongoose';

export interface IParaclinico extends Document {
  pacienteId: mongoose.Types.ObjectId;
  nombre: string;
  fecha: Date;
  tipo: 'pdf' | 'imagen';
  tamañoBytes: number;
  urlArchivo: string; // Puede ser una URL de S3 o un path local
  notasPaciente?: string;
  revisadoPorMedico: boolean; // Si el médico ya lo vio en la preconsulta/consulta
  
  // Auditoría
  createdAt: Date;
  updatedAt: Date;
}

const ParaclinicoSchema = new Schema<IParaclinico>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
      index: true
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
    }
  },
  {
    timestamps: true
  }
);

// Índices
ParaclinicoSchema.index({ pacienteId: 1, fecha: -1 });

export default mongoose.model<IParaclinico>('Paraclinico', ParaclinicoSchema);
