import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import pacienteHistoriaClinicaService from '../../../services/paciente/historiaClinica/pacienteHistoriaClinicaService';
import HistoriaClinica from '../../../models/HistoriaClinica';
import { invokeBedrockText } from '../../../services/ai/bedrockTextService';
import {
  generarRecomendacionesPaciente,
  generarResumenCita,
  responderPreguntaCita,
  limpiarRespuestaAgente
} from '../../../services/ai/crisaliaAgentService';

export const obtenerHistoriaPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const historia = await pacienteHistoriaClinicaService.obtenerPorCita(
      citaId as string,
      pacienteId
    );

    if (!historia) {
      res.status(404).json({ success: false, message: 'Historia clínica no encontrada' });
      return;
    }

    res.json({ success: true, data: historia });
  } catch (error: any) {
    console.error('Error al obtener historia clínica del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historia clínica',
      error: error.message
    });
  }
};

/**
 * GET /api/paciente/historia-clinica/cita/:citaId/detalle
 * Devuelve un bundle completo de la cita: HC + Fórmula + Exámenes + Pago + Cita.
 */
export const obtenerDetalleCompleto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const detalle = await pacienteHistoriaClinicaService.obtenerDetalleCompleto(
      citaId as string,
      pacienteId
    );

    if (!detalle) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    res.json({ success: true, data: detalle });
  } catch (error: any) {
    console.error('Error al obtener detalle completo de la cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener detalle de la cita',
      error: error.message
    });
  }
};

/**
 * GET /api/paciente/historia-clinica/cita/:citaId/recomendaciones-ia
 * Genera (o devuelve) "Recomendaciones de Crisal-IA" para esta cita usando Bedrock.
 * El resultado se cachea en HistoriaClinica.recomendacionesCrisalIA si querés
 * persistirlo. Por simplicidad, este endpoint genera on-demand.
 */
export const obtenerRecomendacionesIA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const detalle = await pacienteHistoriaClinicaService.obtenerDetalleCompleto(
      citaId as string,
      pacienteId
    );
    if (!detalle) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    const hc = detalle.historia as any;
    if (!hc) {
      res.json({
        success: true,
        data: {
          texto:
            'Aún no hay historia clínica registrada para esta cita. Cuando tu médico complete el resumen, podremos generar recomendaciones personalizadas.'
        }
      });
      return;
    }

    // Cache: si ya se generó antes, devolver sin reinvocar al agente.
    // Limpiamos por si quedó texto en inglés de generaciones previas.
    if (hc.iaRecomendacionesPaciente?.texto) {
      const limpio = limpiarRespuestaAgente(hc.iaRecomendacionesPaciente.texto);
      if (limpio !== hc.iaRecomendacionesPaciente.texto && hc._id) {
        HistoriaClinica.updateOne(
          { _id: hc._id },
          { $set: { 'iaRecomendacionesPaciente.texto': limpio } }
        ).catch(() => {});
      }
      res.json({ success: true, data: { texto: limpio, cacheado: true } });
      return;
    }

    const proximaFechaStr = (detalle.cita as any)?.fecha
      ? new Date((detalle.cita as any).fecha).toLocaleDateString('es-CO', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
        })
      : 'una próxima fecha';

    const pacienteNombre =
      (detalle.cita as any)?.pacienteId?.nombre ||
      (detalle as any)?.pacienteNombre ||
      undefined;

    // Primero intentamos con el agente oficial Crisal·IA (YY3KJX4H78/TBGVLCOKOG).
    // Si falla por cualquier razón, fallback a invokeBedrockText con prompt manual.
    let texto = '';
    let generado = false;
    try {
      texto = await generarRecomendacionesPaciente({
        pacienteNombre,
        fechaCita: proximaFechaStr,
        motivoConsulta: hc.motivoConsulta,
        diagnosticos: (hc.diagnosticos || []).map((d: any) => d.descripcion).filter(Boolean),
        recomendacionesMedico: hc.recomendaciones
      });
      if (texto?.trim()) generado = true;
    } catch (agentErr) {
      console.warn('[obtenerRecomendacionesIA] Crisal·IA Agent falló → fallback Bedrock text:', agentErr);
      try {
        const systemPrompt = `Eres "Cuidador IA" de Crisal-IA (medicina funcional). Tono cálido y profesional, sin emojis, sin markdown, sin listas. UN solo párrafo de 2 oraciones máximo. NO menciones medicamentos ni dosis.`;
        const userPrompt = `Información de la cita (${proximaFechaStr}):
Motivo: ${hc.motivoConsulta || 'no especificado'}
Diagnósticos: ${(hc.diagnosticos || []).map((d: any) => d.descripcion).join('; ') || 'no especificados'}
Recomendaciones del médico: ${hc.recomendaciones || 'no especificadas'}

Generá ahora el párrafo de 2 oraciones con sugerencias de seguimiento.`;
        texto = await invokeBedrockText(userPrompt, { system: systemPrompt, maxTokens: 200, temperature: 0.5 });
        if (texto?.trim()) generado = true;
      } catch (textErr) {
        console.warn('[obtenerRecomendacionesIA] Bedrock text también falló:', textErr);
      }
    }
    if (!texto?.trim()) {
      texto = 'Continúa con las indicaciones de tu médico. Si notás cambios o señales que te preocupen, agenda un control o consultá vía Cuidador IA.';
    }

    // Persistir solo si se generó realmente (no el fallback genérico),
    // para no reinvocar al agente en próximas aperturas.
    if (generado && hc._id) {
      HistoriaClinica.updateOne(
        { _id: hc._id },
        { $set: { iaRecomendacionesPaciente: { texto, generadoEn: new Date() } } }
      ).catch((e) => console.warn('[obtenerRecomendacionesIA] no se pudo cachear:', e?.message));
    }

    res.json({ success: true, data: { texto } });
  } catch (error: any) {
    console.error('Error al generar recomendaciones IA:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar recomendaciones IA',
      error: error.message
    });
  }
};

