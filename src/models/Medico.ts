import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

export interface IMedico extends Document {
  email: string;
  password: string;
  role: UserRole.MEDICO;
  nombre: string;
  apellido: string;
  especialidad?: string;
  numeroColegiatura?: string;
  telefono?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

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
    activo: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Hash password antes de guardar
MedicoSchema.pre('save', async function (next: any) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Método para comparar contraseñas
MedicoSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IMedico>('Medico', MedicoSchema);

