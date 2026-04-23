import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Interrogatorio from '../../models/Interrogatorio';
import { AIService } from '../../services/ai/AIService';

/** POST /api/paciente/recomendacion-automatica */
export const generarRecomendacionAutomatica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const interrogatorio = await Interrogatorio.findOne({
      pacienteId,
      estado: 'completado'
    }).sort({ createdAt: -1 });

    if (!interrogatorio) {
      res.status(404).json({ mensaje: 'No hay interrogatorio completado para este paciente.' });
      return;
    }

    // Devolver caché si fue generado en las últimas 24 horas
    if (interrogatorio.recomendacionAutomatica?.generadoEn) {
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (interrogatorio.recomendacionAutomatica.generadoEn > hace24h) {
        res.json({ success: true, data: interrogatorio.recomendacionAutomatica, cached: true });
        return;
      }
    }

    const interrogatorioId = interrogatorio._id.toString();

    const [semaforizacion, analisis] = await Promise.all([
      AIService.generarSemaforizacion(interrogatorioId),
      AIService.analizarAnamnesisCompleta(interrogatorioId)
    ]);

    const estrategias = await AIService.generarEstrategiasTerapeuticas({
      pacienteId,
      interrogatorioId,
      hallazgos: analisis?.message || ''
    } as any);

    const recomendacionAutomatica = {
      semaforizacion,
      recomendacionesOTC: extraerOTC(estrategias),
      estiloVida: extraerEstiloVida(estrategias),
      estrategiasFuncionales: estrategias,
      llamadoAccion: 'Tu salud merece un enfoque integral. Agenda tu consulta con tu médico funcional y comienza tu camino hacia el bienestar.',
      generadoEn: new Date()
    };

    interrogatorio.recomendacionAutomatica = recomendacionAutomatica;
    await interrogatorio.save();

    res.json({ success: true, data: recomendacionAutomatica, cached: false });
  } catch (error: any) {
    console.error('[RecomendacionController] Error:', error);
    res.status(500).json({ mensaje: 'Error al generar la recomendación automática.' });
  }
};

function extraerOTC(estrategias: any[]): string[] {
  return estrategias
    .filter(e => e.categoria === 'Suplementación' || e.categoria === 'Nutrición')
    .flatMap(e => e.pasos || [])
    .slice(0, 4);
}

function extraerEstiloVida(estrategias: any[]): string[] {
  return estrategias
    .filter(e => ['Estilo de vida', 'Manejo del estrés', 'Movimiento', 'Sueño'].includes(e.categoria))
    .flatMap(e => e.pasos || [])
    .slice(0, 4);
}
