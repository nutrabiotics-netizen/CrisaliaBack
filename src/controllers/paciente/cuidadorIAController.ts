import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import CuidadorIAConversacion from '../../models/CuidadorIAConversacion';
import Interrogatorio from '../../models/Interrogatorio';
import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import { enviarMensajeCitaPaciente } from '../../services/notifications/citaWhatsAppNotifier';

const MAX_MENSAJES_HISTORIAL = 40; // Ventana de contexto enviada a la IA
const MAX_CHARS_CONTEXTO = 3000;  // Límite de caracteres del resumen de anamnesis inyectado

/**
 * Construye el prompt del sistema con contexto funcional del paciente.
 */
async function buildSystemPrompt(pacienteId: string): Promise<string> {
  let contexto = '';
  try {
    const interr = await Interrogatorio.findOne({ pacienteId })
      .sort({ createdAt: -1 })
      .select('respuestas objetivos analisisFisiologicoIA analisisIA')
      .lean();
    if (interr) {
      const raw = JSON.stringify({
        objetivos: interr.objetivos,
        semaforo: interr.analisisFisiologicoIA,
        analisis: interr.analisisIA,
        respuestas: interr.respuestas
      });
      contexto = raw.slice(0, MAX_CHARS_CONTEXTO);
    }
  } catch {
    // Si falla, trabajamos sin contexto (no bloquea la respuesta)
  }

  return `Eres el Cuidador IA de Crisal-iA, un asistente de salud funcional empático y proactivo.
Tu función es acompañar al paciente entre consultas: reforzar hábitos saludables, recordar suplementos y
rutinas prescritas, responder preguntas generales de Medicina Funcional, y motivarlo en su proceso.

Reglas:
- Responde SIEMPRE en español colombiano, cálido y profesional.
- NO diagnostiques ni cambies indicaciones médicas; remite al médico cuando sea necesario.
- Sé conciso (máx. 3 párrafos por respuesta).
- Usa el contexto del paciente para personalizar cada respuesta.

${contexto ? `Contexto de salud del paciente:\n${contexto}` : 'No hay datos de anamnesis disponibles aún.'}`;
}

/**
 * POST /api/paciente/cuidador-ia/mensaje
 * Recibe el mensaje del paciente, lo agrega al historial y retorna la respuesta del Cuidador IA.
 */
export const enviarMensaje = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const { contenido } = req.body;
    if (!contenido?.trim()) {
      res.status(400).json({ mensaje: 'El campo "contenido" es requerido.' });
      return;
    }

    // Buscar o crear conversación
    let conv = await CuidadorIAConversacion.findOne({ pacienteId });
    if (!conv) {
      conv = await CuidadorIAConversacion.create({ pacienteId, mensajes: [], contextoIntegrado: false });
    }

    // Agregar mensaje del paciente
    conv.mensajes.push({ rol: 'paciente', contenido: contenido.trim(), timestamp: new Date() });

    // Construir historial para la IA (ventana de los últimos N mensajes)
    const ventana = conv.mensajes.slice(-MAX_MENSAJES_HISTORIAL);
    const historialTexto = ventana
      .map((m) => `${m.rol === 'paciente' ? 'Paciente' : 'Cuidador IA'}: ${m.contenido}`)
      .join('\n');

    // Generar respuesta vía Bedrock (AIService.obtenerFeedbackEmpatico es genérico)
    const systemPrompt = conv.contextoIntegrado
      ? undefined
      : await buildSystemPrompt(pacienteId);

    // Marcamos contexto como integrado en la primera respuesta
    if (!conv.contextoIntegrado) conv.contextoIntegrado = true;

    const promptCompleto = systemPrompt
      ? `${systemPrompt}\n\nHistorial de conversación:\n${historialTexto}\n\nResponde al último mensaje del paciente.`
      : `Historial de conversación:\n${historialTexto}\n\nResponde al último mensaje del paciente de forma empática como el Cuidador IA de Crisal-iA.`;

    const { invokeAgent } = await import('../../services/ai/bedrock.service');
    const respuestaIA = await invokeAgent(promptCompleto);
    const respuestaFinal = respuestaIA?.trim() || 'Gracias por escribirme. Estoy aquí para acompañarte en tu proceso de salud. ¿En qué puedo ayudarte hoy?';

    // Agregar respuesta al historial
    conv.mensajes.push({ rol: 'cuidador', contenido: respuestaFinal, timestamp: new Date() });

    // Limitar historial a 200 mensajes para no crecer indefinidamente
    if (conv.mensajes.length > 200) {
      conv.mensajes = conv.mensajes.slice(-200);
    }

    await conv.save();

    res.json({
      success: true,
      respuesta: respuestaFinal,
      mensajes: conv.mensajes.slice(-20) // Devuelve los últimos 20 para sincronizar UI
    });
  } catch (error) {
    console.error('[CuidadorIA] enviarMensaje:', error);
    res.status(500).json({ mensaje: 'Error al procesar el mensaje.' });
  }
};

