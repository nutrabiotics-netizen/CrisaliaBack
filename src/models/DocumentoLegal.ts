import mongoose, { Schema, Document } from 'mongoose';

export interface IDocumentoLegal extends Document {
  titulo: string;
  slug: string; // Identificador único como 'terminos-condiciones', 'consentimiento-ia'
  contenido: string;
  version: string;
  activo: boolean;
  obligatorio: boolean;
  tipo: 'terminos' | 'consentimiento' | 'politica';
  createdAt: Date;
  updatedAt: Date;
}

const DocumentoLegalSchema = new Schema<IDocumentoLegal>(
  {
    titulo: {
      type: String,
      required: true
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    contenido: {
      type: String,
      required: true
    },
    version: {
      type: String,
      required: true,
      default: '1.0'
    },
    activo: {
      type: Boolean,
      default: true
    },
    obligatorio: {
      type: Boolean,
      default: true
    },
    tipo: {
      type: String,
      enum: ['terminos', 'consentimiento', 'politica'],
      required: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IDocumentoLegal>('DocumentoLegal', DocumentoLegalSchema);
