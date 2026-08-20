/**
 * resumenDiarioJob.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Envía un resumen del día a cada médico según su configuración de notificaciones.
 *
 * Slots Colombia (America/Bogota):
 *   antes_jornada → 07:00
 *   mediodia      → 12:00
 *   fin_jornada   → 18:00
 *
 * Canales: in-app (siempre), WhatsApp y email según preferencias del médico.
 */

import cron from 'node-cron';
import Cita from '../../models/Cita';
import Medico from '../../models/Medico';
import Notificacion from '../../models/Notificacion';
import ConfiguracionNotificacionesMedico from '../../models/ConfiguracionNotificacionesMedico';
import { crearNotificacionMedico } from '../../utils/notificacionHelper';
import { enviarMensajeCitaPaciente } from '../notifications/citaWhatsAppNotifier';
import { hoyEnColombia } from '../../utils/dateHelper';
import sgMail from '@sendgrid/mail';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'nutrabiotics@mozartai.com.co';
if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const TIMEZONE = 'America/Bogota';

const SALUDOS: Record<string, string> = {
  antes_jornada: 'Buenos días',
  mediodia:      'Buenas tardes',
  fin_jornada:   'Resumen de jornada',
};

async function procesarResumenMedico(medicoId: string, slot: string): Promise<void> {
  try {
    const hoy = hoyEnColombia(); // 'YYYY-MM-DD'
    const inicioDia = new Date(hoy + 'T05:00:00.000Z');  // 00:00 COT = 05:00 UTC
    const finDia    = new Date(hoy + 'T04:59:59.999Z');  // 23:59 COT = día siguiente 04:59 UTC
    // finDia real = inicio del siguiente día - 1ms
    finDia.setDate(finDia.getDate() + 1);

    // 1. Citas de hoy (no canceladas)
    const citasHoy = await Cita.find({
      medicoId,
      fecha:  { $gte: inicioDia, $lte: finDia },
      estado: { $nin: ['cancelada'] },
    }).lean();

    const totalCitas  = citasHoy.length;
    const confirmadas = citasHoy.filter(c => c.estado === 'confirmada').length;
    const pendientes  = citasHoy.filter(c => c.estado === 'pendiente').length;
    const proximaCita = citasHoy
      .filter(c => !['completada', 'cancelada'].includes(c.estado))
      .sort((a, b) => String(a.hora).localeCompare(String(b.hora)))[0];

    // 2. Acciones clínicas pendientes (in-app no leídas con requiereAccion)
    const accionesPendientes = await Notificacion.countDocuments({
      medicoId,
      leida:          false,
      requiereAccion: true,
    });

    // 3. Notificaciones sin leer del día
    const noLeidasHoy = await Notificacion.countDocuments({
      medicoId,
      leida:      false,
      createdAt:  { $gte: inicioDia },
    });

    // Sin nada que reportar → no enviar
    if (totalCitas === 0 && accionesPendientes === 0 && noLeidasHoy === 0) return;

    const medico = await Medico.findById(medicoId)
      .select('nombre apellido whatsapp telefono email')
      .lean() as any;
    if (!medico) return;

    const nombreMed = `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim();
    const saludo    = SALUDOS[slot] ?? 'Hola';

    // ── Construir líneas del resumen ───────────────────────────────────────────

    const lineas: string[] = [];

    if (totalCitas > 0) {
      lineas.push(`📅 ${totalCitas} cita${totalCitas !== 1 ? 's' : ''} hoy — ${confirmadas} confirmada${confirmadas !== 1 ? 's' : ''}, ${pendientes} pendiente${pendientes !== 1 ? 's' : ''} de confirmar.`);
      if (proximaCita) lineas.push(`⏰ Próxima: ${proximaCita.hora}.`);
    } else {
      lineas.push('📅 Sin citas programadas para hoy.');
    }

    if (accionesPendientes > 0) {
      lineas.push(`⚠️ ${accionesPendientes} acción${accionesPendientes !== 1 ? 'es' : ''} clínica${accionesPendientes !== 1 ? 's' : ''} pendiente${accionesPendientes !== 1 ? 's' : ''}.`);
    }

    if (noLeidasHoy > 0) {
      lineas.push(`🔔 ${noLeidasHoy} notificación${noLeidasHoy !== 1 ? 'es' : ''} sin leer en su bandeja.`);
    }

    // ── In-app (siempre) ───────────────────────────────────────────────────────

    void crearNotificacionMedico({
      medicoId:   String(medicoId),
      tipo:       'general',
      categoria:  'citas_agenda',
      titulo:     `${saludo}, Dr. ${medico.nombre ?? ''} — Resumen del día`,
      cuerpo:     lineas.join(' '),
      requiereAccion: false,
      accionUrl:  '/medico/centro-notificaciones',
      accionLabel: 'Ver bandeja',
    });

    // ── WhatsApp ───────────────────────────────────────────────────────────────

    const config = await ConfiguracionNotificacionesMedico.findOne({ medicoId }, { categorias: 1 }).lean();
    const catCitas = config?.categorias?.find(c => c.categoria === 'citas_agenda');
    const whatsappActivo = !catCitas || (catCitas.activa && catCitas.canales?.whatsapp !== false);

    if (whatsappActivo) {
      const tel = medico.whatsapp?.trim() || medico.telefono?.trim();
      if (tel) {
        const msgWp = [`${saludo}, Dr. ${medico.nombre ?? ''}:`, ...lineas].join('\n');
        await enviarMensajeCitaPaciente(tel, msgWp);
      }
    }

    // ── Email ──────────────────────────────────────────────────────────────────

    const emailActivo = !catCitas || (catCitas.activa && catCitas.canales?.correo !== false);

    if (emailActivo && medico.email && process.env.SENDGRID_API_KEY) {
      const filasHtml = lineas.map(l =>
        `<tr><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1e3a6e;">${l}</td></tr>`
      ).join('');

      await sgMail.send({
        to:      medico.email,
        from:    FROM_EMAIL,
        subject: `${saludo} — Resumen del día · Crisal·IA`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9f6fd;border-radius:12px">
            <h2 style="color:#443c92;margin-bottom:4px">${saludo}, Dr. ${medico.nombre ?? ''}</h2>
            <p style="color:#6b7280;font-size:12px;margin-bottom:16px">${hoy} · Resumen clínico diario</p>
            <div style="background:#fff;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0">
              <table width="100%" cellpadding="0" cellspacing="0">${filasHtml}</table>
            </div>
            <div style="margin-top:16px;text-align:center">
              <a href="${process.env.FRONTEND_URL ?? 'https://nutrabiotics.mozartai.com.co'}/medico/centro-notificaciones"
                 style="display:inline-block;background:#443c92;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:bold">
                Ver bandeja de notificaciones
              </a>
            </div>
            <p style="color:#9ca3af;font-size:11px;margin-top:16px;text-align:center">
              Crisal·IA · Nutrabiotics
            </p>
          </div>
        `,
      });
    }

    console.info(`[ResumenDiarioJob] ✓ ${nombreMed} — slot: ${slot}`);
  } catch (e) {
    console.error('[ResumenDiarioJob] Error médico', medicoId, e);
  }
}

async function runSlot(slot: string): Promise<void> {
  const configs = await ConfiguracionNotificacionesMedico.find(
    { frecuenciaResumen: slot },
    { medicoId: 1 }
  ).lean();

  if (!configs.length) return;

  for (const cfg of configs) {
    await procesarResumenMedico(String(cfg.medicoId), slot);
  }
}

export function scheduleResumenDiarioJob(): void {
  // 07:00 Colombia
  cron.schedule('0 7 * * *', () => {
    runSlot('antes_jornada').catch(e => console.error('[ResumenDiarioJob] Error antes_jornada:', e));
  }, { timezone: TIMEZONE });

  // 12:00 Colombia
  cron.schedule('0 12 * * *', () => {
    runSlot('mediodia').catch(e => console.error('[ResumenDiarioJob] Error mediodia:', e));
  }, { timezone: TIMEZONE });

  // 18:00 Colombia
  cron.schedule('0 18 * * *', () => {
    runSlot('fin_jornada').catch(e => console.error('[ResumenDiarioJob] Error fin_jornada:', e));
  }, { timezone: TIMEZONE });

  console.info('[ResumenDiarioJob] Crons registrados: 07:00 / 12:00 / 18:00 (America/Bogota).');
}