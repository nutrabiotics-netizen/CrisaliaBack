// Tipos base para usuarios
export enum UserRole {
  MEDICO = 'medico',
  PACIENTE = 'paciente',
  ADMINISTRATIVO = 'administrativo'
}

export interface User {
  _id?: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

// Tipos para Médico
export interface Medico extends User {
  role: UserRole.MEDICO;
  nombre: string;
  apellido: string;
  especialidad?: string;
  numeroColegiatura?: string;
  telefono?: string;
}

// Tipos para Paciente
export interface Paciente extends User {
  role: UserRole.PACIENTE;
  nombre: string;
  apellido: string;
  fechaNacimiento?: Date;
  telefono?: string;
  direccion?: string;
}

// Tipos para Administrativo
export interface Administrativo extends User {
  role: UserRole.ADMINISTRATIVO;
  nombre: string;
  apellido: string;
  cargo?: string;
}

// Tipos para Agendamiento
export interface Cita {
  _id?: string;
  pacienteId: string;
  medicoId: string;
  fecha: Date;
  hora: string;
  tipo: 'preconsulta' | 'consulta' | 'control';
  modalidad: 'presencial' | 'virtual';
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  meetingId?: string;
  motivoCancelacion?: string;
  creadoPor?: string;
  creadoPorRol?: string;
  actualizadoPor?: string;
  actualizadoPorRol?: string;
  canceladoPor?: string;
  canceladoPorRol?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Tipos para Anamnesis
export interface Anamnesis {
  _id?: string;
  pacienteId: string;
  medicoId: string;
  citaId: string;
  respuestas: Record<string, any>;
  analisisIA?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Tipos para Consulta
export interface Consulta {
  _id?: string;
  pacienteId: string;
  medicoId: string;
  citaId: string;
  diagnostico?: string[];
  tratamiento?: string;
  notas?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Tipos para Pago
export interface Pago {
  _id?: string;
  pacienteId: string;
  medicoId: string;
  citaId: string;
  monto: number;
  metodoPago: string;
  estado: 'pendiente' | 'completado' | 'rechazado';
  createdAt?: Date;
  updatedAt?: Date;
}

