import { Request, Response } from 'express';
import LinkCaptacion from '../../models/LinkCaptacion';
import ReferidoMedico from '../../models/ReferidoMedico';
import authService from '../../services/auth/authService';

/**
 * GET /api/public/registro-medico/:codigo
 * Valida si un código de captación es vigente y devuelve su info (descuento, tipo).
 */
export const validarCodigo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { codigo } = req.params;

    const link = await LinkCaptacion.findOne({
      codigo: String(codigo).toUpperCase().trim(),
      estado: 'activo',
      expiresAt: { $gt: new Date() }
    })
      .populate('medicoReferidorId', 'nombre apellido')
      .lean();

    if (!link) {
      res.status(404).json({ valido: false, mensaje: 'Código inválido o expirado.' });
      return;
    }

    res.json({
      valido: true,
      tipo: link.tipo,
      descuentoAsociado: link.descuentoAsociado,
      referidor: link.medicoReferidorId
        ? (link.medicoReferidorId as any).nombre + ' ' + (link.medicoReferidorId as any).apellido
        : null,
      expiresAt: link.expiresAt
    });
  } catch (err) {
    console.error('[RegistroMedico] validarCodigo:', err);
    res.status(500).json({ mensaje: 'Error al validar el código.' });
  }
};

/**
 * POST /api/public/registro-medico
 * Registra un nuevo médico, opcionalmente con un código de captación.
 * Body: { nombre, apellido, email, password, especialidad, whatsapp, codigoCaptacion? }
 */
export const registrarMedicoConCodigo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, apellido, email, password, especialidad, whatsapp, codigoCaptacion } = req.body;

    // Registrar médico usando el authService existente
    const result = await authService.registerMedico({ nombre, apellido, email, password, especialidad, whatsapp });
    const nuevoMedicoId = result.user._id;

    // Si hay código de captación, procesar el vínculo
    if (codigoCaptacion?.trim()) {
      try {
        const link = await LinkCaptacion.findOneAndUpdate(
          { codigo: codigoCaptacion.toUpperCase().trim(), estado: 'activo', expiresAt: { $gt: new Date() } },
          { $set: { estado: 'usado', usadoPorMedicoId: nuevoMedicoId } },
          { new: true }
        );

        if (link?.medicoReferidorId) {
          // Crear registro de referido
          await ReferidoMedico.create({
            medicoReferidorId: link.medicoReferidorId,
            medicoReferidoId: nuevoMedicoId,
            linkCaptacionId: link._id,
            estado: 'registrado',
            montoBonus: 0,
            fechaRegistro: new Date()
          });
        }
      } catch (linkErr) {
        // No bloquear el registro si falla el procesamiento del link
        console.warn('[RegistroMedico] Error procesando link de captación:', linkErr);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Registro exitoso',
      data: result
    });
  } catch (err: any) {
    console.error('[RegistroMedico] registrarMedicoConCodigo:', err);
    const status = err.statusCode || err.status || 400;
    res.status(status).json({ mensaje: err.message || 'Error al registrar el médico.' });
  }
};
