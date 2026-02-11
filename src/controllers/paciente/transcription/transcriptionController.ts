/**
 * Controlador REST para que el paciente consulte transcripciones de sus citas.
 */

import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import mongoose from 'mongoose';
import TranscriptionSession from '../../../models/TranscriptionSession';
import TranscriptionSegment from '../../../models/TranscriptionSegment';

/**
 * GET /paciente/transcription/cita/:citaId
 * Devuelve la transcripción de la cita si el paciente es el titular.
 */
export const getTranscriptionByCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId || !citaId || !mongoose.Types.ObjectId.isValid(citaId)) {
      res.status(400).json({ success: false, message: 'citaId inválido' });
      return;
    }

    const session = await TranscriptionSession.findOne({
      citaId: new mongoose.Types.ObjectId(citaId),
      pacienteId: new mongoose.Types.ObjectId(pacienteId)
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
        status: session.status,
        currentClinicalSection: session.currentClinicalSection,
        startedAt: session.startedAt,
        endedAt: session.endedAt
      },
      segments: segments.map((s) => ({
        _id: s._id,
        text: s.text,
        speakerRole: s.speakerRole,
        clinicalSection: s.clinicalSection,
        sequence: s.sequence,
        timestamp: s.timestamp
      }))
    });
  } catch (err) {
    console.error('[getTranscriptionByCita paciente]', err);
    res.status(500).json({ success: false, message: 'Error al obtener la transcripción' });
  }
};
