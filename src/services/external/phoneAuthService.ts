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
 * Construye un regex que matchea el documento ignorando puntos, espacios,
 * guiones y prefijos/sufijos no-alfanuméricos (ej. "CC 1098765432", "1.098.765.432").
 */
function buildFuzzyDocRegex(doc: string): RegExp {
  const safe = doc.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Acepta cualquier cantidad de chars NO-alfanuméricos antes/entre/después.
  return new RegExp('^[^A-Za-z0-9]*' + safe.join('[^A-Za-z0-9]*') + '[^A-Za-z0-9]*$', 'i');
}

/**
 * Busca al usuario (paciente o médico) por su número de documento.
 *  - Paciente → campo `numeroDocumento`
 *  - Médico   → campo `numeroColegiatura` (su identificador de documento)
 * El usuario debe tener un teléfono registrado para poder recibir el OTP.
 *
 * Hace primero match exacto y, si falla, intenta un regex tolerante a
 * formatos típicos: "1.098.765.432", "CC 1098765432", "  1098765432  ", etc.
 */
async function buscarSujetoPorDocumento(
  documento: string
): Promise<{ role: 'paciente' | 'medico'; subject: any } | null> {
  const doc = normalizarDocumento(documento);
  if (!doc) {
    console.log('[docAuth] documento vacío tras normalizar');
    return null;
  }

  console.log('[docAuth] buscando documento normalizado:', JSON.stringify(doc));

  // 1) Match exacto contra paciente.numeroDocumento
  let paciente = await Paciente.findOne({ numeroDocumento: doc }).lean();
  if (paciente) {
    console.log('[docAuth] ✓ paciente (exacto)', paciente._id);
    return { role: 'paciente', subject: paciente };
  }

  // 2) Match exacto contra medico — por numeroColegiatura O por la cédula que
  // vive en perfilVerificacion.numeroDocumento (donde el form del médico la guarda).
  let medico = await Medico.findOne({
    $or: [
      { numeroColegiatura: doc },
      { 'perfilVerificacion.numeroDocumento': doc }
    ]
  }).lean();
  if (medico) {
    console.log('[docAuth] ✓ medico (exacto)', medico._id);
    return { role: 'medico', subject: medico };
  }

  // 3) Match tolerante (puntos, espacios, prefijo "CC", etc.)
  const fuzzy = buildFuzzyDocRegex(doc);
  console.log('[docAuth] intentando match fuzzy:', fuzzy.source);

  paciente = await Paciente.findOne({ numeroDocumento: fuzzy }).lean();
  if (paciente) {
    console.log('[docAuth] ✓ paciente (fuzzy)', paciente._id, '· stored:', JSON.stringify(paciente.numeroDocumento));
    return { role: 'paciente', subject: paciente };
  }

  medico = await Medico.findOne({
    $or: [
      { numeroColegiatura: fuzzy },
      { 'perfilVerificacion.numeroDocumento': fuzzy }
    ]
  }).lean();
  if (medico) {
    console.log(
      '[docAuth] ✓ medico (fuzzy)', medico._id,
      '· numeroColegiatura:', JSON.stringify((medico as any).numeroColegiatura),
      '· perfilVerificacion.numeroDocumento:', JSON.stringify((medico as any).perfilVerificacion?.numeroDocumento)
    );
    return { role: 'medico', subject: medico };
  }

  // Diagnóstico final: contar cuántos pacientes/médicos hay en la BD
  const [totPac, totMed] = await Promise.all([
    Paciente.countDocuments({ numeroDocumento: { $exists: true, $ne: null } }),
    Medico.countDocuments({ numeroColegiatura: { $exists: true, $ne: null } })
  ]);
  console.warn(
    '[docAuth] ✗ ningún match para', JSON.stringify(doc),
    `(pacientes con numeroDocumento: ${totPac}, médicos con numeroColegiatura: ${totMed})`
  );

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
  diagnostico?: any;
}> {
  if (!numeroDocumento || normalizarDocumento(numeroDocumento).length < 3) {
    return { sent: false, reason: 'documento_invalido' };
  }
  const found = await buscarSujetoPorDocumento(numeroDocumento);
  if (!found) {
    const docNorm = normalizarDocumento(numeroDocumento);
    const [pacCount, medColCount, medCedCount, pacSample, medColSample, medCedSample] = await Promise.all([
      Paciente.countDocuments({ numeroDocumento: { $exists: true, $nin: [null, ''] } as any }),
      Medico.countDocuments({ numeroColegiatura: { $exists: true, $nin: [null, ''] } as any }),
      Medico.countDocuments({ 'perfilVerificacion.numeroDocumento': { $exists: true, $nin: [null, ''] } as any }),
      Paciente.find({ numeroDocumento: { $exists: true, $nin: [null, ''] } as any })
        .select('numeroDocumento').limit(3).lean(),
      Medico.find({ numeroColegiatura: { $exists: true, $nin: [null, ''] } as any })
        .select('numeroColegiatura').limit(3).lean(),
      Medico.find({ 'perfilVerificacion.numeroDocumento': { $exists: true, $nin: [null, ''] } as any })
        .select('perfilVerificacion').limit(3).lean()
    ]);
    return {
      sent: false,
      reason: 'no_registrado',
      diagnostico: {
        documentoRecibido: numeroDocumento,
        documentoNormalizado: docNorm,
        pacientesConNumeroDocumento: pacCount,
        medicosConNumeroColegiatura: medColCount,
        medicosConCedulaEnPerfilVerificacion: medCedCount,
        muestraPacientes: pacSample.map((p: any) => p.numeroDocumento),
        muestraMedicosColegiatura: medColSample.map((m: any) => m.numeroColegiatura),
        muestraMedicosCedula: medCedSample.map((m: any) => m.perfilVerificacion?.numeroDocumento)
      }
    };
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
