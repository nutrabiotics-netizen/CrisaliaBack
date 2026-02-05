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
    categoriaGeneral: { type: String, trim: true, default: '' },
    descripcionBase: { type: String, trim: true, default: '' },
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
