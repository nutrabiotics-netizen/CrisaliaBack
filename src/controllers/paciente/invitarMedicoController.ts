import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../../middleware/auth';
import LinkCaptacion from '../../models/LinkCaptacion';
import { enviarMensajeCitaPaciente } from '../../services/notifications/citaWhatsAppNotifier';

/**
 * POST /api/paciente/invitar-medico
 * El paciente invita a un médico no inscrito en Crisal-iA.
 * Body: { medicoNombre, medicoTelefono, medicoEmail? }
 */
export const invitarMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const { medicoNombre, medicoTelefono, medicoEmail } = req.body as {
      medicoNombre?: string;
      medicoTelefono?: string;
      medicoEmail?: string;
    };

    if (!medicoNombre?.trim()) {
      res.status(400).json({ mensaje: 'El nombre del médico es requerido.' });
      return;
    }
    if (!medicoTelefono?.trim() && !medicoEmail?.trim()) {
      res.status(400).json({ mensaje: 'Se requiere al menos el teléfono o el correo del médico.' });
      return;
    }

    const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    const link = await LinkCaptacion.create({
      codigo,
      tipo: 'invitacion_paciente',
      pacienteQueInvitoId: pacienteId,
      descuentoAsociado: 0,
      expiresAt,
      creadoPor: 'sistema',
      medicoInvitadoNombre: medicoNombre.trim(),
      medicoInvitadoTelefono: medicoTelefono?.trim(),
      medicoInvitadoEmail: medicoEmail?.trim()
    });

    const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/registro-medico?codigo=${codigo}`;

    // Enviar WhatsApp al médico si tiene teléfono
    if (medicoTelefono?.trim()) {
      const msg =
        `Hola Dr(a). ${medicoNombre.trim()}, un paciente te ha invitado a unirte a Crisal-iA, ` +
        `la plataforma de medicina funcional. Regístrate aquí: ${url} ` +
        `(código: ${codigo}, válido 30 días).`;
      await enviarMensajeCitaPaciente(medicoTelefono.trim(), msg).catch((e) =>
        console.warn('[invitarMedico] WhatsApp error (no crítico):', e)
      );
    }

    res.status(201).json({
      success: true,
      mensaje: `Invitación enviada a ${medicoNombre.trim()}.`,
      url,
      codigo: link.codigo
    });
  } catch (err) {
    console.error('[invitarMedico]:', err);
    res.status(500).json({ mensaje: 'Error al enviar la invitación.' });
  }
};
