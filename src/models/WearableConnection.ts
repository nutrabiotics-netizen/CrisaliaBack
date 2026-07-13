import mongoose, { Schema, Document } from 'mongoose';

/**
 * Conexión OAuth de un paciente con un proveedor de wearables.
 * Guarda los tokens CIFRADOS (AES-256-GCM) usando `utils/cryptoTokens.ts`.
 *
 * - Un paciente puede tener UNA conexión activa por proveedor (unique compuesto).
 * - El refresh token se usa para renovar el access token cuando expira.
 * - `lastSyncAt` permite saber desde cuándo pedir datos en el próximo sync.
 */

import type { WearableSource } from './WearableData';

export interface IWearableConnection extends Document {
  pacienteId: mongoose.Types.ObjectId;
  source: WearableSource;
  /** Identificador del usuario en el proveedor (Fitbit userId, Oura email, etc.). */
  externalUserId?: string;
  /** Access token CIFRADO (AES-256-GCM). NUNCA en claro. */
  accessTokenEnc: string;
  /** Refresh token CIFRADO. */
  refreshTokenEnc?: string;
  /** Cuándo expira el access token. */
  expiresAt?: Date;
  /** Scopes concedidos por el usuario. */
  scopes?: string[];
  /** Última sincronización exitosa. */
  lastSyncAt?: Date;
  /** Si está revocada (paciente desconectó el wearable). */
  revoked: boolean;
  /** Mensaje del último error de sync (para mostrar al paciente). */
  lastErrorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WearableConnectionSchema = new Schema<IWearableConnection>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true, index: true },
    source: {
      type: String,
      required: true,
      enum: ['fitbit', 'google_health', 'oura', 'garmin', 'whoop', 'polar', 'apple_health', 'health_connect', 'manual']
    },
    externalUserId: { type: String },
    accessTokenEnc: { type: String, required: true, select: false }, // no se devuelve por default
    refreshTokenEnc: { type: String, select: false },
    expiresAt: { type: Date },
    scopes: [String],
    lastSyncAt: { type: Date },
    revoked: { type: Boolean, default: false, index: true },
    lastErrorMessage: { type: String }
  },
  { timestamps: true }
);

// Una conexión activa por paciente+proveedor
WearableConnectionSchema.index({ pacienteId: 1, source: 1 }, { unique: true });

export default mongoose.model<IWearableConnection>('WearableConnection', WearableConnectionSchema);
