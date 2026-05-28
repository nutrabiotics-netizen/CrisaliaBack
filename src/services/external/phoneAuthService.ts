/**
 * Servicio de autenticación por NÚMERO DE DOCUMENTO para External Tools API.
 *
 * Flujo:
 *  1. POST /external/auth/request-otp { numeroDocumento }
 *     → busca al paciente (numeroDocumento) o médico (numeroColegiatura),
 *       toma su teléfono registrado y le envía un OTP por WhatsApp.
 *  2. POST /external/auth/verify-otp { numeroDocumento, otp }
 *     → valida el código contra el teléfono del sujeto y emite un token externo.
 *
 * El token externo se guarda como sha256 hash en `ExternalSession`. Vence en 7 días.
 * Se usa para acceder a las Tool APIs como `Authorization: Bearer <token>`.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import ExternalSession from '../../models/ExternalSession';
import {
  envioCodigoWhatsApp,
  verificarCodigoWhatsAppDetallado
} from '../whatsapp/whatsappService';

const TOKEN_TTL_DIAS = 7;

/** Normaliza teléfono — quita espacios, +, etc. */
function normalizarPhone(phone: string): string {
  return (phone || '').replace(/[^\d]/g, '');
}

/** Normaliza documento — quita espacios y guiones, conserva alfanumérico. */
function normalizarDocumento(doc: string): string {
  return (doc || '').replace(/[\s.-]/g, '').trim();
}

/** Enmascara un teléfono para mostrarlo sin exponerlo: 573001234567 → ***4567 */
function enmascararPhone(phone: string): string {
  const p = normalizarPhone(phone);
  if (p.length <= 4) return '****';
  return `***${p.slice(-4)}`;
}

/**
 * Busca al usuario (paciente o médico) por su número de documento.
 *  - Paciente → campo `numeroDocumento`
 *  - Médico   → campo `numeroColegiatura` (su identificador de documento)
 * El usuario debe tener un teléfono registrado para poder recibir el OTP.
 */
async function buscarSujetoPorDocumento(
  documento: string
): Promise<{ role: 'paciente' | 'medico'; subject: any } | null> {
  const doc = normalizarDocumento(documento);
  if (!doc) return null;

  const paciente = await Paciente.findOne({ numeroDocumento: doc }).lean();
  if (paciente) return { role: 'paciente', subject: paciente };

  const medico = await Medico.findOne({ numeroColegiatura: doc }).lean();
  if (medico) return { role: 'medico', subject: medico };

  return null;
}

/**
 * Paso 1: solicita OTP usando el número de documento.
 * Busca al sujeto, toma su teléfono registrado y le envía el código por WhatsApp.
 */
export async function requestOtp(
  numeroDocumento: string
): Promise<{
  sent: boolean;
  role?: 'paciente' | 'medico';
  phoneMasked?: string;
  reason?: string;
}> {
  if (!numeroDocumento || normalizarDocumento(numeroDocumento).length < 3) {
    return { sent: false, reason: 'documento_invalido' };
  }
  const found = await buscarSujetoPorDocumento(numeroDocumento);
  if (!found) {
    // No revelamos si el documento existe o no (security best practice).
    return { sent: false, reason: 'no_registrado' };
  }

  const phone = normalizarPhone(found.subject.telefono || '');
  if (!phone || phone.length < 7) {
    return { sent: false, reason: 'sin_telefono' };
  }

  try {
    await envioCodigoWhatsApp(phone);
    return { sent: true, role: found.role, phoneMasked: enmascararPhone(phone) };
  } catch (err) {
    console.error('[docAuth] error enviando OTP:', err);
    return { sent: false, reason: 'error_envio' };
  }
}

/**
 * Paso 2: verifica el OTP (contra el teléfono del sujeto) y emite un token externo.
 */
export async function verifyOtp(
  numeroDocumento: string,
  otp: string,
  clientId?: string,
  userAgent?: string
): Promise<
  | {
      ok: true;
      token: string;
      expiresAt: Date;
      role: 'paciente' | 'medico';
      subject: { _id: string; nombre: string; apellido?: string; documento: string };
    }
  | { ok: false; reason: string }
> {
  if (!numeroDocumento || !otp) return { ok: false, reason: 'datos_incompletos' };

  const found = await buscarSujetoPorDocumento(numeroDocumento);
  if (!found) return { ok: false, reason: 'no_registrado' };

  const phone = normalizarPhone(found.subject.telefono || '');
  if (!phone) return { ok: false, reason: 'sin_telefono' };

  const verif = await verificarCodigoWhatsAppDetallado(phone, otp);
  if (!verif.ok) return { ok: false, reason: verif.razon };

  const doc = normalizarDocumento(numeroDocumento);

  // Generar token aleatorio de 48 bytes (base64url ~64 chars) y guardar el hash
  const tokenRaw = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(tokenRaw).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DIAS * 24 * 60 * 60 * 1000);

  await ExternalSession.create({
    tokenHash,
    role: found.role,
    subjectId: new mongoose.Types.ObjectId(found.subject._id),
    documento: doc,
    phone,
    issuedAt: new Date(),
    expiresAt,
    revoked: false,
    clientId,
    userAgent
  });

  return {
    ok: true,
    token: tokenRaw,
    expiresAt,
    role: found.role,
    subject: {
      _id: String(found.subject._id),
      nombre: found.subject.nombre ?? '',
      apellido: found.subject.apellido ?? undefined,
      documento: doc
    }
  };
}

/**
 * Resuelve un token externo a su sesión. Retorna null si no existe, está
 * revocada, expirada o no encaja con la firma.
 */
export async function resolveToken(token: string): Promise<{
  role: 'paciente' | 'medico';
  subjectId: string;
  documento?: string;
  phone: string;
  sessionId: string;
} | null> {
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const session = await ExternalSession.findOne({ tokenHash, revoked: false }).lean();
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) return null;

  // Actualizar lastUsedAt (fire-and-forget)
  ExternalSession.updateOne({ _id: session._id }, { $set: { lastUsedAt: new Date() } })
    .exec()
    .catch(() => {});

  return {
    role: session.role,
    subjectId: String(session.subjectId),
    documento: session.documento,
    phone: session.phone,
    sessionId: String(session._id)
  };
}

/** Revoca una sesión (logout). */
export async function revokeToken(token: string): Promise<boolean> {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const res = await ExternalSession.updateOne({ tokenHash }, { $set: { revoked: true } });
  return res.modifiedCount > 0;
}
