import mongoose, { Document, Schema } from 'mongoose';
import { IMaterial } from '../interfaces/material.interface';

export interface MaterialDocument extends Document, IMaterial {}

const materialSchema = new Schema<MaterialDocument>(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    nombre: { type: String, trim: true, default: '' },
    marca: { type: String, trim: true, default: '' },
    formaFarmaceutica: { type: String, trim: true, default: '' },
    concentracion: { type: String, trim: true, default: '' },
    unidadMedida: { type: String, trim: true, default: '' },
    viaAdministracion: { type: String, trim: true, default: '' },
    presentacion: { type: String, trim: true, default: '' },
    recomendacionesUso: { type: String, trim: true, default: '' },
    registroSanitario: { type: String, trim: true, default: '' },
    categoria: { type: String, trim: true, default: '' },
    descripcion: { type: String, trim: true, default: '' },
    composicion: { type: String, trim: true, default: '' },
    
    // Arrays for legacy support / multiple mockups
    presentaciones: [
      new Schema(
        {
          nombre: { type: String, required: true, trim: true },
          mockup: { type: String, trim: true, default: '' },
        },
        { _id: false }
      )
    ],
    mockups: [{ type: String, trim: true }],
    linksRotulos: [{ type: String, trim: true }],

    activo: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'materiales',
  }
);

// unique: true en codigo ya crea el índice; no duplicar con schema.index()

const Material = mongoose.model<MaterialDocument>('Material', materialSchema);

export default Material;
