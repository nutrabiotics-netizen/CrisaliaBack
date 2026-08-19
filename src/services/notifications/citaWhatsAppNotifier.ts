import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import { normalizarTelefono } from '../whatsapp/whatsappService';
import { combineFechaCitaConHora } from '../../utils/citaFechaHora';
import sgMail from '@sendgrid/mail';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'nutrabiotics@mozartai.com.co';
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const META_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
const META_ACCESS_TOKEN    = process.env.META_WHATSAPP_ACCESS_TOKEN || '';
const META_API_URL = `https://graph.facebook.com/v22.0/${META_PHONE_NUMBER_ID}/messages`;

async function enviarMetaTemplate(params: {
  telefono: string;
  templateName: string;
  components: object[];
}): Promise<void> {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    console.warn('[Cita-Meta] META_WHATSAPP no configurado — template omitido:', params.templateName);
    return;
  }
  const to = normalizarTelefono(params.telefono);
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: params.templateName, language: { code: 'es' }, components: params.components },
  };
  const res = await fetch(META_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${META_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[Cita-Meta] Error al enviar template:', params.templateName, res.status, err);
  }
}

function fmtCitaFechaHora(fecha: Date, hora: string): string {
  const dt = combineFechaCitaConHora(fecha, hora);
  return dt.toLocaleString('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Webhook genérico para enviar mensajes de cita al paciente (Twilio, Mozart, n8n, etc.).
 * Si `WHATSAPP_CITA_WEBHOOK_URL` no está definida, solo se registra en log (no falla el flujo).
 */
export async function enviarMensajeCitaPaciente(telefono: string | undefined | null, mensaje: string): Promise<void> {
  const raw = telefono?.trim();
  if (!raw) {
    console.info('[Cita-WhatsApp] Sin teléfono de paciente; mensaje omitido.');
    return;
  }

  const url = process.env.WHATSAPP_CITA_WEBHOOK_URL?.trim();
  const celular = normalizarTelefono(raw);

  if (!url) {
    console.info(`[Cita-WhatsApp] ${celular}: ${mensaje.replace(/\s+/g, ' ').slice(0, 200)}`);
    return;
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = process.env.WHATSAPP_CITA_WEBHOOK_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ celular, mensaje, origen: 'crisalia-citas' })
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[Cita-WhatsApp] Webhook HTTP', res.status, t);
    }
  } catch (e) {
    console.error('[Cita-WhatsApp] Error de red:', e);
  }
}

function nombreMedico(m: { nombre?: string; apellido?: string } | null): string {
  if (!m) return 'tu médico';
  return `${m.nombre || ''} ${m.apellido || ''}`.trim() || 'tu médico';
}

export async function notificarCitaAgendadaPaciente(citaId: string): Promise<void> {
  try {
    const cita = await Cita.findById(citaId).populate('medicoId', 'nombre apellido').lean();
    if (!cita) return;
    const paciente = await Paciente.findById(cita.pacienteId).select('telefono nombre').lean();
    if (!paciente) return;
    const med = cita.medicoId as unknown as { nombre?: string; apellido?: string };
    const msg = `Hola${paciente.nombre ? ` ${paciente.nombre}` : ''}, agendaste una cita en Crisal-iA con ${nombreMedico(med)} para el ${fmtCitaFechaHora(new Date(cita.fecha), cita.hora)}. Modalidad: ${cita.modalidad}. Estado: pendiente de confirmación del médico.`;
    await enviarMensajeCitaPaciente(paciente.telefono, msg);
  } catch (e) {
    console.error('[Cita-WhatsApp] notificarCitaAgendadaPaciente:', e);
  }
}

export async function notificarCitaConfirmadaPorMedico(citaId: string): Promise<void> {
  try {
    const cita = await Cita.findById(citaId).populate('medicoId', 'nombre apellido').lean();
    if (!cita) return;
    const paciente = await Paciente.findById(cita.pacienteId).select('telefono nombre').lean();
    if (!paciente) return;
    const med = cita.medicoId as unknown as { nombre?: string; apellido?: string };
    const msg = `Hola${paciente.nombre ? ` ${paciente.nombre}` : ''}, tu cita con ${nombreMedico(med)} quedó confirmada para el ${fmtCitaFechaHora(new Date(cita.fecha), cita.hora)}. Modalidad: ${cita.modalidad}. Te esperamos en Crisal-iA.`;
    await enviarMensajeCitaPaciente(paciente.telefono, msg);
  } catch (e) {
    console.error('[Cita-WhatsApp] notificarCitaConfirmadaPorMedico:', e);
  }
}

