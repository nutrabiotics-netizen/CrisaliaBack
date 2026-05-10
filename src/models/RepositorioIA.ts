import mongoose, { Schema, Document } from 'mongoose';

export type TipoContenido = 'conferencia' | 'charla' | 'webinar' | 'articulo' | 'protocolo';

export interface IRepositorioIA extends Document {
  titulo: string;
  autor: string;
  tipo: TipoContenido;
  categorias: string[];
  descripcion: string;
  duracion?: string;
  url?: string;
  transcripcion?: string;
  tags: string[];
  visualizaciones: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RepositorioIASchema = new Schema<IRepositorioIA>(
  {
    titulo: { type: String, required: true, trim: true },
    autor: { type: String, required: true, trim: true },
    tipo: {
      type: String,
      enum: ['conferencia', 'charla', 'webinar', 'articulo', 'protocolo'],
      required: true
    },
    categorias: [{ type: String, trim: true }],
    descripcion: { type: String, required: true, trim: true },
    duracion: { type: String, trim: true },
    url: { type: String, trim: true },
    transcripcion: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    visualizaciones: { type: Number, default: 0 },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

RepositorioIASchema.index({ categorias: 1, activo: 1 });
RepositorioIASchema.index({ tags: 1 });
RepositorioIASchema.index({ titulo: 'text', descripcion: 'text', transcripcion: 'text', tags: 'text' });

export default mongoose.model<IRepositorioIA>('RepositorioIA', RepositorioIASchema);
