import mongoose, { Schema, Document } from 'mongoose';

/**
 * Token externo emitido tras verificación OTP por WhatsApp.
 * Lo usa el agente externo (Tool/MCP) para actuar en nombre del paciente o médico.
 *
 * El token NO se guarda en claro — guardamos solo un hash sha256.
 * El cliente debe enviar el token completo en `Authorization: Bearer <token>`.
 */

export type ExternalRole = 'paciente' | 'medico';

export interface IExternalSession extends Document {
  /** Hash SHA-256 del token (nunca el token en claro). */
  tokenHash: string;
  /** Tipo de sujeto al que pertenece la sesión. */
  role: ExternalRole;
  /** ObjectId del paciente o médico. */
  subjectId: mongoose.Types.ObjectId;
  /** Documento usado para identificar al sujeto (numeroDocumento paciente / numeroColegiatura médico). */
  documento?: string;
  /** Teléfono al que se envió el OTP (E.164 sin +). */
  phone: string;
  /** Cuándo se emitió. */
  issuedAt: Date;
  /** Cuándo expira. */
  expiresAt: Date;
  /** Último uso (para analítica y revocación de inactividad). */
  lastUsedAt?: Date;
  /** Si fue revocado manualmente o por logout. */
  revoked: boolean;
  /** App externa que consume — útil para auditoría. */
  clientId?: string;
  /** User-Agent de la primera llamada. */
  userAgent?: string;
}

const ExternalSessionSchema = new Schema<IExternalSession>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ['paciente', 'medico'], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    documento: { type: String, index: true },
    phone: { type: String, required: true, index: true },
    issuedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date },
    revoked: { type: Boolean, default: false },
    clientId: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

// TTL: limpia sesiones expiradas automáticamente
ExternalSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Búsqueda rápida de sesiones activas por sujeto
ExternalSessionSchema.index({ subjectId: 1, role: 1, revoked: 1 });

export default mongoose.model<IExternalSession>('ExternalSession', ExternalSessionSchema);