/**
 * GET /api/paciente/cuidador-ia/historial
 * Retorna el historial completo de conversación del paciente.
 */
export const obtenerHistorial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const conv = await CuidadorIAConversacion.findOne({ pacienteId }).lean();

    res.json({
      success: true,
      mensajes: conv?.mensajes ?? [],
      totalMensajes: conv?.mensajes?.length ?? 0
    });
  } catch (error) {
    console.error('[CuidadorIA] obtenerHistorial:', error);
    res.status(500).json({ mensaje: 'Error al obtener el historial.' });
  }
};

/**
 * POST /api/paciente/cuidador-ia/alertar-medico
 * El paciente escala una preocupación al médico desde el Cuidador IA.
 * Body: { motivo?: string }
 */
export const alertarMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const { motivo } = req.body as { motivo?: string };

    // Buscar médico asignado via cita más reciente
    const cita = await Cita.findOne({ pacienteId })
      .sort({ createdAt: -1 })
      .select('medicoId')
      .lean();

    if (!cita?.medicoId) {
      res.status(404).json({ mensaje: 'No tienes un médico asignado aún.' });
      return;
    }

    const [medico, paciente] = await Promise.all([
      Medico.findById(cita.medicoId).select('nombre apellido whatsapp telefono').lean(),
      Paciente.findById(pacienteId).select('nombre apellido').lean(),
    ]);

    if (!medico) {
      res.status(404).json({ mensaje: 'Médico no encontrado.' });
      return;
    }

    const telMedico = (medico.whatsapp || medico.telefono)?.trim();
    const nombrePac = [paciente?.nombre, paciente?.apellido].filter(Boolean).join(' ') || 'Tu paciente';
    const nombreMed = [medico.nombre, medico.apellido].filter(Boolean).join(' ');

    const msg =
      `⚠️ ALERTA CUIDADOR IA — Crisal-iA\n` +
      `Hola Dr(a). ${nombreMed}, ${nombrePac} ha solicitado asistencia urgente desde el Cuidador IA.\n` +
      (motivo?.trim() ? `Motivo: "${motivo.trim()}"\n` : '') +
      `Por favor revisa su estado y comunícate con el paciente a la brevedad.`;

    if (telMedico) {
      await enviarMensajeCitaPaciente(telMedico, msg);
    } else {
      console.info('[CuidadorIA] alertarMedico — médico sin teléfono; solo log.');
    }

    console.info(`[CuidadorIA] alertarMedico paciente=${pacienteId} medico=${cita.medicoId}`);
    res.json({ success: true, mensaje: 'Tu médico ha sido notificado. Estará en contacto contigo.' });
  } catch (error) {
    console.error('[CuidadorIA] alertarMedico:', error);
    res.status(500).json({ mensaje: 'No se pudo enviar la alerta al médico.' });
  }
};

/**
 * DELETE /api/paciente/cuidador-ia/historial
 * Borra el historial de conversación (reinicia el chat).
 */
export const borrarHistorial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    await CuidadorIAConversacion.findOneAndUpdate(
      { pacienteId },
      { $set: { mensajes: [], contextoIntegrado: false } },
      { upsert: false }
    );

    res.json({ success: true, mensaje: 'Historial borrado.' });
  } catch (error) {
    console.error('[CuidadorIA] borrarHistorial:', error);
    res.status(500).json({ mensaje: 'Error al borrar el historial.' });
  }
};
