import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import CuidadorIAConversacion from '../../models/CuidadorIAConversacion';
import Interrogatorio from '../../models/Interrogatorio';

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
