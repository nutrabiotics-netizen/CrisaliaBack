/**
 * recordatorioCitaJob.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Job que corre cada 10 minutos, busca citas próximas y envía recordatorios
 * WhatsApp al paciente según la configuración de cada médico.
 *
 * Lógica:
 * 1. Por cada médico con configuración de recordatorios activos
 * 2. Por cada recordatorio activo (ej. "2 horas antes", "1 día antes")
 * 3. Busca citas que estén exactamente en esa ventana de tiempo
 * 4. Verifica que no se haya enviado ya ese recordatorio (clave en Cita.notificacionesEnviadas)
 * 5. Envía el mensaje WP y marca la cita
 */

import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import ConfiguracionRecordatorios, { IRecordatorio } from '../../models/ConfiguracionRecordatorios';
import { combineFechaCitaConHora } from '../../utils/citaFechaHora';
import { normalizarTelefono } from '../whatsapp/whatsappService';
import sgMail from '@sendgrid/mail';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'nutrabiotics@mozartai.com.co';
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const META_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
const META_ACCESS_TOKEN = process.env.META_WHATSAPP_ACCESS_TOKEN || '';
const META_API_URL = `https://graph.facebook.com/v22.0/${META_PHONE_NUMBER_ID}/messages`;

async function enviarRecordatorioMetaWP(params: {
  telefono: string;
  nombrePaciente: string;
  nombreMedico: string;
  especialidad: string;
  fecha: string;
  hora: string;
  lugar: string;
}): Promise<void> {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    console.warn('[RecordatorioJob] META_WHATSAPP no configurado');
    return;
  }
  const to = normalizarTelefono(params.telefono);
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: 'nutrabiotics_recordatorio_cita',
      language: { code: 'en' },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: 'https://mozartimages-1.s3.us-east-1.amazonaws.com/Crisal-IA.PNG' } }]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Nutrabiotics' },
            { type: 'text', text: params.nombrePaciente },
            { type: 'text', text: params.nombreMedico },
            { type: 'text', text: params.especialidad },
            { type: 'text', text: params.fecha },
            { type: 'text', text: params.hora },
            { type: 'text', text: params.lugar }
          ]
        }
      ]
    }
  };

  const res = await fetch(META_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${META_ACCESS_TOKEN}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[RecordatorioJob] Meta WP error:', res.status, err);
  }
}

const INTERVALO_JOB_MS = 5 * 60 * 1000;  // 5 minutos
const TOLERANCIA_MS = 7 * 60 * 1000;      // ±7 min — cubre el intervalo del job (10 min)

function toMs(intervalo: number, unidad: 'minutos' | 'horas' | 'dias'): number {
  if (unidad === 'minutos') return intervalo * 60 * 1000;
  if (unidad === 'horas') return intervalo * 60 * 60 * 1000;
  return intervalo * 24 * 60 * 60 * 1000;
}

function claveRecordatorio(recordatorioId: string): string {
  return `rec_${recordatorioId}`;
}

