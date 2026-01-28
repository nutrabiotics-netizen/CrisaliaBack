import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { chimeClient, chimeMediaClient, videoCallConfig } from '../../../config/awsConfig';
import {
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand
} from '@aws-sdk/client-chime-sdk-meetings';
import {
  CreateMediaCapturePipelineCommand,
  DeleteMediaCapturePipelineCommand
} from '@aws-sdk/client-chime-sdk-media-pipelines';
import Cita from '../../../models/Cita';
import Meeting from '../../../models/Meeting';

/**
 * Debug: verificar configuración AWS (solo médico)
 */
export const debugAWSConfig = async (_req: AuthRequest, res: Response) => {
  try {
    const config = {
      region: process.env.AWS_REGION || 'us-east-1',
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasS3Bucket: !!process.env.AWS_CHIME_S3_BUCKET_ARN,
      videoCallConfig
    };
    return res.json({ success: true, config });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error verificando configuración AWS:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Crear reunión de videoconsulta (solo médico)
 */
export const createMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { externalMeetingId, citaId } = req.body;
    const medicoId = req.userId;
    if (!medicoId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    if (citaId) {
      const cita = await Cita.findById(citaId);
      if (!cita) {
        return res.status(404).json({ success: false, error: 'Cita no encontrada' });
      }
      if (cita.medicoId?.toString() !== medicoId) {
        return res.status(403).json({ success: false, error: 'No tiene permiso sobre esta cita' });
      }
      if (cita.modalidad !== 'virtual') {
        return res.status(400).json({
          success: false,
          error: 'Solo se pueden crear videoconsultas para citas virtuales'
        });
      }
    }

    const createMeetingCommand = new CreateMeetingCommand({
      ClientRequestToken: Date.now().toString(),
      MediaRegion: videoCallConfig.defaultRegion,
      ExternalMeetingId: externalMeetingId || `Meeting-Crisalia-${Date.now()}`
    });
    const meetingResponse = await chimeClient.send(createMeetingCommand);

    const meeting = new Meeting({
      meetingId: meetingResponse.Meeting!.MeetingId!,
      externalMeetingId: meetingResponse.Meeting!.ExternalMeetingId,
      citaId: citaId || undefined,
      meetingData: meetingResponse.Meeting as unknown as Record<string, unknown>,
      transcriptionEnabled: videoCallConfig.autoStartTranscription
    });

    let pipelineId: string | null = null;
    // Grabación S3: requiere bucket con política para Chime (ver CHIME_S3_BUCKET_POLICY.md).
    if (videoCallConfig.autoStartRecording && videoCallConfig.s3BucketArn) {
      try {
        const mediaPipelineCommand = new CreateMediaCapturePipelineCommand({
          SourceType: 'ChimeSdkMeeting',
          SourceArn: meetingResponse.Meeting!.MeetingArn!,
          SinkType: 'S3Bucket',
          SinkArn: videoCallConfig.s3BucketArn
        });
        const pipelineResponse = await chimeMediaClient.send(mediaPipelineCommand);
        pipelineId = pipelineResponse.MediaCapturePipeline?.MediaPipelineId ?? null;
        if (pipelineId) meeting.pipelineId = pipelineId;
      } catch (pipelineError) {
        console.warn('Error iniciando grabación (continuando sin grabación):', pipelineError);
      }
    }

    await meeting.save();

    if (citaId) {
      await Cita.findByIdAndUpdate(citaId, {
        meetingId: meeting.meetingId,
        estado: 'confirmada'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Reunión creada exitosamente',
      meeting: {
        meetingId: meeting.meetingId,
        externalMeetingId: meeting.externalMeetingId,
        meetingData: meeting.meetingData,
        citaId: meeting.citaId,
        status: meeting.status,
        transcriptionEnabled: meeting.transcriptionEnabled,
        recordingEnabled: !!pipelineId
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error creando reunión:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: err.message });
  }
};

/**
 * Crear attendee para una reunión (médico o paciente)
 */
export const createAttendee = async (req: AuthRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    const { externalUserId, role } = req.body;
    if (!req.userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Reunión no encontrada' });
    }

    if (meeting.status === 'ended' || meeting.status === 'expired') {
      return res.status(200).json({
        success: true,
        message: 'Reunión finalizada - Acceso en modo solo lectura',
        attendee: {
          AttendeeId: `ended-${Date.now()}`,
          ExternalUserId: externalUserId || `User-${Date.now()}`,
          JoinToken: 'ended-meeting-token'
        },
        meeting: {
          meetingId: meeting.meetingId,
          status: meeting.status,
          ended: true,
          message: 'Esta reunión ha finalizado. No hay grabación disponible.'
        }
      });
    }

    try {
      const createAttendeeCommand = new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: externalUserId || `User-${Date.now()}`
      });
      const attendeeResponse = await chimeClient.send(createAttendeeCommand);

      meeting.attendees.push({
        ...(attendeeResponse.Attendee as Record<string, unknown>),
        role: role || 'participant',
        joinedAt: new Date()
      } as Record<string, unknown> & { joinedAt: Date });
      if (meeting.status === 'created') meeting.status = 'active';
      await meeting.save();

      return res.status(201).json({
        success: true,
        message: 'Attendee creado exitosamente',
        attendee: attendeeResponse.Attendee,
        meeting: { meetingId: meeting.meetingId, status: meeting.status }
      });
    } catch (awsError: unknown) {
      const awsErr = awsError as { name?: string; message?: string };
      if (awsErr.name === 'NotFoundException' || awsErr.message?.includes('not found')) {
        meeting.status = 'ended';
        await meeting.save();
        return res.status(200).json({
          success: true,
          message: 'Reunión finalizada - Acceso en modo solo lectura',
          attendee: {
            AttendeeId: `ended-${Date.now()}`,
            ExternalUserId: externalUserId || `User-${Date.now()}`,
            JoinToken: 'ended-meeting-token'
          },
          meeting: {
            meetingId: meeting.meetingId,
            status: 'ended',
            ended: true,
            message: 'Esta reunión ha finalizado. No hay grabación disponible.'
          }
        });
      }
      throw awsError;
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error creando attendee:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: err.message });
  }
};

