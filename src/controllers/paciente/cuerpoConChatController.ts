import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { responderCuerpoConChat, precargarAgenteAcademico } from '../../services/ai/cuerpoConChatService';
import Paciente from '../../models/Paciente';
import Interrogatorio from '../../models/Interrogatorio';
import { handleError } from '../../utils/errors';

/**
 * POST /paciente/cuerpo-chat
 * Body: { zonasDolorMarcadas: string[], historial: MensajeChat[], mensajeUsuario: string }
 * Devuelve la respuesta de la IA para el chat del mapa corporal.
 */
/**
 * POST /paciente/cuerpo-chat/precargar
 * Body: { zonasDolorMarcadas: string[] }
 * Dispara la precarga del AgenteAcademico en background — llamar cuando el paciente marca zonas
 */
export const precargar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { zonasDolorMarcadas = [] } = req.body;
    if (zonasDolorMarcadas?.length) {
      precargarAgenteAcademico(zonasDolorMarcadas);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.json({ success: true }); // nunca fallar — es fire-and-forget
  }
};

export const responder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const { zonasDolorMarcadas = [], historial = [], mensajeUsuario } = req.body;

    if (!mensajeUsuario || typeof mensajeUsuario !== 'string' || !mensajeUsuario.trim()) {
      res.status(400).json({ success: false, message: 'mensajeUsuario requerido' });
      return;
    }

    // Obtener nombre del paciente para personalizar
    const paciente = await Paciente.findById(pacienteId).select('nombre').lean() as any;
    const nombrePaciente = paciente?.nombre;

    // Precargar AgenteAcademico en background desde el primer mensaje con zonas
    if (zonasDolorMarcadas?.length) {
      precargarAgenteAcademico(zonasDolorMarcadas);
    }

    const respuesta = await responderCuerpoConChat({
      zonasDolorMarcadas,
      historial,
      mensajeUsuario: mensajeUsuario.trim(),
      nombrePaciente
    });

    // Extraer causas del bloque [[CAUSAS]]..[[/CAUSAS]]
    let causas: {titulo: string; desc: string}[] = [];
    const causasMatch = respuesta.match(/\[\[CAUSAS\]\]([\s\S]*?)\[\[\/CAUSAS\]\]/);
    if (causasMatch) {
      try { causas = JSON.parse(causasMatch[1].trim()); } catch { /* ignorar */ }
    }

    // Detectar fin y limpiar marcadores
    const finConversacion = respuesta.includes('[[FIN_CONVERSACION]]');
    const respuestaSinMarcadores = respuesta
      .replace(/\[\[CAUSAS\]\][\s\S]*?\[\[\/CAUSAS\]\]/g, '')
      .replace('[[FIN_CONVERSACION]]', '')
      .trim();

    // Limpiar fences de markdown antes de parsear
    const respuestaClean = respuestaSinMarcadores
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/m, '')
      .trim();

    // Parsear JSON estructurado { texto, opciones, respuestaLibre }
    let textoFinal = respuestaClean;
    let opciones: string[] = [];
    try {
      const jsonStart = respuestaClean.indexOf('{');
      const jsonEnd = respuestaClean.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonStr = respuestaClean.slice(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr);
        if (parsed?.texto) {
          // Combinar el "texto" del JSON con cualquier contenido adicional fuera del JSON
          const afterJson = respuestaClean.slice(jsonEnd + 1).trim();
          textoFinal = afterJson ? `${parsed.texto}\n\n${afterJson}` : parsed.texto;
          opciones = Array.isArray(parsed.opciones) ? parsed.opciones : [];
        }
      }
    } catch { /* si no es JSON válido, usar el texto completo */ }

    console.log('[cuerpoConChat] finConversacion:', finConversacion, 'opciones:', opciones.length);

    // Si es la respuesta final, guardar zonas de dolor + conversación en Interrogatorio
    if (finConversacion) {
      try {
        // 1. Actualizar zonas de dolor del paciente
        if (zonasDolorMarcadas?.length) {
          await Paciente.findByIdAndUpdate(pacienteId, {
            $set: { zonasDolor: zonasDolorMarcadas }
          });
        }

        // 2. Crear/actualizar Interrogatorio tipo primera_vez
        const interrogatorioExistente = await Interrogatorio.findOne({ pacienteId, tipo: 'primera_vez' });
        if (interrogatorioExistente) {
          interrogatorioExistente.estado = 'completado';
          interrogatorioExistente.progreso = 100;
          interrogatorioExistente.analisisIA = textoFinal;
          interrogatorioExistente.respuestas = {
            zonasDolor: zonasDolorMarcadas,
            historialChat: historial,
            mensajeFinal: mensajeUsuario,
            causas
          };
          interrogatorioExistente.markModified('respuestas');
          interrogatorioExistente.markModified('analisisIA');
          await interrogatorioExistente.save();
        } else {
          await Interrogatorio.create({
            pacienteId,
            tipo: 'primera_vez',
            estado: 'completado',
            progreso: 100,
            analisisIA: textoFinal,
            respuestas: {
              zonasDolor: zonasDolorMarcadas,
              historialChat: historial,
              mensajeFinal: mensajeUsuario,
              causas
            },
            creadoPorRol: 'Paciente'
          });
        }
        console.info('[cuerpoConChat] Interrogatorio primera_vez guardado para paciente', pacienteId);
      } catch (e) {
        console.warn('[cuerpoConChat] Error guardando interrogatorio (no crítico):', e);
      }
    }

    res.json({ success: true, data: { respuesta: textoFinal, opciones, finConversacion } });
  } catch (err: any) {
    console.error('[cuerpoConChat]', err);
    handleError(err, res);
  }
};
