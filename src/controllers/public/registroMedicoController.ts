import { Request, Response } from 'express';
import LinkCaptacion from '../../models/LinkCaptacion';
import ReferidoMedico from '../../models/ReferidoMedico';
import Medico from '../../models/Medico';
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
 * GET /api/public/medico-por-colegiatura/:numero
 * Busca un médico por su número de colegiatura y devuelve su perfil público.
 */
export const obtenerMedicoPorColegiatura = async (req: Request, res: Response): Promise<void> => {
  try {
    const { numero } = req.params;

    const medico = await Medico.findOne({ numeroColegiatura: String(numero).trim() })
      .select('nombre apellido especialidad perfilVerificacion logoUrl preajustes')
      .lean();

    if (!medico) {
      res.status(404).json({ success: false, mensaje: 'No se encontró ningún médico con ese número de colegiatura.' });
      return;
    }

    const pv: Record<string, any> = (medico.perfilVerificacion && typeof medico.perfilVerificacion === 'object')
      ? medico.perfilVerificacion as Record<string, any>
      : {};
    const preajustes: Record<string, any> = (medico.preajustes && typeof medico.preajustes === 'object')
      ? medico.preajustes as Record<string, any>
      : {};

    res.json({
      success: true,
      data: {
        _id: (medico as any)._id.toString(),
        nombre: medico.nombre,
        apellido: medico.apellido,
        especialidad: medico.especialidad,
        fotoMedicoUrl: pv.fotoMedicoUrl ?? undefined,
        motivosConsultaQueAtiende: Array.isArray(pv.motivosConsultaQueAtiende) ? pv.motivosConsultaQueAtiende : undefined,
        direccionAtencionPresencial: preajustes.direccionAtencionPresencial ?? undefined,
        modalidadesAtencion: Array.isArray(preajustes.modalidadesAtencion) ? preajustes.modalidadesAtencion : undefined,
        tiposPacientes: Array.isArray(preajustes.tiposPacientes) ? preajustes.tiposPacientes : undefined,
        precioConsultaVirtual: preajustes.precioConsultaVirtual ?? undefined,
        precioConsultaPresencial: preajustes.precioConsultaPresencial ?? undefined,
        logoUrl: medico.logoUrl ?? undefined,
      }
    });
  } catch (err) {
    console.error('[RegistroMedico] obtenerMedicoPorColegiatura:', err);
    res.status(500).json({ mensaje: 'Error al buscar el médico.' });
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
