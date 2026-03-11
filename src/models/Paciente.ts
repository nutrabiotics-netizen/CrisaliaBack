import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

export interface IContactoEmergencia {
  nombre: string;
  relacion: string;
  telefono: string;
}

export interface IAcudienteTutor {
  nombre: string;
  parentesco: string;
  telefono?: string;
}

export interface IPaciente extends Document {
  email: string;
  password: string;
  role: UserRole.PACIENTE;
  nombre: string;
  apellido: string;
  // Datos de identificación
  tipoDocumento?: 'CC' | 'TI' | 'RC' | 'PA' | 'CE';
  numeroDocumento?: string;
  fechaNacimiento?: Date;
  sexoBiologico?: 'masculino' | 'femenino' | 'intersexual';
  genero?: 'masculino' | 'femenino' | 'no-binario' | 'otro' | 'prefiero-no-decir';
  estadoCivil?: 'soltero' | 'casado' | 'union-libre' | 'divorciado' | 'viudo';
  nacionalidad?: string;
  lugarResidencia?: string;
  // Datos de contacto
  direccion?: string;
  telefono?: string;
  contactoEmergencia?: IContactoEmergencia;
  // Datos sociodemográficos y clínicos (perfil del paciente, precargables en cita)
  grupoSanguineo?: string;
  rh?: string;
  escolaridad?: string;
  ocupacion?: string;
  condicionDesplazamiento?: string;
  grupoEtnico?: string;
  // Datos de afiliación (aseguradora se obtiene de eps o campo específico)
  regimenAfiliacion?: 'contributivo' | 'subsidiado' | 'especial' | 'excepcion';
  eps?: string;
  aseguradora?: string;
  numeroAfiliacion?: string;
  // Acudiente/tutor (pacientes pediátricos o con discapacidad)
  acudiente?: IAcudienteTutor;
  // Estado
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const PacienteSchema = new Schema<IPaciente>(
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
      enum: [UserRole.PACIENTE],
      default: UserRole.PACIENTE
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
    fechaNacimiento: {
      type: Date,
      trim: true
    },
    telefono: {
      type: String,
      trim: true
    },
    // Datos de identificación
    tipoDocumento: {
      type: String,
      enum: ['CC', 'TI', 'RC', 'PA', 'CE'],
      trim: true
    },
    numeroDocumento: {
      type: String,
      trim: true
    },
    sexoBiologico: {
      type: String,
      enum: ['masculino', 'femenino', 'intersexual'],
      trim: true
    },
    genero: {
      type: String,
      enum: ['masculino', 'femenino', 'no-binario', 'otro', 'prefiero-no-decir'],
      trim: true
    },
    estadoCivil: {
      type: String,
      enum: ['soltero', 'casado', 'union-libre', 'divorciado', 'viudo'],
      trim: true
    },
    nacionalidad: {
      type: String,
      trim: true,
      default: 'Colombia'
    },
    lugarResidencia: {
      type: String,
      trim: true
    },
    // Datos sociodemográficos y clínicos (perfil del paciente)
    grupoSanguineo: { type: String, trim: true },
    rh: { type: String, trim: true },
    escolaridad: { type: String, trim: true },
    ocupacion: { type: String, trim: true },
    condicionDesplazamiento: { type: String, trim: true },
    grupoEtnico: { type: String, trim: true },
    // Datos de contacto
    direccion: {
      type: String,
      trim: true
    },
    contactoEmergencia: {
      nombre: {
        type: String,
        trim: true
      },
      relacion: {
        type: String,
        trim: true
      },
      telefono: {
        type: String,
        trim: true
      }
    },
    // Datos de afiliación
    regimenAfiliacion: {
      type: String,
      enum: ['contributivo', 'subsidiado', 'especial', 'excepcion'],
      trim: true
    },
    eps: {
      type: String,
      trim: true
    },
    aseguradora: {
      type: String,
      trim: true
    },
    numeroAfiliacion: {
      type: String,
      trim: true
    },
    acudiente: {
      nombre: { type: String, trim: true },
      parentesco: { type: String, trim: true },
      telefono: { type: String, trim: true }
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
PacienteSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar contraseñas
PacienteSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IPaciente>('Paciente', PacienteSchema);