/**
 * GET /paciente/historia-clinica/cita/:citaId/resumen
 *
 * Genera "Resumen de la cita" para el paciente — texto narrativo en lenguaje
 * claro sobre lo ocurrido en la consulta. Conectado al agente Crisal·IA
 * (YY3KJX4H78 / TBGVLCOKOG). Si el agente falla, fallback a Bedrock text.
 */
export const obtenerResumenCitaIA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const detalle = await pacienteHistoriaClinicaService.obtenerDetalleCompleto(
      citaId as string,
      pacienteId
    );
    if (!detalle) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    const hc = detalle.historia as any;
    if (!hc) {
      res.json({
        success: true,
        data: {
          texto: 'El médico aún no ha cerrado la atención. El resumen se generará cuando la historia clínica esté completa.'
        }
      });
      return;
    }

    // Cache: si ya se generó antes, devolver sin reinvocar al agente.
    // Limpiamos por si quedó texto en inglés de generaciones previas.
    if (hc.iaResumenCita?.texto) {
      const limpio = limpiarRespuestaAgente(hc.iaResumenCita.texto);
      if (limpio !== hc.iaResumenCita.texto && hc._id) {
        HistoriaClinica.updateOne(
          { _id: hc._id },
          { $set: { 'iaResumenCita.texto': limpio } }
        ).catch(() => {});
      }
      res.json({ success: true, data: { texto: limpio, cacheado: true } });
      return;
    }

    const fechaStr = (detalle.cita as any)?.fecha
      ? new Date((detalle.cita as any).fecha).toLocaleDateString('es-CO', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
        })
      : 'fecha reciente';

    const pacienteNombre =
      (detalle.cita as any)?.pacienteId?.nombre || undefined;

    let texto = '';
    let generado = false;
    try {
      texto = await generarResumenCita({
        pacienteNombre,
        fechaCita: fechaStr,
        motivoConsulta: hc.motivoConsulta,
        enfermedadActual: hc.enfermedadActual,
        diagnosticos: (hc.diagnosticos || []).map((d: any) => d.descripcion).filter(Boolean),
        recomendacionesMedico: hc.recomendaciones,
        analisisPlan: hc.analisisyplan ?? hc.analisisPlan,
        examenFisico: typeof hc.examenMedico === 'object'
          ? JSON.stringify(hc.examenMedico).slice(0, 500)
          : (hc.examenMedico || '')
      });
      if (texto?.trim()) generado = true;
    } catch (err) {
      console.warn('[obtenerResumenCitaIA] Crisal·IA Agent falló:', err);
      texto = `Durante tu consulta del ${fechaStr} se evaluó: ${hc.motivoConsulta || 'tu motivo de consulta'}. ${(hc.diagnosticos || []).length > 0 ? `Diagnósticos: ${(hc.diagnosticos || []).map((d: any) => d.descripcion).join(', ')}. ` : ''}${hc.recomendaciones ? `Tu médico recomendó: ${hc.recomendaciones}.` : ''}`;
    }

    // Persistir solo si lo generó el agente (no el fallback armado a mano)
    if (generado && hc._id) {
      HistoriaClinica.updateOne(
        { _id: hc._id },
        { $set: { iaResumenCita: { texto, generadoEn: new Date() } } }
      ).catch((e) => console.warn('[obtenerResumenCitaIA] no se pudo cachear:', e?.message));
    }

    res.json({ success: true, data: { texto } });
  } catch (error: any) {
    console.error('Error al generar resumen IA de la cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar resumen IA',
      error: error.message
    });
  }
};

