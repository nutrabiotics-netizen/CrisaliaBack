import { Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { AuthRequest } from '../../middleware/auth';
import LinkCaptacion from '../../models/LinkCaptacion';

function generarCodigo(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * GET /api/medico/mi-link-referido
 * Retorna el link de referido activo del médico (o crea uno nuevo si no existe/expiró).
 * Incluye QR como data URL.
 */
export const getMiLinkReferido = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ mensaje: 'No autorizado.' }); return; }

    // Buscar link activo existente del médico
    let link: any = await LinkCaptacion.findOne({
      medicoReferidorId: medicoId,
      tipo: 'referido',
      estado: 'activo',
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).lean();

    // Si no hay uno vigente, crear uno nuevo (30 días de validez)
    if (!link) {
      const codigo = generarCodigo();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const created = await LinkCaptacion.create({
        codigo,
        tipo: 'referido',
        medicoReferidorId: medicoId,
        descuentoAsociado: 15, // 15% de descuento para médicos referidos
        expiresAt,
        creadoPor: 'medico'
      });
      link = created.toObject();
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${frontendUrl}/registro-medico?codigo=${link.codigo}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: '#443c92', light: '#ffffff' }
    });

    res.json({
      success: true,
      codigo: link.codigo,
      url,
      qr: qrDataUrl,
      descuentoAsociado: link.descuentoAsociado,
      expiresAt: link.expiresAt
    });
  } catch (err) {
    console.error('[MiLinkReferido] error:', err);
    res.status(500).json({ mensaje: 'Error al generar el link de referido.' });
  }
};

/**
 * POST /api/medico/mi-link-referido/renovar
 * Expira el link actual y genera uno nuevo.
 */
export const renovarMiLinkReferido = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ mensaje: 'No autorizado.' }); return; }

    // Expirar todos los links activos del médico
    await LinkCaptacion.updateMany(
      { medicoReferidorId: medicoId, tipo: 'referido', estado: 'activo' },
      { $set: { estado: 'expirado' } }
    );

    // Crear uno nuevo
    const codigo = generarCodigo();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const nuevoLink = await LinkCaptacion.create({
      codigo,
      tipo: 'referido',
      medicoReferidorId: medicoId,
      descuentoAsociado: 15,
      expiresAt,
      creadoPor: 'medico'
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${frontendUrl}/registro-medico?codigo=${nuevoLink.codigo}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2, color: { dark: '#443c92', light: '#ffffff' } });

    res.json({ success: true, codigo: nuevoLink.codigo, url, qr: qrDataUrl, expiresAt: nuevoLink.expiresAt });
  } catch (err) {
    console.error('[MiLinkReferido] renovar error:', err);
    res.status(500).json({ mensaje: 'Error al renovar el link.' });
  }
};
