import { Response } from 'express';
import mongoose from 'mongoose';
import Paraclinico from '../../models/Paraclinico';
import { AuthRequest } from '../../middleware/auth';

/**
 * GET /api/medico/paraclinicos/:pacienteId
 * Médico obtiene la lista de paraclínicos de un paciente.
 */
export const obtenerParaclinicosPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pacienteId } = req.params;
    if (!mongoose.isValidObjectId(pacienteId)) {
      res.status(400).json({ mensaje: 'ID de paciente inválido.' });
      return;
    }

    const docs = await Paraclinico.find({ pacienteId })
      .sort({ fecha: -1 })
      .select('nombre tipo tipoDocumento fecha semaforo tendencia analisisIA valorFuncional revisadoPorMedico ocrEstado ocrValores notasPaciente tamañoBytes urlArchivo notasHistorial')
      .lean();

    res.json({ success: true, data: docs });
  } catch (err: any) {
    console.error('[medico/paraclinicos] obtener:', err);
    res.status(500).json({ mensaje: 'Error al obtener paraclínicos del paciente.' });
  }
};

/**
 * GET /api/medico/paraclinicos/:pacienteId/analisis-evolutivo
 * Médico obtiene el análisis evolutivo IA del paciente.
 * Reutiliza la lógica del endpoint paciente pero sin ejecutar nueva IA
 * (lee lo ya persistido en semaforo/tendencia/analisisIA).
 */
export const obtenerAnalisisEvolutivoPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pacienteId } = req.params;
    if (!mongoose.isValidObjectId(pacienteId)) {
      res.status(400).json({ mensaje: 'ID de paciente inválido.' });
      return;
    }

    const docs = await Paraclinico.find({ pacienteId })
      .sort({ fecha: 1 })
      .lean();

    if (docs.length === 0) {
      res.json({ success: true, lineaTemporal: [], tendencias: [], semaforoPorExamen: {}, totalDocumentos: 0 });
      return;
    }

    // Construir línea temporal desde datos ya persistidos
    const lineaTemporal = docs
      .filter(d => d.semaforo || d.analisisIA)
      .map(d => ({
        fecha: d.fecha?.toISOString().substring(0, 10) ?? '',
        examen: d.nombre,
        hallazgo: d.analisisIA ?? '',
        semaforo: d.semaforo ?? 'amarillo',
        tendencia: d.tendencia ?? 'estable',
        valorFuncional: d.valorFuncional ?? '',
        ocrValores: d.ocrValores ?? [],
      }));

    // Si no hay análisis IA persistido aún, invocar análisis
    if (lineaTemporal.length === 0 && docs.length > 0) {
      const { AIService } = await import('../../services/ai/AIService');
      const analisis = await AIService.analizarParaclinicos({ pacienteId: pacienteId as string });
      res.json({
        success: true,
        lineaTemporal: analisis.lineaTemporal ?? [],
        tendencias: [],
        semaforoPorExamen: Object.fromEntries((analisis.lineaTemporal ?? []).map((i: any) => [i.examen, i.semaforo])),
        correlacionAnamnesis: analisis.correlacionAnamnesis ?? [],
        totalDocumentos: docs.length,
        analisisGenerado: true,
      });
      return;
    }

    const semaforoPorExamen: Record<string, string> = {};
    const tendenciasPorExamen: Record<string, string> = {};
    for (const item of lineaTemporal) {
      semaforoPorExamen[item.examen] = item.semaforo;
      tendenciasPorExamen[item.examen] = item.tendencia;
    }

    res.json({
      success: true,
      lineaTemporal,
      tendencias: Object.entries(tendenciasPorExamen).map(([examen, tendencia]) => ({ examen, tendencia })),
      semaforoPorExamen,
      totalDocumentos: docs.length,
    });
  } catch (err: any) {
    console.error('[medico/paraclinicos] analisis-evolutivo:', err);
    res.status(500).json({ mensaje: 'Error al obtener análisis evolutivo.' });
  }
};

/**
 * PUT /api/medico/paraclinicos/:paraclinicoId/semaforo
 * Médico ajusta el semáforo de un paraclínico (override clínico).
 * Body: { semaforo: 'verde'|'amarillo'|'rojo', notaMedico?: string }
 */
