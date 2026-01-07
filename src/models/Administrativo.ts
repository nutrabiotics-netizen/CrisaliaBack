import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

export interface IAdministrativo extends Document {
  email: string;
  password: string;
  role: UserRole.ADMINISTRATIVO;
  nombre: string;
  apellido: string;
  cargo?: string;
  telefono?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const AdministrativoSchema = new Schema<IAdministrativo>(
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
      enum: [UserRole.ADMINISTRATIVO],
      default: UserRole.ADMINISTRATIVO
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
    cargo: {
      type: String,
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
AdministrativoSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar contraseñas
AdministrativoSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IAdministrativo>('Administrativo', AdministrativoSchema);

