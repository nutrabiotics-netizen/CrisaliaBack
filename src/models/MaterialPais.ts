import mongoose, { Document, Schema } from 'mongoose';
import { IMaterialPais, PaisCode, EstadoRegulatorio } from '../interfaces/material.interface';

export interface MaterialPaisDocument extends Document, IMaterialPais {}

const paisEnum: PaisCode[] = ['CO', 'EC', 'MX', 'PE', 'CR'];
const estadoRegulatorioEnum: EstadoRegulatorio[] = ['aprobado', 'no_aprobado', 'en_revision'];

const presentacionItemSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    mockup: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const materialPaisSchema = new Schema<MaterialPaisDocument>(
  {
    material: {
      type: Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
    },
    pais: {
      type: String,
      required: true,
      enum: paisEnum,
      uppercase: true,
    },
    registroSanitario: { type: String, trim: true, default: '' },
    categoriaLocal: { type: String, trim: true, default: '' },
    textosObligatorios: { type: String, trim: true, default: '' },
    advertencias: { type: String, trim: true, default: '' },
    precauciones: { type: String, trim: true, default: '' },
    usoPosologia: { type: String, trim: true, default: '' },
    textoRegulatorio: { type: String, trim: true, default: '' },
    claimLogo: { type: String, trim: true, default: '' },
    descripcionLocal: { type: String, trim: true, default: '' },
    composicion: { type: String, trim: true, default: '' },
    presentaciones: [presentacionItemSchema],
    mockups: [{ type: String, trim: true }],
    linksRotulos: [{ type: String, trim: true }],
    estadoRegulatorio: {
      type: String,
      trim: true,
      lowercase: true,
      enum: estadoRegulatorioEnum,
    },
  },
  {
    timestamps: true,
    collection: 'material_pais',
  }
);

// Índice único compuesto: un material solo puede tener una variante por país.
materialPaisSchema.index({ material: 1, pais: 1 }, { unique: true });

const MaterialPais = mongoose.model<MaterialPaisDocument>('MaterialPais', materialPaisSchema);

export default MaterialPais;
