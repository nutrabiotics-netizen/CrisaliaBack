import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../types';

export type AccionTipo = 'crear' | 'actualizar' | 'eliminar' | 'cancelar' | 'confirmar' | 'completar';
export type EntidadTipo = 'Cita' | 'Paciente' | 'Medico' | 'Anamnesis' | 'Interrogatorio' | 'Consulta' | 'Pago' | 'ConfiguracionAgenda' | 'HistoriaClinica';

export interface IAuditoria extends Document {
  usuarioId: mongoose.Types.ObjectId;
  usuarioRol: UserRole;
  usuarioEmail?: string;
  usuarioNombre?: string;
  accion: AccionTipo;
  entidad: EntidadTipo;
  entidadId: mongoose.Types.ObjectId;
  datosAnteriores?: Record<string, any>;
  datosNuevos?: Record<string, any>;
  motivo?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditoriaSchema = new Schema<IAuditoria>(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true
    },
    usuarioRol: {
      type: String,
      enum: Object.values(UserRole),
      required: true
    },
    usuarioEmail: {
      type: String,
      trim: true
    },
    usuarioNombre: {
      type: String,
      trim: true
    },
    accion: {
      type: String,
      enum: ['crear', 'actualizar', 'eliminar', 'cancelar', 'confirmar', 'completar'],
      required: true,
      index: true
    },
    entidad: {
      type: String,
      enum: ['Cita', 'Paciente', 'Medico', 'Anamnesis', 'Interrogatorio', 'Consulta', 'Pago', 'ConfiguracionAgenda', 'HistoriaClinica'],
      required: true,
      index: true
    },
    entidadId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true
    },
    datosAnteriores: {
      type: Schema.Types.Mixed
    },
    datosNuevos: {
      type: Schema.Types.Mixed
    },
    motivo: {
      type: String,
      trim: true
    },
    ip: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Índices compuestos para búsquedas frecuentes
AuditoriaSchema.index({ entidad: 1, entidadId: 1 });
AuditoriaSchema.index({ usuarioId: 1, createdAt: -1 });
AuditoriaSchema.index({ accion: 1, entidad: 1, createdAt: -1 });

export default mongoose.model<IAuditoria>('Auditoria', AuditoriaSchema);

