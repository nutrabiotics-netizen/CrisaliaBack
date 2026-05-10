/**
 * controlPreCitaJob.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Job diario que detecta citas de control en los próximos 14 días,
 * genera un nuevo interrogatorio tipo 'control' y envía notificación WhatsApp.
 *
 * Uso: importar y llamar scheduleControlPreCitaJob() al iniciar el servidor.
 * Sin cron externo: usa setInterval con periodicidad de 24 h.
 */

import Cita from '../../models/Cita';
import Interrogatorio from '../../models/Interrogatorio';
import Paciente from '../../models/Paciente';
import Paraclinico from '../../models/Paraclinico';
import { enviarMensajeCitaPaciente } from '../notifications/citaWhatsAppNotifier';
import { AIService } from '../ai/AIService';

const VENTANA_DIAS = 14;
const INTERVALO_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Procesa una cita de control próxima:
 *  1. Crea un Interrogatorio tipo 'control' si no existe para esa cita.
 *  2. Genera un resumen IA de control (AIService.generarResumenControl).
 *  3. Notifica al paciente por WhatsApp.
 */
async function procesarCitaControl(_citaId: string, pacienteId: string): Promise<void> {
  // Evitar duplicar interrogatorio si ya existe uno pendiente/en_proceso para esta cita
  const existente = await Interrogatorio.findOne({
    pacienteId,
    tipo: 'control',
    estado: { $in: ['pendiente', 'en_proceso'] }
  }).lean();

  if (!existente) {
    await Interrogatorio.create({
      pacienteId,
      tipo: 'control',
      estado: 'pendiente',
      progreso: 0,
      respuestas: {},
      observacionesIA: []
    });
  }

  // Resumen IA en background (no bloquea el flujo si falla)
  let semaforoGeneral = '';
  try {
    const resumen = await AIService.generarResumenControl({ pacienteId, tipoControl: 'seguimiento' });
    semaforoGeneral = resumen.semaforoGeneral ?? '';
    console.info(`[ControlJob] paciente=${pacienteId} semaforo=${semaforoGeneral}`);
  } catch (err) {
    console.warn('[ControlJob] generarResumenControl error (no crítico):', err);
  }

  // Análisis evolutivo de paraclínicos si el paciente tiene documentos
  let tieneParaclinicos = false;
  try {
    const countParac = await Paraclinico.countDocuments({ pacienteId });
    if (countParac > 0) {
      tieneParaclinicos = true;
      await AIService.analizarParaclinicos({ pacienteId });
      console.info(`[ControlJob] Paraclínicos re-analizados para paciente=${pacienteId}`);
    }
  } catch (err) {
    console.warn('[ControlJob] analizarParaclinicos error (no crítico):', err);
  }

  // Notificación WhatsApp al paciente
  try {
    const paciente = await Paciente.findById(pacienteId).select('nombre telefono').lean();
    if (paciente?.telefono) {
      const extras = tieneParaclinicos
        ? ' Tus resultados de laboratorio han sido actualizados en tu perfil.'
        : '';
      const msg =
        `Hola${paciente.nombre ? ` ${paciente.nombre}` : ''}, tienes una consulta de control próxima en Crisal-iA. ` +
        `Por favor completa tu cuestionario de seguimiento en la app para que tu médico esté preparado.${extras} ¡Gracias!`;
      await enviarMensajeCitaPaciente(paciente.telefono, msg);
    }
  } catch (err) {
    console.warn('[ControlJob] WhatsApp error (no crítico):', err);
  }
}

/**
 * Escanea la BD buscando citas de control en los próximos VENTANA_DIAS días.
 */
async function runControlPreCitaJob(): Promise<void> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + VENTANA_DIAS * 24 * 60 * 60 * 1000);

  const citas = await Cita.find({
    tipo: 'control',
    estado: { $in: ['pendiente', 'confirmada'] },
    fecha: { $gte: ahora, $lte: limite }
  })
    .select('pacienteId medicoId fecha')
    .lean();

  console.info(`[ControlJob] ${new Date().toISOString()} — ${citas.length} cita(s) de control en próximos ${VENTANA_DIAS} días.`);

  for (const cita of citas) {
    try {
      await procesarCitaControl(String(cita._id), String(cita.pacienteId));
    } catch (err) {
      console.error('[ControlJob] Error procesando cita', cita._id, err);
    }
  }
}

/**
 * Registra el job. Ejecuta inmediatamente y luego cada 24 h.
 */
export function scheduleControlPreCitaJob(): void {
  // Primera ejecución al arrancar (diferida 10 s para que la DB esté lista)
  setTimeout(() => {
    runControlPreCitaJob().catch((err) => console.error('[ControlJob] Error inicial:', err));
  }, 10_000);

  setInterval(() => {
    runControlPreCitaJob().catch((err) => console.error('[ControlJob] Error periódico:', err));
  }, INTERVALO_MS);

  console.info('[ControlJob] Job de pre-cita de control registrado (cada 24 h).');
}
