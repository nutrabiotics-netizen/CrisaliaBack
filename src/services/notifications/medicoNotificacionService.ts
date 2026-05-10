/**
 * medicoNotificacionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Notificaciones proactivas enviadas al médico sobre eventos del paciente.
 * Usa el mismo webhook WhatsApp que citaWhatsAppNotifier.
 */

import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import { enviarMensajeCitaPaciente } from './citaWhatsAppNotifier';

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function resolverMedicoDelPaciente(pacienteId: string) {
  // Busca la cita más reciente del paciente para obtener el médico asignado
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

// ─── Notificaciones exportadas ────────────────────────────────────────────────

/**
 * Notifica al médico cuando el paciente alcanza el 50% o el 100% de la anamnesis.
 */
export async function notificarMedicoProgresoAnamnesis(
  pacienteId: string,
  progreso: number
): Promise<void> {
  const [medico, nombrePac] = await Promise.all([
    resolverMedicoDelPaciente(pacienteId),
    resolverNombrePaciente(pacienteId),
  ]);
  const tel = telMedico(medico);
  if (!tel) return;

  const nombreMed = medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : 'Dr(a).';

  let msg: string;
  if (progreso >= 100) {
    msg =
      `✅ Crisal-iA — Anamnesis completada\n` +
      `Hola ${nombreMed}, ${nombrePac} ha completado el 100% de su cuestionario de anamnesis. ` +
      `Ya puedes revisar el análisis IA en la plataforma antes de la consulta.`;
  } else {
    msg =
      `📋 Crisal-iA — Anamnesis en progreso\n` +
      `Hola ${nombreMed}, ${nombrePac} ha completado el 50% de su cuestionario. ` +
      `Puedes ver el avance preliminar en Crisal-iA.`;
  }

  await enviarMensajeCitaPaciente(tel, msg);
}

/**
 * Notifica al médico que un paciente ha solicitado un concepto/asesoría urgente.
 */
export async function notificarMedicoAsesoriaUrgente(
  pacienteId: string,
  asunto: string
): Promise<void> {
  const [medico, nombrePac] = await Promise.all([
    resolverMedicoDelPaciente(pacienteId),
    resolverNombrePaciente(pacienteId),
  ]);
  const tel = telMedico(medico);
  if (!tel) return;

  const nombreMed = medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : 'Dr(a).';
  const msg =
    `🆘 Crisal-iA — Solicitud urgente\n` +
    `Hola ${nombreMed}, ${nombrePac} ha solicitado un concepto urgente: "${asunto}". ` +
    `Revisa la sección de Asesorías en Crisal-iA.`;

  await enviarMensajeCitaPaciente(tel, msg);
}

/**
 * Notifica al médico cuando el paciente actualiza datos de control (2.º cuestionario).
 */
export async function notificarMedicoControlActualizado(
  pacienteId: string
): Promise<void> {
  const [medico, nombrePac] = await Promise.all([
    resolverMedicoDelPaciente(pacienteId),
    resolverNombrePaciente(pacienteId),
  ]);
  const tel = telMedico(medico);
  if (!tel) return;

  const nombreMed = medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : 'Dr(a).';
  const msg =
    `🔄 Crisal-iA — Cuestionario de control actualizado\n` +
    `Hola ${nombreMed}, ${nombrePac} ha completado el cuestionario de seguimiento. ` +
    `Accede al análisis evolutivo en la plataforma.`;

  await enviarMensajeCitaPaciente(tel, msg);
}
