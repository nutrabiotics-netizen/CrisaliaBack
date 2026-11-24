import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import Interrogatorio from '../../models/Interrogatorio';
import { AppError, handleError } from '../../utils/errors';
import { cargarSecciones } from '../../services/ai/anamnesisOrchestratorService';
import { esAntecedenteAbierto, firmarSugerencia, interpretarAntecedente } from '../../services/ai/antecedentesCIE10';

export const interpretarAntecedentes = async (req: AuthRequest, res: Response) => {
  try {
    const { interrogatorioId, questionId, texto, aclaraciones = [], parentescoCodigo, familiarId } = req.body;
    if (!req.userId) throw new AppError('No autenticado', 401);
    if (typeof interrogatorioId !== 'string' || !/^[a-f\d]{24}$/i.test(interrogatorioId) || typeof questionId !== 'string' || !esAntecedenteAbierto(questionId) ||
      typeof texto !== 'string' || !texto.trim() || texto.length > 1200 || !Array.isArray(aclaraciones) || aclaraciones.length > 2 ||
      aclaraciones.some(t => typeof t !== 'string' || !t.trim() || t.length > 1000)) throw new AppError('Revisa el texto de tu respuesta.', 400);
    const doc = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId: req.userId }).select('estado fase1 fase2 fase2Generacion fase2Reinicio').lean();
    if (!doc) throw new AppError('Interrogatorio no encontrado', 404);
    const familiar = questionId === 's01_enfermedades_familia';
    const fase = familiar ? doc.fase1 : doc.fase2;
    if (doc.estado === 'completado' || doc.fase2Reinicio?.pendiente || !fase || fase.preguntaId !== questionId ||
      (familiar ? doc.fase1?.confirmada : doc.fase2?.estado !== 'preguntando')) throw new AppError('La pregunta cambió. Retoma la entrevista.', 409);
    let referencia = 'paciente';
    if (familiar) {
      const q = cargarSecciones(['s01']).s01.questions.find((p: any) => p.id === questionId);
      const parentesco = q?.search?.parentescos?.find((p: any) => p.codigo === parentescoCodigo);
      if (!parentesco || (familiarId !== undefined && !parentesco.familiares?.some((f: any) => f.id === familiarId))) throw new AppError('Selecciona un familiar válido.', 400);
      referencia = `${parentescoCodigo}:${familiarId ?? ''}`;
    }
    let resultado;
    try { resultado = await interpretarAntecedente({ texto: texto.trim(), aclaraciones: aclaraciones.map((t: string) => t.trim()), ambito: familiar ? 'familiar' : 'personal' }); }
    catch (error) {
      // Registrar solo una causa controlada: nunca relatos, identificadores ni respuestas crudas del proveedor.
      const motivos = ['Extracción inválida', 'Mención sin respaldo', 'Recuperación inválida', 'Selección inválida', 'Código fuera de candidatos', 'Respuesta incompleta'];
      const causa = error instanceof Error && motivos.includes(error.message) ? error.message : 'Proveedor no disponible o respuesta no válida';
      console.warn('[AntecedentesCIE10] Falló la interpretación', { causa });
      throw new AppError('No pudimos interpretar tu respuesta. El texto se conserva; vuelve a intentarlo.', 503);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { ...resultado,
      comprobante: resultado.preguntas.length ? undefined : firmarSugerencia({ pacienteId: req.userId, interrogatorioId, questionId, referencia, generacion: doc.fase2Generacion || 0 }, resultado.registro) } });
  } catch (error) { handleError(error as Error, res); }
};
