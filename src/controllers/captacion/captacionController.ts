import { Request, Response } from 'express';
import crypto from 'crypto';
import LinkCaptacion from '../../models/LinkCaptacion';
import Paciente from '../../models/Paciente';
import { AuthRequest } from '../../middleware/auth';
import { enviarMensajeCitaPaciente } from '../../services/notifications/citaWhatsAppNotifier';

function generarCodigo(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * GET /api/public/registro-medico/:codigo
 * Valida un código antes de que el médico complete el registro.
 */
export const validarCodigo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { codigo } = req.params;

    // Auto-expirar
    await LinkCaptacion.updateMany(
      { estado: 'activo', expiresAt: { $lt: new Date() } },
      { $set: { estado: 'expirado' } }
    );

    const link = await LinkCaptacion.findOne({ codigo: String(codigo).toUpperCase(), estado: 'activo' }).lean();

    if (!link) {
      res.status(404).json({ valido: false, mensaje: 'El código no existe, expiró o ya fue usado.' });
      return;
    }

    res.json({
      valido: true,
      tipo: link.tipo,
      descuentoAsociado: link.descuentoAsociado,
      expiresAt: link.expiresAt
    });
  } catch (err) {
    console.error('[PublicCaptacion] validarCodigo:', err);
    res.status(500).json({ mensaje: 'Error al validar el código.' });
  }
};

/**
 * POST /api/paciente/invitar-medico
 * Paciente invita a un médico no inscrito a unirse a Crisal-iA.
 * Genera un LinkCaptacion tipo 'invitacion_paciente' y envía WhatsApp.
 */
export const invitarMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado.' }); return; }

    const { nombreMedico, telefonoMedico, emailMedico } = req.body;
    if (!nombreMedico || !telefonoMedico) {
      res.status(400).json({ mensaje: 'Se requiere el nombre y teléfono del médico.' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId).select('nombre').lean();

    const codigo = generarCodigo();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    await LinkCaptacion.create({
      codigo,
      tipo: 'invitacion_paciente',
      pacienteQueInvitoId: pacienteId,
      descuentoAsociado: 10,
      expiresAt,
      creadoPor: 'sistema',
      medicoInvitadoNombre: nombreMedico,
      medicoInvitadoTelefono: telefonoMedico,
      medicoInvitadoEmail: emailMedico
    });

    const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/registro-medico?codigo=${codigo}`;
    const mensaje =
      `Hola Dr(a). ${nombreMedico}, tu paciente${paciente?.nombre ? ` ${paciente.nombre}` : ''} te invita a unirte a Crisal-iA, ` +
      `la plataforma de Medicina Funcional. Regístrate gratis en: ${url} ` +
      `(código: ${codigo}, válido 30 días). ¡Bienvenido al equipo!`;

    // Enviar WhatsApp al médico invitado
    await enviarMensajeCitaPaciente(telefonoMedico, mensaje);

    res.status(201).json({
      success: true,
      mensaje: 'Invitación enviada correctamente.',
      link: { codigo, url, expiresAt }
    });
  } catch (err) {
    console.error('[PacienteCaptacion] invitarMedico:', err);
    res.status(500).json({ mensaje: 'Error al enviar la invitación.' });
  }
};

/**
 * GET /api/medico/mis-referidos
 * El médico ve sus referidos y su estado de bonificación.
 */
export const misReferidos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ mensaje: 'No autorizado.' }); return; }

    const { default: ReferidoMedico } = await import('../../models/ReferidoMedico');
    const referidos = await ReferidoMedico.find({ medicoReferidorId: medicoId })
      .sort({ createdAt: -1 })
      .populate('medicoReferidoId', 'nombre apellido especialidad')
      .lean();

    const totalBonificado = referidos
      .filter((r) => r.estado === 'bonificado')
      .reduce((sum, r) => sum + (r.montoBonus || 0), 0);

    res.json({ success: true, referidos, totalBonificado });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al obtener referidos.' });
  }
};
