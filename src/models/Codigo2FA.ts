import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Modelo para códigos 2FA enviados por WhatsApp.
 *
 * - El código se guarda **hasheado** (bcrypt), no en plano.
 * - `expiresAt` está indexado como TTL → Mongo borra automáticamente los
 *   documentos vencidos (no necesitamos un cron).
 * - Soporta múltiples códigos por teléfono (cada envío crea un doc nuevo).
 *   La verificación toma el más reciente vigente y descarta los demás.
 * - Cuenta intentos para limitar fuerza bruta (3 intentos por código).
 */
export interface ICodigo2FA extends Document {
  telefono: string;
  codigoHash: string;
  expiresAt: Date;
  intentos: number;
  usado: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const Codigo2FASchema = new Schema<ICodigo2FA>(
  {
    telefono: { type: String, required: true, index: true },
    codigoHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    intentos: { type: Number, default: 0 },
    usado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// TTL: Mongo borra el documento cuando expiresAt < ahora.
// expireAfterSeconds: 0 → la expiración se respeta exactamente al timestamp del campo.
Codigo2FASchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
Codigo2FASchema.index({ telefono: 1, createdAt: -1 });

// Helpers estáticos para hashear / comparar el código sin exponer bcrypt fuera del modelo.
export async function hashCodigo(codigo: string): Promise<string> {
  return bcrypt.hash(codigo, 8);
}

export async function compararCodigo(codigo: string, hash: string): Promise<boolean> {
  return bcrypt.compare(codigo, hash);
}

export default mongoose.model<ICodigo2FA>('Codigo2FA', Codigo2FASchema);
