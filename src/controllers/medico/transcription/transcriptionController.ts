/**
 * Controlador REST para consultar transcripciones guardadas.
 * Solo lectura; la escritura se hace vía WebSocket durante el streaming.
 */

import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import mongoose from 'mongoose';
import TranscriptionSession from '../../../models/TranscriptionSession';
import TranscriptionSegment from '../../../models/TranscriptionSegment';

/**
 * GET /medico/transcription/cita/:citaId
 * Devuelve la sesión de transcripción activa o cerrada para la cita y sus segmentos ordenados.
 */
export const getTranscriptionByCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;
    if (!medicoId || !citaId || !mongoose.Types.ObjectId.isValid(citaId)) {
      res.status(400).json({ success: false, message: 'citaId inválido' });
      return;
    }

    const session = await TranscriptionSession.findOne({
      citaId: new mongoose.Types.ObjectId(citaId),
      medicoId: new mongoose.Types.ObjectId(medicoId)
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!session) {
      res.status(200).json({ success: true, session: null, segments: [] });
      return;
    }

    const segments = await TranscriptionSegment.find({ sessionId: session._id })
      .sort({ sequence: 1, timestamp: 1 })
      .lean();

    res.status(200).json({
      success: true,
      session: {
        _id: session._id,
        citaId: session.citaId,
        medicoId: session.medicoId,
        pacienteId: session.pacienteId,
        status: session.status,
        currentClinicalSection: session.currentClinicalSection,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      },
      segments: segments.map((s) => ({
        _id: s._id,
        text: s.text,
        speakerRole: s.speakerRole,
        clinicalSection: s.clinicalSection,
        sequence: s.sequence,
        isPartial: s.isPartial,
        timestamp: s.timestamp,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs
      }))
    });
  } catch (err) {
    console.error('[getTranscriptionByCita]', err);
    res.status(500).json({ success: false, message: 'Error al obtener la transcripción' });
  }
};