/**
 * Obtener reunión por id (médico o paciente que participa)
 */
export const getMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    if (!req.userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Reunión no encontrada' });
    }

    let citaData: unknown = meeting.citaId;
    if (meeting.citaId) {
      const cita = await Cita.findById(meeting.citaId)
        .populate('pacienteId', 'nombre apellido email telefono numeroDocumento fechaNacimiento genero sexoBiologico estadoCivil direccion')
        .populate('medicoId', 'nombre apellido email especialidad')
        .lean();
      if (cita) citaData = cita;
    }

    return res.json({
      success: true,
      meeting: {
        meetingId: meeting.meetingId,
        externalMeetingId: meeting.externalMeetingId,
        citaId: citaData,
        meetingData: meeting.meetingData,
        attendees: meeting.attendees,
        status: meeting.status,
        transcriptionEnabled: meeting.transcriptionEnabled,
        pipelineId: meeting.pipelineId,
        grabacionUrl: meeting.grabacionUrl,
        duracionMinutos: meeting.duracionMinutos,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error obteniendo reunión:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: err.message });
  }
};

/**
 * Finalizar reunión (solo médico)
 */
export const endMeeting = async (req: AuthRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    const medicoId = req.userId;
    if (!medicoId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Reunión no encontrada' });
    }
    if (meeting.status === 'ended') {
      return res.status(400).json({ success: false, error: 'La reunión ya ha sido finalizada' });
    }

    try {
      await chimeClient.send(new DeleteMeetingCommand({ MeetingId: meetingId }));
    } catch {
      // AWS puede devolver error si ya está eliminada
    }

    if (meeting.pipelineId) {
      try {
        await chimeMediaClient.send(new DeleteMediaCapturePipelineCommand({ MediaPipelineId: meeting.pipelineId }));
      } catch {
        // ignorar
      }
    }

    const duracionMinutos = meeting.createdAt
      ? Math.round((Date.now() - meeting.createdAt.getTime()) / (1000 * 60))
      : undefined;
    meeting.status = 'ended';
    meeting.duracionMinutos = duracionMinutos;
    await meeting.save();

    return res.json({
      success: true,
      message: 'Reunión finalizada exitosamente',
      meeting: { meetingId: meeting.meetingId, status: meeting.status, duracionMinutos }
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error finalizando reunión:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: err.message });
  }
};

/**
 * Listar reuniones del médico
 */
export const listMeetings = async (req: AuthRequest, res: Response) => {
  try {
    const medicoId = req.userId;
    const { page = 1, limit = 10, status, citaId } = req.query;
    if (!medicoId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const filters: Record<string, unknown> = {};
    if (status) filters.status = status;
    const citasDelMedico = await Cita.find({ medicoId }).select('_id').lean();
    const citaIds = citasDelMedico.map((c) => c._id);
    if (citaId) {
      if (!citaIds.some((id) => id?.toString() === citaId)) {
        return res.json({ success: true, meetings: [], pagination: { currentPage: 1, totalPages: 0, totalMeetings: 0, hasNextPage: false, hasPrevPage: false } });
      }
      filters.citaId = citaId;
    } else {
      filters.citaId = { $in: citaIds };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const meetings = await Meeting.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();
    const total = await Meeting.countDocuments(filters);

    return res.json({
      success: true,
      meetings,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalMeetings: total,
        hasNextPage: skip + meetings.length < total,
        hasPrevPage: Number(page) > 1
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error listando reuniones:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor', error: err.message });
  }
};
