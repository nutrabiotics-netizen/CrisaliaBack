import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import Interrogatorio from '../../models/Interrogatorio';
import { interpretarMedicamentos, firmarMedicamentos, MAX_ACLARACIONES_MEDICAMENTOS } from '../../services/ai/medicamentosReferidos';
import { AppError, handleError } from '../../utils/errors';

export const interpretarMedicamentosReferidos = async (req: AuthRequest, res: Response) => {
  try {
    const { interrogatorioId, questionId, texto, aclaraciones = [], finalizarPendientes } = req.body;
    if (!req.userId) throw new AppError('No autenticado', 401);
    if (typeof interrogatorioId !== 'string' || !/^[a-f\d]{24}$/i.test(interrogatorioId) || questionId !== 's01_medicamentos_actuales' ||
      typeof texto !== 'string' || !texto.trim() || texto.length > 4000 || !Array.isArray(aclaraciones) || aclaraciones.length > MAX_ACLARACIONES_MEDICAMENTOS ||
      (finalizarPendientes !== undefined && typeof finalizarPendientes !== 'boolean') ||
      aclaraciones.some(a => typeof a !== 'string' || !a.trim() || a.length > 2000)) throw new AppError('Revisa el texto de los medicamentos.', 400);
    const doc = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId: req.userId }).select('estado fase1.estado fase1.preguntaId fase1.confirmada fase2Generacion fase2Reinicio').lean();
    if (!doc) throw new AppError('Interrogatorio no encontrado', 404);
    if (doc.estado === 'completado' || doc.fase2Reinicio?.pendiente || doc.fase1?.confirmada || doc.fase1?.estado !== 'recopilando' || doc.fase1?.preguntaId !== questionId)
      throw new AppError('La pregunta cambió. Retoma la entrevista.', 409);
    let resultado;
    try { resultado = await interpretarMedicamentos({ texto: texto.trim(), aclaraciones: aclaraciones.map((a: string) => a.trim()), finalizarPendientes }); }
    catch (error) {
      const motivos = ['Extracción inválida', 'Mención sin respaldo', 'Recuperación inválida', 'Selección inválida', 'Código fuera de candidatos', 'Respuesta incompleta'];
      console.warn('[MedicamentosReferidos] Falló la interpretación', { causa: error instanceof Error && motivos.includes(error.message) ? error.message : 'Proveedor no disponible o respuesta no válida' });
      throw new AppError('No pudimos revisar los medicamentos. El texto se conserva; vuelve a intentarlo.', 503);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { ...resultado, comprobante: resultado.preguntas.length ? undefined :
      firmarMedicamentos({ pacienteId: req.userId, interrogatorioId, questionId, referencia: 'paciente', generacion: doc.fase2Generacion || 0 }, resultado.registro) } });
  } catch (error) { handleError(error as Error, res); }
};
