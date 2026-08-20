/**
 * medicoNotificacionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Notificaciones proactivas al médico sobre eventos del paciente.
 * Respeta las preferencias de notificación (canales, horario tranquilo).
 */

import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import { enviarMensajeCitaPaciente } from './citaWhatsAppNotifier';
import { crearNotificacionMedico } from '../../utils/notificacionHelper';
import { verificarCanalesNotificacion } from '../../utils/verificarPreferenciasNotificacion';

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function resolverMedicoDelPaciente(pacienteId: string) {
  const cita = await Cita.findOne({ pacienteId })
    .sort({ createdAt: -1 })
    .select('medicoId')
    .lean();
  if (!cita?.medicoId) return null;
  return Medico.findById(cita.medicoId).select('nombre apellido whatsapp telefono').lean();
}

async function resolverNombrePaciente(pacienteId: string): Promise<string> {
  const p = await Paciente.findById(pacienteId).select('nombre apellido').lean();
  return [p?.nombre, p?.apellido].filter(Boolean).join(' ') || 'Tu paciente';
}

function telMedico(medico: { whatsapp?: string | null; telefono?: string | null } | null) {
  return medico?.whatsapp?.trim() || medico?.telefono?.trim() || null;
}

function nombreMedicoStr(medico: { nombre?: string | null; apellido?: string | null } | null) {
  return medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : 'Dr(a).';
}

// ─── Notificaciones exportadas ────────────────────────────────────────────────

/**
 * Notifica al médico cuando el paciente alcanza el 50% o el 100% de la anamnesis.
 */
export async function notificarMedicoProgresoAnamnesis(
  pacienteId: string,
  progreso: number
): Promise<void> {
  try {
    const [medicoDoc, nombrePac] = await Promise.all([
      resolverMedicoDelPaciente(pacienteId),
      resolverNombrePaciente(pacienteId),
    ]);
    if (!medicoDoc) return;

    const medicoId = String((medicoDoc as any)._id);
    const canales  = await verificarCanalesNotificacion(medicoId, 'preconsultas_anamnesis');

    const es100 = progreso >= 100;
    const titulo = es100
      ? `Preconsulta completada — ${nombrePac}`
      : `Preconsulta en progreso — ${nombrePac}`;
    const cuerpo = es100
      ? `${nombrePac} completó el 100% de su cuestionario. El análisis IA está listo para revisión.`
      : `${nombrePac} ha completado el 50% del cuestionario. Puedes ver el avance preliminar.`;

    // In-app
    if (canales.inApp) {
      void crearNotificacionMedico({
        medicoId,
        tipo:          es100 ? 'preconsulta_100' : 'preconsulta_50',
        categoria:     'preconsultas_anamnesis',
        titulo,
        cuerpo,
        requiereAccion: es100,
        accionUrl:     '/medico/pacientes',
        accionLabel:   es100 ? 'Revisar preconsulta' : 'Ver avance',
        pacienteId,
        pacienteNombre: nombrePac,
      });
    }

    // WhatsApp
    if (canales.whatsapp) {
      const tel = telMedico(medicoDoc);
      if (tel) {
        const msg = es100
          ? `✅ Crisal-iA — Anamnesis completada\nHola ${nombreMedicoStr(medicoDoc)}, ${nombrePac} completó el 100% de su cuestionario. Ya puedes revisar el análisis IA.`
          : `📋 Crisal-iA — Anamnesis en progreso\nHola ${nombreMedicoStr(medicoDoc)}, ${nombrePac} completó el 50% del cuestionario. Puedes ver el avance en Crisal-iA.`;
        await enviarMensajeCitaPaciente(tel, msg);
      }
    }
  } catch (e) {
    console.error('[medicoNotificacion] notificarMedicoProgresoAnamnesis:', e);
  }
}

/**
 * Notifica al médico que un paciente solicitó un concepto/asesoría urgente.
 */
export async function notificarMedicoAsesoriaUrgente(
  pacienteId: string,
  asunto: string
): Promise<void> {
  try {
    const [medicoDoc, nombrePac] = await Promise.all([
      resolverMedicoDelPaciente(pacienteId),
      resolverNombrePaciente(pacienteId),
    ]);
    if (!medicoDoc) return;

    const medicoId = String((medicoDoc as any)._id);
    const canales  = await verificarCanalesNotificacion(medicoId, 'pacientes_casos');

    if (canales.inApp) {
      void crearNotificacionMedico({
        medicoId,
        tipo:           'nuevo_paciente',
        categoria:      'pacientes_casos',
        titulo:         `Solicitud urgente — ${nombrePac}`,
        cuerpo:         `${nombrePac} solicita un concepto urgente: "${asunto}". Revisa la sección de Asesorías.`,
        requiereAccion: true,
        accionUrl:      '/medico/pacientes',
        accionLabel:    'Ver solicitud',
        pacienteId,
        pacienteNombre: nombrePac,
      });
    }

    if (canales.whatsapp) {
      const tel = telMedico(medicoDoc);
      if (tel) {
        const msg = `🆘 Crisal-iA — Solicitud urgente\nHola ${nombreMedicoStr(medicoDoc)}, ${nombrePac} solicitó un concepto urgente: "${asunto}". Revisa la sección de Asesorías en Crisal-iA.`;
        await enviarMensajeCitaPaciente(tel, msg);
      }
    }
  } catch (e) {
    console.error('[medicoNotificacion] notificarMedicoAsesoriaUrgente:', e);
  }
}

