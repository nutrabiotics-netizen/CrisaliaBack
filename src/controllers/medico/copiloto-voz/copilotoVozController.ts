import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { handleError } from '../../../utils/errors';
import {
  actualizarCopilotoVozConfig,
  obtenerCopilotoVozConfig,
  obtenerEstadoSaludCopilotoVoz
} from '../../../services/medico/copiloto-voz/copilotoVozService';
import Interrogatorio from '../../../models/Interrogatorio';
import Cita from '../../../models/Cita';
import { invokeAgent } from '../../../services/ai/bedrock.service';

export const getCopilotoVozHealth = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = obtenerEstadoSaludCopilotoVoz();
    res.status(200).json({
      success: true,
      message: 'Estado del copiloto por voz',
      data
    });
  } catch (error: unknown) {
    handleError(error instanceof Error ? error : new Error(String(error)), res);
  }
};

export const getCopilotoVozConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const data = await obtenerCopilotoVozConfig(medicoId);
    res.status(200).json({
      success: true,
      message: 'Configuración del copiloto por voz',
      data
    });
  } catch (error: unknown) {
    handleError(error instanceof Error ? error : new Error(String(error)), res);
  }
};

/**
 * POST /copiloto-voz/sugerir-examen
 * Dado el nombre de una sección del examen físico y el contexto del paciente,
 * retorna hallazgos sugeridos por IA para esa sección.
 * Body: { citaId: string, seccion: string, notasParciales?: string }
 */
export const sugerirExamenSeccion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const { citaId, seccion, notasParciales } = req.body;

    if (!citaId || !seccion) {
      res.status(400).json({ success: false, message: 'citaId y seccion son requeridos.' });
      return;
    }

    // Obtener cita del médico
    const cita = await Cita.findOne({ _id: citaId, medicoId }).lean();
    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada.' });
      return;
    }

    // Buscar anamnesis del paciente
    const interrogatorio = await Interrogatorio.findOne({ pacienteId: cita.pacienteId })
      .sort({ createdAt: -1 })
      .select('respuestas analisisIA objetivos')
      .lean();

    const contexto = interrogatorio
      ? `Análisis IA: ${(interrogatorio as any).analisisIA ?? 'No disponible'}\nObjetivos: ${((interrogatorio as any).objetivos ?? []).join(', ')}`
      : 'Sin anamnesis previa disponible.';

    const prompt = `
Eres un copiloto clínico de Medicina Funcional. El médico está realizando el examen físico.
Sección actual: "${seccion}"
${notasParciales ? `Notas parciales del médico: ${notasParciales}` : ''}
Contexto clínico del paciente:
${contexto}

Genera exactamente 3-5 hallazgos clínicos relevantes que el médico debería explorar/documentar
en la sección "${seccion}" para este paciente, considerando el enfoque de Medicina Funcional.

Retorna ÚNICAMENTE un array JSON de strings. Ejemplo:
["Evaluar tono muscular paravertebral", "Palpar puntos gatillo en trapecio", "Revisar movilidad cervical"]
Sin texto adicional, sin markdown, solo el array JSON.
`.trim();

    const raw = await invokeAgent(prompt);

    let sugerencias: string[] = [];
    try {
      const cleaned = raw.trim().replace(/^```json?|```$/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) sugerencias = parsed.map(String);
    } catch {
      // Si no es JSON válido, intentar extraer líneas
      sugerencias = raw.split('\n').filter((l) => l.trim().length > 0).slice(0, 5);
    }

    res.json({ success: true, data: { seccion, sugerencias } });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const putCopilotoVozConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const body = req.body as { habilitado?: boolean };
    if (body.habilitado === undefined) {
      res.status(400).json({
        success: false,
        message: 'Debe enviar habilitado (true o false)'
      });
      return;
    }
    const data = await actualizarCopilotoVozConfig(medicoId, body);
    res.status(200).json({
      success: true,
      message: 'Configuración actualizada',
      data
    });
  } catch (error: unknown) {
    handleError(error instanceof Error ? error : new Error(String(error)), res);
  }
};
