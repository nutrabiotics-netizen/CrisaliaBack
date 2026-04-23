import { Response } from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { AuthRequest } from '../../middleware/auth';
import HistoriaClinica from '../../models/HistoriaClinica';
import Paciente from '../../models/Paciente';

const HC_TOKEN_SECRET = process.env.HC_QR_SECRET || process.env.JWT_SECRET || 'crisal-hc-qr-secret';
const HC_TOKEN_TTL = '48h';

/**
 * GET /api/paciente/hc-publica/generar-token
 * Genera un JWT de corta vida (48h) que da acceso de solo lectura a la HC del paciente.
 * También retorna el QR como data URL base64.
 */
export const generarTokenHCPublica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado.' }); return; }

    const token = jwt.sign({ pacienteId, tipo: 'hc_publica' }, HC_TOKEN_SECRET, { expiresIn: HC_TOKEN_TTL });
    const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/hc-publica/${token}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#443c92', light: '#ffffff' }
    });

    res.json({ success: true, token, url, qr: qrDataUrl });
  } catch (err) {
    console.error('[HCPublica] generarToken:', err);
    res.status(500).json({ mensaje: 'Error al generar el token QR.' });
  }
};

/**
 * GET /api/public/hc-publica/:token
 * Endpoint público que el médico accede al escanear el QR.
 * Retorna una vista simplificada de la HC (sin datos de pago).
 */
export const verHCPublica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    let payload: any;
    try {
      payload = jwt.verify(String(token), HC_TOKEN_SECRET);
    } catch {
      res.status(401).json({ mensaje: 'El enlace expiró o es inválido. Pide al paciente que genere uno nuevo.' });
      return;
    }

    if (payload.tipo !== 'hc_publica') {
      res.status(403).json({ mensaje: 'Token no válido para este recurso.' });
      return;
    }

    const pacienteId = payload.pacienteId;

    const [paciente, hcReciente] = await Promise.all([
      Paciente.findById(pacienteId)
        .select('nombre apellido fechaNacimiento gruposInteres')
        .lean(),
      HistoriaClinica.findOne({ pacienteId })
        .sort({ createdAt: -1 })
        .select('motivoConsulta enfermedadActual antecedentes alertas alergias diagnosticos recomendaciones createdAt')
        .lean()
    ]);

    if (!paciente) {
      res.status(404).json({ mensaje: 'Paciente no encontrado.' });
      return;
    }

    res.json({
      success: true,
      paciente: {
        nombre: `${(paciente as any).nombre || ''} ${(paciente as any).apellido || ''}`.trim(),
        fechaNacimiento: (paciente as any).fechaNacimiento
      },
      historiaClinica: hcReciente ?? null,
      generadoEn: new Date().toISOString(),
      aviso: 'Esta información es de carácter confidencial. Acceso autorizado por el paciente.'
    });
  } catch (err) {
    console.error('[HCPublica] verHCPublica:', err);
    res.status(500).json({ mensaje: 'Error al obtener la historia clínica.' });
  }
};
