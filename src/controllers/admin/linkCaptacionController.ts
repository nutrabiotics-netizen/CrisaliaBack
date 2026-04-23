import { Request, Response } from 'express';
import crypto from 'crypto';
import LinkCaptacion from '../../models/LinkCaptacion';
import ReferidoMedico from '../../models/ReferidoMedico';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generarCodigo(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars hex
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/links-captacion
 * Admin genera un link de captación para médicos.
 */
export const crearLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      tipo = 'evento',
      medicoReferidorId,
      descuentoAsociado = 0,
      diasVigencia = 30
    } = req.body;

    const codigo = generarCodigo();
    const expiresAt = new Date(Date.now() + diasVigencia * 24 * 60 * 60 * 1000);

    const link = await LinkCaptacion.create({
      codigo,
      tipo,
      medicoReferidorId: medicoReferidorId || undefined,
      descuentoAsociado,
      expiresAt,
      creadoPor: 'admin'
    });

    const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/registro-medico?codigo=${codigo}`;

    res.status(201).json({
      success: true,
      link,
      url
    });
  } catch (err) {
    console.error('[LinkCaptacion] crearLink:', err);
    res.status(500).json({ mensaje: 'Error al crear el link de captación.' });
  }
};

/**
 * GET /api/admin/links-captacion
 * Lista todos los links con estado actual.
 */
export const listarLinks = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Expirar links vencidos automáticamente
    await LinkCaptacion.updateMany(
      { estado: 'activo', expiresAt: { $lt: new Date() } },
      { $set: { estado: 'expirado' } }
    );

    const links = await LinkCaptacion.find()
      .sort({ createdAt: -1 })
      .populate('medicoReferidorId', 'nombre apellido')
      .populate('usadoPorMedicoId', 'nombre apellido')
      .lean();

    res.json({ success: true, links });
  } catch (err) {
    console.error('[LinkCaptacion] listarLinks:', err);
    res.status(500).json({ mensaje: 'Error al listar los links.' });
  }
};

/**
 * DELETE /api/admin/links-captacion/:id
 * Desactiva (expira) un link.
 */
export const desactivarLink = async (req: Request, res: Response): Promise<void> => {
  try {
    await LinkCaptacion.findByIdAndUpdate(req.params.id, { estado: 'expirado' });
    res.json({ success: true, mensaje: 'Link desactivado.' });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al desactivar el link.' });
  }
};

// ─── Admin — Referidos ────────────────────────────────────────────────────────

/**
 * GET /api/admin/referidos
 * Lista todos los referidos médicos.
 */
export const listarReferidos = async (_req: Request, res: Response): Promise<void> => {
  try {
    const referidos = await ReferidoMedico.find()
      .sort({ createdAt: -1 })
      .populate('medicoReferidorId', 'nombre apellido')
      .populate('medicoReferidoId', 'nombre apellido')
      .lean();
    res.json({ success: true, referidos });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al listar referidos.' });
  }
};

/**
 * POST /api/admin/referidos/:id/bonificar
 * Marca un referido como bonificado.
 */
export const bonificarReferido = async (req: Request, res: Response): Promise<void> => {
  try {
    const referido = await ReferidoMedico.findByIdAndUpdate(
      req.params.id,
      { $set: { estado: 'bonificado', fechaBonificacion: new Date(), notas: req.body.notas } },
      { new: true }
    );
    if (!referido) { res.status(404).json({ mensaje: 'Referido no encontrado.' }); return; }
    res.json({ success: true, referido });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al bonificar el referido.' });
  }
};
