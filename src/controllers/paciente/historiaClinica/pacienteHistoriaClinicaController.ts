import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import pacienteHistoriaClinicaService from '../../../services/paciente/historiaClinica/pacienteHistoriaClinicaService';
import { invokeBedrockText } from '../../../services/ai/bedrockTextService';

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

    const proximaFechaStr = (detalle.cita as any)?.fecha
      ? new Date((detalle.cita as any).fecha).toLocaleDateString('es-CO', {
          day: 'numeric', month: 'long', year: 'numeric'
        })
      : 'una próxima fecha';

    const systemPrompt = `Eres "Cuidador IA" de Crisal-IA (medicina funcional). Generás recomendaciones de seguimiento entre cita y cita para un paciente. Tono cálido y profesional, sin emojis, sin markdown, sin listas. Devolvés UN solo párrafo de 2 oraciones máximo. NO menciones medicamentos ni dosis. NO repitas literalmente las recomendaciones del médico — complementalas con seguimiento.`;

    const userPrompt = `Información de la cita (${proximaFechaStr}):
Motivo: ${hc.motivoConsulta || 'no especificado'}
Diagnósticos: ${(hc.diagnosticos || []).map((d: any) => d.descripcion).join('; ') || 'no especificados'}
Recomendaciones del médico: ${hc.recomendaciones || 'no especificadas'}

Generá ahora el párrafo de 2 oraciones con sugerencias de seguimiento (cuándo cargar fotos de evolución, cuándo notar señales de alerta, etc.).`;

    let texto: string;
    try {
      texto = await invokeBedrockText(userPrompt, {
        system: systemPrompt,
        maxTokens: 200,
        temperature: 0.5
      });
      if (!texto) {
        texto = 'Continúa con las indicaciones de tu médico y registra cualquier cambio relevante.';
      }
    } catch (err) {
      console.warn('[obtenerRecomendacionesIA] Bedrock falló, devolviendo fallback:', err);
      texto = 'Continúa con las indicaciones de tu médico. Si notás cambios o señales que te preocupen, agenda un control o consultá vía Cuidador IA.';
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
