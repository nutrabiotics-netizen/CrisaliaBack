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
    if (!pacienteId || !citaId || !mongoose.Types.ObjectId.isValid(citaId as string)) {
      res.status(400).json({ success: false, message: 'citaId inválido' });
      return;
    }

    const session = await TranscriptionSession.findOne({
      citaId: new mongoose.Types.ObjectId(citaId as string),
      pacienteId: new mongoose.Types.ObjectId(pacienteId)
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!session) {
      res.status(200).json({ success: true, session: null, segments: [] });
      return;
    }

    // Orden por timestamp (instante real en que el ASR emitió el segmento) y como
    // desempate por startTimeMs/createdAt. NO usamos `sequence` porque se reinicia
    // cuando el médico reconecta el WS y mezcla segmentos viejos con nuevos.
    const segments = await TranscriptionSegment.find({ sessionId: session._id })
      .sort({ timestamp: 1, startTimeMs: 1, createdAt: 1 })
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
      segments: segments.map((s: any) => ({
        _id: s._id,
        text: s.text,
        speakerRole: s.speakerRole,
        clinicalSection: s.clinicalSection,
        sequence: s.sequence,
        timestamp: s.timestamp,
        isPartial: s.isPartial,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs
      }))
    });
  } catch (err) {
    console.error('[getTranscriptionByCita paciente]', err);
    res.status(500).json({ success: false, message: 'Error al obtener la transcripción' });
  }
};