/**
 * Notifica al paciente que su cita fue reagendada por el médico.
 * Usa el template de Meta API: nutrabiotics_reagendamiento_cita
 * Parámetros del template:
 *   1. Nombre del paciente
 *   2. Nombre del médico
 *   3. Nueva fecha (texto)
 *   4. Nueva hora (texto)
 *   5. Modalidad / lugar
 */
export async function notificarCitaReagendadaPaciente(citaId: string, mensajeAdicional?: string): Promise<void> {
  try {
    const cita = await Cita.findById(citaId).lean();
    if (!cita) return;
    const paciente = await Paciente.findById(cita.pacienteId).select('telefono nombre email').lean();
    if (!paciente) return;
    const medico = await Medico.findById(cita.medicoId).select('nombre apellido especialidad direccionAtencionPresencial').lean();

    const dt = combineFechaCitaConHora(new Date(cita.fecha), cita.hora);
    const fechaStr = dt.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const horaStr  = dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    const nombrePac = (paciente as any).nombre ?? 'Paciente';
    const nombreMed = medico ? `${(medico as any).nombre || ''} ${(medico as any).apellido || ''}`.trim() : 'tu médico';
    const lugar = cita.modalidad === 'virtual'
      ? 'Teleconsulta virtual — recibirás el enlace antes de la cita'
      : (medico as any)?.direccionAtencionPresencial ?? 'Consulta presencial';

    // WhatsApp via Meta API template
    if (paciente.telefono) {
      await enviarMetaTemplate({
        telefono: paciente.telefono,
        templateName: 'nutrabiotics_reagendamiento_cita',
        components: [
          {
            type: 'header',
            parameters: [{ type: 'image', image: { link: 'https://mozartimages-1.s3.us-east-1.amazonaws.com/Crisal-IA.PNG' } }],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombrePac },
              { type: 'text', text: nombreMed },
              { type: 'text', text: fechaStr },
              { type: 'text', text: horaStr },
              { type: 'text', text: lugar },
            ],
          },
        ],
      });
    }

    // Email via SendGrid
    const emailPaciente = (paciente as any).email;
    if (emailPaciente && process.env.SENDGRID_API_KEY) {
      await sgMail.send({
        to: emailPaciente,
        from: FROM_EMAIL,
        subject: `Tu cita ha sido reagendada — Crisal·IA`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9f6fd;border-radius:12px">
            <h2 style="color:#443c92;margin-bottom:8px">Cita reagendada</h2>
            <p style="color:#4470b2">Hola <strong>${nombrePac}</strong>, tu cita con <strong>${nombreMed}</strong> ha sido reagendada.</p>
            <div style="background:#fff;border-radius:10px;padding:16px;margin:16px 0;border:1px solid #e2e8f0">
              <p style="margin:4px 0;color:#1e3a6e"><strong>Nueva fecha:</strong> ${fechaStr}</p>
              <p style="margin:4px 0;color:#1e3a6e"><strong>Hora:</strong> ${horaStr}</p>
              <p style="margin:4px 0;color:#1e3a6e"><strong>Modalidad:</strong> ${cita.modalidad === 'virtual' ? 'Virtual' : 'Presencial'}</p>
              <p style="margin:4px 0;color:#1e3a6e"><strong>Lugar:</strong> ${lugar}</p>
            </div>
            ${mensajeAdicional ? `<div style="background:#f0f4ff;border-radius:10px;padding:14px 16px;margin:12px 0;border-left:4px solid #443c92"><p style="margin:0 0 4px;color:#443c92;font-weight:bold;font-size:13px">Mensaje de tu médico:</p><p style="margin:0;color:#1e3a6e;font-size:13px;line-height:1.5">${mensajeAdicional}</p></div>` : ''}
            <p style="color:#6b7280;font-size:12px">Si tienes dudas, puedes contactar a tu médico desde la plataforma Crisal·IA.</p>
          </div>
        `,
      });
    }
  } catch (e) {
    console.error('[Cita-Meta] notificarCitaReagendadaPaciente:', e);
  }
}

/**
 * Notifica al paciente que su cita fue cancelada por el médico.
 * Usa el template de Meta API: nutrabiotics_cancelacion_cita
 * Parámetros del template:
 *   1. Nombre del paciente
 *   2. Nombre del médico
 *   3. Fecha original (texto)
 *   4. Hora original (texto)
 *
 * tipoCancelacion: 'cancelar' | 'cancelar_horarios' | 'cancelar_bloquear'
 * Para 'cancelar_horarios' el email incluye un link para reagendar.
 */
export async function notificarCitaCanceladaPorMedico(citaId: string, tipoCancelacion?: string, mensajeAdicional?: string): Promise<void> {
  try {
    const cita = await Cita.findById(citaId).lean();
    if (!cita) return;
    const paciente = await Paciente.findById(cita.pacienteId).select('telefono nombre email').lean();
    if (!paciente) return;
    const medico = await Medico.findById(cita.medicoId).select('nombre apellido').lean();

    const dt = combineFechaCitaConHora(new Date(cita.fecha), cita.hora);
    const fechaStr = dt.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const horaStr  = dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    const nombrePac = (paciente as any).nombre ?? 'Paciente';
    const nombreMed = medico ? `${(medico as any).nombre || ''} ${(medico as any).apellido || ''}`.trim() : 'tu médico';

    // WhatsApp via Meta API template
    if ((paciente as any).telefono) {
      await enviarMetaTemplate({
        telefono: (paciente as any).telefono,
        templateName: 'nutrabiotics_cancelacion_cita',
        components: [
          {
            type: 'header',
            parameters: [{ type: 'image', image: { link: 'https://mozartimages-1.s3.us-east-1.amazonaws.com/Crisal-IA.PNG' } }],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: nombrePac },
              { type: 'text', text: nombreMed },
              { type: 'text', text: fechaStr },
              { type: 'text', text: horaStr },
            ],
          },
        ],
      });
    }

    // Email via SendGrid
    const emailPaciente = (paciente as any).email;
    if (emailPaciente && process.env.SENDGRID_API_KEY) {
      const ofrecerHorarios = tipoCancelacion === 'cancelar_horarios';
      const linkReagendar = `${process.env.FRONTEND_URL ?? 'https://nutrabiotics.mozartai.com.co'}/paciente/agendamiento?medico=${cita.medicoId}`;
      await sgMail.send({
        to: emailPaciente,
        from: FROM_EMAIL,
        subject: `Tu cita ha sido cancelada — Crisal·IA`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9f6fd;border-radius:12px">
            <h2 style="color:#443c92;margin-bottom:8px">Cita cancelada</h2>
            <p style="color:#4470b2">Hola <strong>${nombrePac}</strong>, tu cita con <strong>${nombreMed}</strong> ha sido cancelada.</p>
            <div style="background:#fff;border-radius:10px;padding:16px;margin:16px 0;border:1px solid #e2e8f0">
              <p style="margin:4px 0;color:#1e3a6e"><strong>Fecha:</strong> ${fechaStr}</p>
              <p style="margin:4px 0;color:#1e3a6e"><strong>Hora:</strong> ${horaStr}</p>
              <p style="margin:4px 0;color:#1e3a6e"><strong>Modalidad:</strong> ${cita.modalidad === 'virtual' ? 'Virtual' : 'Presencial'}</p>
            </div>
            ${mensajeAdicional ? `<div style="background:#f0f4ff;border-radius:10px;padding:14px 16px;margin:12px 0;border-left:4px solid #443c92"><p style="margin:0 0 4px;color:#443c92;font-weight:bold;font-size:13px">Mensaje de tu médico:</p><p style="margin:0;color:#1e3a6e;font-size:13px;line-height:1.5">${mensajeAdicional}</p></div>` : ''}
            ${ofrecerHorarios ? `
            <div style="background:#eff6ff;border-radius:10px;padding:16px;margin:16px 0;border:1px solid #bfdbfe">
              <p style="margin:0 0 8px;color:#1e3a6e;font-weight:bold">¿Quieres reagendar tu cita?</p>
              <p style="margin:0 0 12px;color:#4470b2;font-size:14px">Puedes reservar un nuevo horario disponible en nuestra plataforma.</p>
              <a href="${linkReagendar}" style="display:inline-block;background:#443c92;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Ver horarios disponibles</a>
            </div>` : ''}
            <p style="color:#6b7280;font-size:12px">Si tienes dudas, puedes contactar a tu médico desde la plataforma Crisal·IA.</p>
          </div>
        `,
      });
    }
  } catch (e) {
    console.error('[Cita-Meta] notificarCitaCanceladaPorMedico:', e);
  }
}