/**
 * POST /paciente/historia-clinica/cita/:citaId/preguntar
 *
 * Chat del paciente con el agente Crisal·IA sobre una cita específica.
 * Body: { pregunta: string, sessionId?: string }
 * Responde: { texto, sessionId }  (reusar sessionId mantiene el hilo)
 */
export const preguntarAsistenteCitaIA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    const { pregunta, sessionId } = req.body || {};

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (!pregunta || typeof pregunta !== 'string' || !pregunta.trim()) {
      res.status(400).json({ success: false, message: 'La pregunta es requerida' });
      return;
    }

    const detalle = await pacienteHistoriaClinicaService.obtenerDetalleCompleto(
      citaId as string,
      pacienteId
    );
    if (!detalle) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    const hc = detalle.historia as any;
    const cita = detalle.cita as any;
    const formula = (detalle as any).formula as any;

    const fechaStr = cita?.fecha
      ? new Date(cita.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      : 'fecha reciente';

    const medicamentos: string[] = (formula?.medicamentos || []).map((m: any) =>
      `${m.denominacionComun || m.nombre || ''} ${m.concentracion || ''} ${m.dosis || ''} ${m.frecuencia || ''}`.trim()
    ).filter(Boolean);

    const sid = sessionId || `cita-${citaId}-${pacienteId}`;

    let texto = '';
    try {
      texto = await responderPreguntaCita({
        pregunta: pregunta.trim(),
        sessionId: sid,
        contexto: {
          pacienteNombre: cita?.pacienteId?.nombre,
          fechaCita: fechaStr,
          especialidad: cita?.medico?.especialidad || cita?.medicoId?.especialidad,
          motivoConsulta: hc?.motivoConsulta,
          diagnosticos: (hc?.diagnosticos || []).map((d: any) => d.descripcion).filter(Boolean),
          recomendacionesMedico: hc?.recomendaciones,
          medicamentos,
          resumenCita: hc?.analisisPlan
        }
      });
    } catch (err) {
      console.warn('[preguntarAsistenteCitaIA] Crisal·IA Agent falló:', err);
      texto = 'En este momento no puedo responder tu pregunta. Por favor inténtalo de nuevo en unos minutos o consulta directamente con tu médico.';
    }

    if (!texto?.trim()) {
      texto = 'No tengo información suficiente para responder eso. Te recomiendo consultarlo con tu médico tratante.';
    }

    res.json({ success: true, data: { texto, sessionId: sid } });
  } catch (error: any) {
    console.error('Error en chat de cita con IA:', error);
    res.status(500).json({ success: false, message: 'Error al consultar el asistente IA', error: error.message });
  }
};

export const listarHistoriasDelPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const historias = await pacienteHistoriaClinicaService.listarPorPaciente(pacienteId);
    res.json({ success: true, data: historias });
  } catch (error: any) {
    console.error('Error al listar historias clínicas del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar historias clínicas',
      error: error.message
    });
  }
};