function fmtFecha(fecha: Date, hora: string): string {
  const dt = combineFechaCitaConHora(fecha, hora);
  return dt.toLocaleString('es-CO', {
    weekday: 'short', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function procesarRecordatorio(
  medicoId: string,
  rec: IRecordatorio & { _id: any }
): Promise<void> {
  const ahora = Date.now();
  const ventanaMs = toMs(rec.intervalo, rec.unidad);

  // Buscar citas del médico que estén en la ventana ±tolerancia
  const inicio = new Date(ahora + ventanaMs - TOLERANCIA_MS);
  const fin = new Date(ahora + ventanaMs + TOLERANCIA_MS);

  // La fecha se guarda como 00:00Z y la hora en campo separado.
  // Buscamos por rango de días y luego filtramos por fecha+hora combinada.
  const inicioDia = new Date(inicio);
  inicioDia.setUTCHours(0, 0, 0, 0);
  const finDia = new Date(fin);
  finDia.setUTCHours(23, 59, 59, 999);

  const citasDelDia = await Cita.find({
    medicoId,
    estado: { $in: ['pendiente', 'confirmada'] },
    fecha: { $gte: inicioDia, $lte: finDia }
  }).lean();

  const citas = citasDelDia.filter(c => {
    try {
      const dt = combineFechaCitaConHora(new Date((c as any).fecha), (c as any).hora);
      return dt >= inicio && dt <= fin;
    } catch { return false; }
  });

  if (!citas.length) return;

  const medico = await Medico.findById(medicoId)
    .select('nombre apellido especialidad direccionConsultorioHabilitado direccionVivienda')
    .lean() as any;
  const nombreMed = medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : 'tu médico';
  const especialidadMed = medico?.especialidad || 'Medicina Funcional';
  const lugarCita = medico?.direccionConsultorioHabilitado || medico?.direccionVivienda || 'Consulta virtual';
  const clave = claveRecordatorio(String(rec._id));

  for (const cita of citas) {
    const yaEnviado = (cita as any).notificacionesEnviadas?.includes(clave);
    if (yaEnviado) continue;

    const paciente = await Paciente.findById(cita.pacienteId).select('nombre telefono email').lean() as any;
    if (!paciente?.telefono && !paciente?.email) continue;

    // Formatear fecha y hora para el template
    const fechaTemplate = new Date(cita.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
    const horaTemplate = String(cita.hora);
    const fechaFmt = fmtFecha(new Date(cita.fecha), cita.hora);
    const tiempoTexto = rec.unidad === 'minutos'
      ? `${rec.intervalo} minuto${rec.intervalo !== 1 ? 's' : ''}`
      : rec.unidad === 'horas'
        ? `${rec.intervalo} hora${rec.intervalo !== 1 ? 's' : ''}`
        : `${rec.intervalo} día${rec.intervalo !== 1 ? 's' : ''}`;

    try {
      // Enviar WP via template Meta
      if (paciente.telefono) {
        await enviarRecordatorioMetaWP({
          telefono: paciente.telefono,
          nombrePaciente: paciente.nombre || 'Paciente',
          nombreMedico: nombreMed,
          especialidad: especialidadMed,
          fecha: fechaTemplate,
          hora: horaTemplate,
          lugar: cita.modalidad === 'virtual'
            ? ((cita as any).meetingId
                ? `${process.env.FRONTEND_URL || 'https://app.nutrabiotics.mozartia.com'}/paciente/teleconsulta/${(cita as any).meetingId}`
                : 'Consulta virtual')
            : lugarCita
        });
      }

      // Enviar email
      if (paciente.email && process.env.SENDGRID_API_KEY) {
        await sgMail.send({
          to: paciente.email,
          from: FROM_EMAIL,
          subject: `Recordatorio de cita — ${tiempoTexto} antes`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:10px;">
              <h2 style="color:#443c92;">Recordatorio de tu cita en Crisalia</h2>
              <p>Hola${paciente.nombre ? ` <strong>${paciente.nombre}</strong>` : ''},</p>
              <p>Te recordamos que tienes una cita con <strong>${nombreMed}</strong> en <strong>${tiempoTexto}</strong>.</p>
              <p><strong>Fecha y hora:</strong> ${fechaFmt}</p>
              <p><strong>Modalidad:</strong> ${cita.modalidad}</p>
              <p style="color:#666;font-size:12px;margin-top:20px;">Este es un recordatorio automático de Crisalia · Nutrabiotics</p>
            </div>
          `
        });
      }

      // Marcar como enviado
      await Cita.findByIdAndUpdate(cita._id, {
        $addToSet: { notificacionesEnviadas: clave }
      });
      console.info(`[RecordatorioJob] Enviado — paciente ${paciente.nombre} — cita ${cita._id} — ${tiempoTexto} antes`);
    } catch (e) {
      console.error('[RecordatorioJob] Error enviando recordatorio:', e);
    }
  }
}

export async function runRecordatorioJob(): Promise<void> {
  const configs = await ConfiguracionRecordatorios.find({}).lean();
  if (!configs.length) return;

  for (const config of configs) {
    const activos = (config.recordatorios || []).filter(r => r.activo);
    for (const rec of activos) {
      try {
        await procesarRecordatorio(String(config.medicoId), rec as any);
      } catch (e) {
        console.error('[RecordatorioJob] Error procesando recordatorio:', e);
      }
    }
  }
}

export function scheduleRecordatorioCitaJob(): void {
  setTimeout(() => {
    runRecordatorioJob().catch(e => console.error('[RecordatorioJob] Error inicial:', e));
  }, 15_000);

  setInterval(() => {
    runRecordatorioJob().catch(e => console.error('[RecordatorioJob] Error periódico:', e));
  }, INTERVALO_JOB_MS);

  console.info('[RecordatorioJob] Job de recordatorios registrado (cada 10 min).');
}
