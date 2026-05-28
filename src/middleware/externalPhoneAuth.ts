/**
 * Middleware para autenticación de External Tools API por teléfono.
 *
 * Valida el header `Authorization: Bearer <phoneToken>` (obtenido en /external/auth/verify-otp).
 * Coloca en `req` el contexto del paciente o médico autenticado:
 *   req.externalRole     → 'paciente' | 'medico'
 *   req.externalSubjectId → ObjectId string
 *   req.externalPhone    → teléfono normalizado
 *   req.externalSessionId → para auditoría/revocación
 */

import { Request, Response, NextFunction } from 'express';
import { resolveToken } from '../services/external/phoneAuthService';

export interface ExternalPhoneRequest extends Request {
  externalRole?: 'paciente' | 'medico';
  externalSubjectId?: string;
  externalPhone?: string;
  externalDocumento?: string;
  externalSessionId?: string;
}

export async function requirePhoneToken(
  req: ExternalPhoneRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const auth = req.headers.authorization || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({
        success: false,
        error: 'missing_token',
        message: 'Falta header Authorization: Bearer <phoneToken>'
      });
      return;
    }
    const token = match[1].trim();
    const session = await resolveToken(token);
    if (!session) {
      res.status(401).json({
        success: false,
        error: 'invalid_or_expired_token',
        message: 'Token no válido, expirado o revocado. Vuelve a solicitar OTP.'
      });
      return;
    }
    req.externalRole = session.role;
    req.externalSubjectId = session.subjectId;
    req.externalPhone = session.phone;
    req.externalDocumento = session.documento;
    req.externalSessionId = session.sessionId;
    next();
  } catch (err) {
    console.error('[requirePhoneToken]', err);
    res.status(500).json({ success: false, error: 'auth_error', message: 'Error validando token' });
  }
}

/** Requiere que el rol sea paciente. */
export function requirePaciente(
  req: ExternalPhoneRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.externalRole !== 'paciente') {
    res.status(403).json({
      success: false,
      error: 'role_mismatch',
      message: 'Este endpoint requiere un paciente autenticado'
    });
    return;
  }
  next();
}

/** Requiere que el rol sea médico. */
export function requireMedico(
  req: ExternalPhoneRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.externalRole !== 'medico') {
    res.status(403).json({
      success: false,
      error: 'role_mismatch',
      message: 'Este endpoint requiere un médico autenticado'
    });
    return;
  }
  next();
}
