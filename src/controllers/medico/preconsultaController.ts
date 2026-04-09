import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Cita from '../../models/Cita';
import Interrogatorio from '../../models/Interrogatorio';
import mongoose from 'mongoose';

/**
 * A7 — Análisis Preconsulta IA para el médico.
 * Carga el interrogatorio del paciente de una cita específica
 * y retorna el resumen clínico para preparar la consulta.
 */
export const obtenerPreconsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;

    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    // 1. Verificar que la cita pertenece al médico (mismo patrón que obtenerRecordingUrl)
    const cita = await Cita.findOne({
      _id: new mongoose.Types.ObjectId(citaId as string),
      medicoId: new mongoose.Types.ObjectId(medicoId)
    }).lean();

    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    const pacienteId = cita.pacienteId?.toString();

    // 2. Obtener el interrogatorio más reciente del paciente
    const interrogatorio = await Interrogatorio.findOne({ pacienteId })
      .sort({ createdAt: -1 })
      .lean();

    if (!interrogatorio) {
      res.json({
        success: true,
        data: {
          tienePreconsulta: false,
          mensaje: 'El paciente aún no ha completado el interrogatorio de anamnesis.',
          cita
        }
      });
      return;
    }

    // 3. Usar la semaforización persistida (si existe)
    const semaforizacion = (interrogatorio as any).analisisFisiologicoIA || [];
    const incoherencias = (interrogatorio as any).observacionesIA || [];

    // 4. Componer respuesta clínica para el médico
    res.json({
      success: true,
      data: {
        tienePreconsulta: true,
        pacienteId,
        interrogatorio: {
          _id: interrogatorio._id,
          estado: (interrogatorio as any).estado,
          progreso: (interrogatorio as any).progreso ?? 0,
          respuestas: (interrogatorio as any).respuestas ?? [],
          analisisIA: (interrogatorio as any).analisisIA ?? null,
          objetivos: (interrogatorio as any).objetivos ?? [],
          observacionesIA: incoherencias,
          analisisFisiologicoIA: semaforizacion,
          createdAt: (interrogatorio as any).createdAt
        },
        cita
      }
    });
  } catch (error: any) {
    console.error('Error en preconsulta IA:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar el análisis de preconsulta',
      error: error.message
    });
  }
};