/**
 * Notifica al médico cuando el paciente actualiza datos de control.
 */
export async function notificarMedicoControlActualizado(
  pacienteId: string
): Promise<void> {
  try {
    const [medicoDoc, nombrePac] = await Promise.all([
      resolverMedicoDelPaciente(pacienteId),
      resolverNombrePaciente(pacienteId),
    ]);
    if (!medicoDoc) return;

    const medicoId = String((medicoDoc as any)._id);
    const canales  = await verificarCanalesNotificacion(medicoId, 'seguimiento_clinico');

    if (canales.inApp) {
      void crearNotificacionMedico({
        medicoId,
        tipo:           'seguimiento_evolucion',
        categoria:      'seguimiento_clinico',
        titulo:         `Control actualizado — ${nombrePac}`,
        cuerpo:         `${nombrePac} completó el cuestionario de seguimiento. Accede al análisis evolutivo.`,
        requiereAccion: false,
        accionUrl:      '/medico/pacientes',
        accionLabel:    'Ver seguimiento',
        pacienteId,
        pacienteNombre: nombrePac,
      });
    }

    if (canales.whatsapp) {
      const tel = telMedico(medicoDoc);
      if (tel) {
        const msg = `🔄 Crisal-iA — Cuestionario de control actualizado\nHola ${nombreMedicoStr(medicoDoc)}, ${nombrePac} completó el cuestionario de seguimiento. Accede al análisis evolutivo en la plataforma.`;
        await enviarMensajeCitaPaciente(tel, msg);
      }
    }
  } catch (e) {
    console.error('[medicoNotificacion] notificarMedicoControlActualizado:', e);
  }
}

/**
 * Notifica al médico cuando el paciente agenda, cancela o reagenda una cita.
 */
export async function notificarMedicoCambiosCita(
  medicoId: string,
  tipo: 'cita_nueva' | 'cita_cancelada' | 'cita_reagendada',
  fechaLabel: string,
  horaLabel: string,
  citaId?: string,
  pacienteId?: string
): Promise<void> {
  try {
    const [canales, nombrePaciente] = await Promise.all([
      verificarCanalesNotificacion(medicoId, 'citas_agenda'),
      pacienteId ? resolverNombrePaciente(pacienteId) : Promise.resolve('el paciente'),
    ]);

    const TEXTOS = {
      cita_nueva:       { titulo: `Nueva cita — ${nombrePaciente}`,       cuerpo: `${nombrePaciente} agendó una cita para el ${fechaLabel} a las ${horaLabel}.`,          accionLabel: 'Ver en agenda',    requiereAccion: false },
      cita_cancelada:   { titulo: `Cita cancelada — ${nombrePaciente}`,   cuerpo: `${nombrePaciente} canceló su cita del ${fechaLabel} a las ${horaLabel}.`,               accionLabel: 'Ver agenda',       requiereAccion: false },
      cita_reagendada:  { titulo: `Cita reagendada — ${nombrePaciente}`,  cuerpo: `${nombrePaciente} reagendó su cita. Nueva fecha: ${fechaLabel} a las ${horaLabel}.`,    accionLabel: 'Ver en agenda',    requiereAccion: false },
    };

    const t = TEXTOS[tipo];

    if (canales.inApp) {
      void crearNotificacionMedico({
        medicoId,
        tipo,
        categoria:      'citas_agenda',
        titulo:         t.titulo,
        cuerpo:         t.cuerpo,
        requiereAccion: t.requiereAccion,
        accionUrl:      '/medico/agenda',
        accionLabel:    t.accionLabel,
        pacienteNombre: nombrePaciente,
        citaId,
      });
    }

    if (canales.whatsapp) {
      const medicoDoc = await Medico.findById(medicoId).select('whatsapp telefono nombre apellido').lean();
      const tel = telMedico(medicoDoc);
      if (tel) {
        const EMOJIS = { cita_nueva: '📅', cita_cancelada: '❌', cita_reagendada: '🔄' };
        const msg = `${EMOJIS[tipo]} Crisal-iA — ${t.titulo}\n${t.cuerpo}`;
        await enviarMensajeCitaPaciente(tel, msg);
      }
    }
  } catch (e) {
    console.error('[medicoNotificacion] notificarMedicoCambiosCita:', e);
  }
}