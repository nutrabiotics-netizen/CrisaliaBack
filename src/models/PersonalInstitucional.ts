import mongoose, { Schema, Document } from 'mongoose';

export type TipoPersonal = 'asistencial' | 'administrativo';
export type CategoriaPersonal = 'asistencial_salud' | 'administrativo' | 'servicios_generales';

export interface IPersonalInstitucional extends Document {
  tipo: TipoPersonal;
  /** Subcategoría del diagrama PERFIL ADM */
  categoria: CategoriaPersonal;
  nombre: string;
  apellido?: string;
  cargo: string;
  activo: boolean;
  email?: string;
  administrativoId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PersonalInstitucionalSchema = new Schema<IPersonalInstitucional>(
  {
    tipo: {
      type: String,
      enum: ['asistencial', 'administrativo'],
      required: true
    },
    categoria: {
      type: String,
      enum: ['asistencial_salud', 'administrativo', 'servicios_generales'],
      default: 'asistencial_salud',
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
