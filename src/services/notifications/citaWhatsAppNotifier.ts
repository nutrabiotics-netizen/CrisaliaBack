import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import { normalizarTelefono } from '../whatsapp/whatsappService';
import { combineFechaCitaConHora } from '../../utils/citaFechaHora';

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
