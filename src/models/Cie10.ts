import mongoose, { Schema, Document } from 'mongoose';

/**
 * Catálogo CIE-10 oficial (Clasificación Internacional de Enfermedades, 10ma revisión).
 *
 * Fuente recomendada para Colombia: Resolución 2358 de 2014 del Ministerio
 * de Salud (publicada en datos.gov.co y SISPRO). El CSV típico tiene los
 * campos `codigo` y `descripcion` como mínimo.
 *
 * Carga con `npm run load-cie10 -- <ruta-del-csv>` (script: scripts/loadCie10.ts).
 */

export type GeneroAplicable = 'M' | 'F' | 'AMBOS';

export interface ICie10 extends Document {
  codigo: string;
  descripcion: string;
  /** Capítulo CIE-10 (ej: "Enfermedades endocrinas, nutricionales y metabólicas"). */
  capitulo?: string;
  /** Grupo dentro del capítulo (ej: "Diabetes mellitus"). */
  grupo?: string;
  /** Restricción de género (algunos códigos solo aplican a M o F). */
  genero: GeneroAplicable;
  /** Restricción de edad mínima en años (ej: 18 para algunos códigos de adulto). */
  edadMin?: number;
  /** Restricción de edad máxima en años. */
  edadMax?: number;
  /** Si está vigente para uso clínico/RIPS. */
  activo: boolean;
  /** Si es una cabecera de categoría (ej: "E11") vs subcódigo específico (ej: "E11.9"). */
  esCabecera: boolean;
  /** Sinónimos / términos populares (para búsqueda) — opcional. */
  sinonimos?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const Cie10Schema = new Schema<ICie10>(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 10
    },
    descripcion: { type: String, required: true, trim: true, maxlength: 500 },
    capitulo: { type: String, trim: true },
    grupo: { type: String, trim: true },
    genero: { type: String, enum: ['M', 'F', 'AMBOS'], default: 'AMBOS' },
    edadMin: { type: Number, min: 0, max: 120 },
    edadMax: { type: Number, min: 0, max: 120 },
    activo: { type: Boolean, default: true },
    esCabecera: { type: Boolean, default: false },
    sinonimos: { type: [String], default: [] }
  },
  { timestamps: true }
);

// Índice compuesto para búsqueda rápida por código (prefix) y por activo
Cie10Schema.index({ activo: 1, codigo: 1 });
// Índice de texto para búsqueda fuzzy en descripción + sinónimos
Cie10Schema.index(
  { descripcion: 'text', sinonimos: 'text' },
  { default_language: 'spanish', weights: { descripcion: 10, sinonimos: 5 } }
);

export default mongoose.model<ICie10>('Cie10', Cie10Schema);
