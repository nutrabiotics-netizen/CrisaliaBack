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
import { enviarMensajeCitaPaciente } from '../notifications/citaWhatsAppNotifier';
import { combineFechaCitaConHora } from '../../utils/citaFechaHora';
import sgMail from '@sendgrid/mail';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'nutrabiotics@mozartai.com.co';
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const INTERVALO_JOB_MS = 10 * 60 * 1000; // 10 minutos
const TOLERANCIA_MS = 5 * 60 * 1000;     // ±5 min de tolerancia

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

  const citas = await Cita.find({
    medicoId,
    estado: { $in: ['pendiente', 'confirmada'] },
    fecha: { $gte: inicio, $lte: fin }
  }).lean();

  if (!citas.length) return;

  const medico = await Medico.findById(medicoId).select('nombre apellido').lean() as any;
  const nombreMed = medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : 'tu médico';
  const clave = claveRecordatorio(String(rec._id));

  for (const cita of citas) {
    // Verificar que no se haya enviado ya este recordatorio para esta cita
    const yaEnviado = (cita as any).notificacionesEnviadas?.includes(clave);
    if (yaEnviado) continue;

    const paciente = await Paciente.findById(cita.pacienteId).select('nombre telefono email').lean() as any;
    if (!paciente?.telefono && !paciente?.email) continue;

    const fechaFmt = fmtFecha(new Date(cita.fecha), cita.hora);
    const tiempoTexto = rec.unidad === 'minutos'
      ? `${rec.intervalo} minuto${rec.intervalo !== 1 ? 's' : ''}`
      : rec.unidad === 'horas'
        ? `${rec.intervalo} hora${rec.intervalo !== 1 ? 's' : ''}`
        : `${rec.intervalo} día${rec.intervalo !== 1 ? 's' : ''}`;

    const msg = `Recordatorio Crisal-iA: Hola${paciente.nombre ? ` ${paciente.nombre}` : ''}, tu cita con ${nombreMed} es en ${tiempoTexto} (${fechaFmt}). Modalidad: ${cita.modalidad}. ¡Te esperamos!`;

    try {
      // Enviar WP
      if (paciente.telefono) {
        await enviarMensajeCitaPaciente(paciente.telefono, msg);
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

async function runRecordatorioJob(): Promise<void> {
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