export const actualizarSemaforoParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paraclinicoId } = req.params;
    const { semaforo, notaMedico } = req.body as { semaforo: string; notaMedico?: string };

    if (!['verde', 'amarillo', 'rojo'].includes(semaforo)) {
      res.status(400).json({ mensaje: 'Semáforo inválido. Use: verde, amarillo o rojo.' });
      return;
    }
    if (!mongoose.isValidObjectId(paraclinicoId)) {
      res.status(400).json({ mensaje: 'ID de paraclínico inválido.' });
      return;
    }

    const update: Record<string, any> = { semaforo, revisadoPorMedico: true };
    if (notaMedico?.trim()) update.analisisIA = notaMedico.trim();

    const doc = await Paraclinico.findByIdAndUpdate(paraclinicoId, { $set: update }, { new: true }).lean();
    if (!doc) {
      res.status(404).json({ mensaje: 'Paraclínico no encontrado.' });
      return;
    }

    res.json({ success: true, data: doc });
  } catch (err: any) {
    console.error('[medico/paraclinicos] semaforo:', err);
    res.status(500).json({ mensaje: 'Error al actualizar semáforo.' });
  }
};

/**
 * PUT /api/medico/paraclinicos/:paraclinicoId/marcar-revisado
 * Médico marca el paraclínico como revisado sin cambiar el semáforo.
 */
export const marcarParaclinicoRevisado = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paraclinicoId } = req.params;
    if (!mongoose.isValidObjectId(paraclinicoId)) {
      res.status(400).json({ mensaje: 'ID inválido.' });
      return;
    }

    const doc = await Paraclinico.findByIdAndUpdate(
      paraclinicoId,
      { $set: { revisadoPorMedico: true } },
      { new: true }
    ).lean();

    if (!doc) { res.status(404).json({ mensaje: 'No encontrado.' }); return; }
    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error al marcar como revisado.' });
  }
};

/**
 * PUT /api/medico/paraclinicos/:paraclinicoId/quitar-revisado
 * Médico desmarca el paraclínico como revisado.
 */
export const quitarRevisadoParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paraclinicoId } = req.params;
    if (!mongoose.isValidObjectId(paraclinicoId)) {
      res.status(400).json({ mensaje: 'ID inválido.' });
      return;
    }
    const doc = await Paraclinico.findByIdAndUpdate(
      paraclinicoId,
      { $set: { revisadoPorMedico: false } },
      { new: true }
    ).lean();
    if (!doc) { res.status(404).json({ mensaje: 'No encontrado.' }); return; }
    res.json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error al quitar revisión.' });
  }
};

/** PUT /api/medico/paraclinicos/:paraclinicoId/notas — agrega una nota al historial */
export const agregarNotaParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paraclinicoId } = req.params;
    const { notas } = req.body;
    if (!notas?.trim()) { res.status(400).json({ mensaje: 'El texto de la nota es requerido.' }); return; }
    const doc = await Paraclinico.findByIdAndUpdate(
      paraclinicoId,
      { $push: { notasHistorial: { texto: notas.trim(), creadoEn: new Date() } } },
      { new: true }
    ).select('notasHistorial').lean();
    if (!doc) { res.status(404).json({ mensaje: 'No encontrado.' }); return; }
    res.json({ success: true, data: { notasHistorial: (doc as any).notasHistorial } });
  } catch (err: any) { res.status(500).json({ mensaje: 'Error al agregar nota.' }); }
};

/** PUT /api/medico/paraclinicos/:paraclinicoId/notas/:notaId — edita una nota */
export const editarNotaParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paraclinicoId, notaId } = req.params;
    const { texto } = req.body;
    if (!texto?.trim()) { res.status(400).json({ mensaje: 'El texto es requerido.' }); return; }
    const doc = await Paraclinico.findOneAndUpdate(
      { _id: paraclinicoId, 'notasHistorial._id': notaId },
      { $set: { 'notasHistorial.$.texto': texto.trim() } },
      { new: true }
    ).select('notasHistorial').lean();
    if (!doc) { res.status(404).json({ mensaje: 'Nota no encontrada.' }); return; }
    res.json({ success: true, data: { notasHistorial: (doc as any).notasHistorial } });
  } catch (err: any) { res.status(500).json({ mensaje: 'Error al editar nota.' }); }
};

/** DELETE /api/medico/paraclinicos/:paraclinicoId/notas/:notaId — elimina una nota */
export const eliminarNotaParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paraclinicoId, notaId } = req.params;
    const doc = await Paraclinico.findByIdAndUpdate(
      paraclinicoId,
      { $pull: { notasHistorial: { _id: notaId } } },
      { new: true }
    ).select('notasHistorial').lean();
    if (!doc) { res.status(404).json({ mensaje: 'No encontrado.' }); return; }
    res.json({ success: true, data: { notasHistorial: (doc as any).notasHistorial } });
  } catch (err: any) { res.status(500).json({ mensaje: 'Error al eliminar nota.' }); }
};
