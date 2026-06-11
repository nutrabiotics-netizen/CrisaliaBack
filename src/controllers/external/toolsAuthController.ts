/**
 * Endpoints de autenticación por NÚMERO DE DOCUMENTO para External Tools.
 *  POST /external/auth/request-otp { numeroDocumento }
 *  POST /external/auth/verify-otp  { numeroDocumento, otp }
 *  POST /external/auth/revoke      (Bearer token) → logout
 *
 * El OTP se envía por WhatsApp al teléfono registrado del paciente/médico
 * identificado por su documento (paciente: numeroDocumento, médico: numeroColegiatura).
 */

import { Request, Response } from 'express';
import {
  requestOtp,
  verifyOtp,
  revokeToken
} from '../../services/external/phoneAuthService';
import { ExternalPhoneRequest } from '../../middleware/externalPhoneAuth';

export const postRequestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { numeroDocumento, documento } = req.body ?? {};
    const doc = numeroDocumento ?? documento;
    if (!doc) {
      res.status(400).json({ success: false, error: 'missing_documento', message: 'Falta numeroDocumento' });
      return;
    }
    const r = await requestOtp(String(doc));
    if (!r.sent) {
      const map: Record<string, string> = {
        no_registrado: 'El documento no está registrado como paciente ni médico',
        documento_invalido: 'Número de documento inválido',
        sin_telefono: 'El usuario no tiene un teléfono registrado para enviar el código',
        error_envio: 'No se pudo enviar el OTP'
      };
      res.status(400).json({
        success: false,
        error: r.reason ?? 'no_enviado',
        message: map[r.reason ?? ''] ?? 'No se pudo enviar el OTP',
        diagnostico: r.diagnostico
      });
      return;
    }
    res.status(200).json({
      success: true,
      sent: true,
      role: r.role,
      phoneMasked: r.phoneMasked,
      message: `Código enviado por WhatsApp al teléfono registrado (${r.phoneMasked}). Tienes 5 minutos para verificarlo.`,
      expiresInSeconds: 300
    });
  } catch (err) {
    console.error('[postRequestOtp]', err);
    res.status(500).json({ success: false, error: 'server_error', message: 'Error solicitando OTP' });
  }
};

export const postVerifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { numeroDocumento, documento, otp, clientId } = req.body ?? {};
    const doc = numeroDocumento ?? documento;
    if (!doc || !otp) {
      res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'Faltan numeroDocumento u otp'
      });
      return;
    }
    const userAgent = req.headers['user-agent'] as string | undefined;
    const r = await verifyOtp(String(doc), String(otp), clientId, userAgent);
    if (!r.ok) {
      const map: Record<string, string> = {
        sin_codigo: 'No hay código vigente. Solicita uno nuevo.',
        expirado: 'El código expiró. Solicita uno nuevo.',
        codigo_incorrecto: 'Código incorrecto.',
        bloqueado: 'Demasiados intentos. Solicita un código nuevo.',
        no_registrado: 'Documento no registrado.',
        sin_telefono: 'El usuario no tiene teléfono registrado.',
        datos_incompletos: 'Faltan datos.'
      };
      res.status(401).json({
        success: false,
        error: r.reason,
        message: map[r.reason] ?? r.reason
      });
      return;
    }
    res.status(200).json({
      success: true,
      token: r.token,
      tokenType: 'Bearer',
      expiresAt: r.expiresAt.toISOString(),
      role: r.role,
      subject: r.subject,
      message:
        'Sesión externa creada. Usa el token en Authorization: Bearer <token> ' +
        'para llamar a los endpoints /external/tools/...'
    });
  } catch (err) {
    console.error('[postVerifyOtp]', err);
    res.status(500).json({ success: false, error: 'server_error', message: 'Error verificando OTP' });
  }
};

export const postRevoke = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const auth = req.headers.authorization || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(400).json({ success: false, error: 'no_token' });
      return;
    }
    const revoked = await revokeToken(match[1].trim());
    res.status(200).json({ success: true, revoked });
  } catch (err) {
    console.error('[postRevoke]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};
