import mongoose, { Schema, Document } from 'mongoose';

export type TipoPersonal = 'asistencial' | 'administrativo';

export interface IPersonalInstitucional extends Document {
  tipo: TipoPersonal;
  nombre: string;
  apellido?: string;
  /** Área (asistencial) o cargo (administrativo) */
  cargo: string;
  activo: boolean;
  /** Solo para tipo administrativo: habilita usuario de ingreso (login) */
  email?: string;
  /** Ref al usuario Administrativo creado cuando se asigna email/contraseña */
  administrativoId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PersonalInstitucionalSchema = new Schema<IPersonalInstitucional>(
  {
    tipo: {
      type: String,
      enum: ['asistencial', 'administrativo'],
      required: true,
      index: true
    },
    nombre: {
      type: String,
      required: true,
      trim: true
    },
    apellido: {
      type: String,
      trim: true,
      default: ''
    },
    cargo: {
      type: String,
      required: true,
      trim: true
    },
    activo: {
      type: Boolean,
      default: true
    },
    email: { type: String, trim: true, lowercase: true, default: null },
    administrativoId: { type: Schema.Types.ObjectId, ref: 'Administrativo', default: null }
  },
  { timestamps: true }
);

PersonalInstitucionalSchema.index({ tipo: 1, activo: 1 });

export default mongoose.model<IPersonalInstitucional>('PersonalInstitucional', PersonalInstitucionalSchema);
