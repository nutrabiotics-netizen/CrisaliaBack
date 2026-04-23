import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

/** Preferencias del asistente STT/TTS + Bedrock en perfil médico */
export interface IMedicoCopilotoVoz {
  /** Si es false, el WebSocket del copiloto rechaza la conexión */
  habilitado?: boolean;
}

export interface IMedico extends Document {
  email: string;
  password: string;
  role: UserRole.MEDICO;
  nombre: string;
  apellido: string;
  especialidad?: string;
  numeroColegiatura?: string;
  telefono?: string;
  whatsapp?: string;
  activo: boolean;
  /** URL del logo del médico (ej. S3) para documentos/PDFs */
  logoUrl?: string;
  /** URL de la imagen de firma del médico para documentos/PDFs */
  firmaUrl?: string;
  /** Indicaciones y recomendaciones que el paciente debe ver antes de la consulta */
  indicacionesAntesConsulta?: string;
  /** Perfil de verificación y datos para filtros de búsqueda (grupos de interés, modalidades, etc.) */
  perfilVerificacion?: Record<string, unknown>;
  copilotoVoz?: IMedicoCopilotoVoz;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const CopilotoVozSchema = new Schema<IMedicoCopilotoVoz>(
  {
    habilitado: { type: Boolean, default: true }
  },
  { _id: false }
);

const MedicoSchema = new Schema<IMedico>(
  {
    email: {
      type: String,
      required: [true, 'El email es requerido'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Por favor ingresa un email válido']
    },
    password: {
      type: String,
      required: [true, 'La contraseña es requerida'],
      minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
      select: false
    },
    role: {
      type: String,
      enum: [UserRole.MEDICO],
      default: UserRole.MEDICO
    },
    nombre: {
      type: String,
      required: [true, 'El nombre es requerido'],
      trim: true
    },
    apellido: {
      type: String,
      required: [true, 'El apellido es requerido'],
      trim: true
    },
    especialidad: {
      type: String,
      trim: true
    },
    numeroColegiatura: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },
    telefono: {
      type: String,
      trim: true
    },
    whatsapp: {
      type: String,
      trim: true
    },
    activo: {
      type: Boolean,
      default: true
    },
    logoUrl: { type: String, trim: true },
    firmaUrl: { type: String, trim: true },
    indicacionesAntesConsulta: { type: String, trim: true, default: '' },
    perfilVerificacion: { type: Schema.Types.Mixed, default: {} },
    copilotoVoz: { type: CopilotoVozSchema, default: () => ({}) }
  },
  {
    timestamps: true
  }
);

// Hash password antes de guardar
MedicoSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar contraseñas
MedicoSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IMedico>('Medico', MedicoSchema);

