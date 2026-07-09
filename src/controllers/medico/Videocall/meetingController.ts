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
  DeleteMediaCapturePipelineCommand,
  GetMediaCapturePipelineCommand
} from '@aws-sdk/client-chime-sdk-media-pipelines';
import Cita from '../../../models/Cita';
import Meeting from '../../../models/Meeting';

/** Construye la ruta S3 de la grabación a partir del SinkArn devuelto por Chime y el pipelineId. */
function buildRecordingPathFromSinkArn(sinkArn: string | undefined, pipelineId: string | undefined): string | null {
  if (!pipelineId || !sinkArn) return null;
  const afterBucket = sinkArn.replace(/^arn:aws:s3:::/, '').trim();
  const [bucket, ...prefixParts] = afterBucket.split('/').filter(Boolean);
  const prefix = prefixParts.length ? prefixParts.join('/') : '';
  return prefix ? `${bucket}/${prefix}/${pipelineId}` : `${bucket}/${pipelineId}`;
}

/** Extrae el nombre del bucket del SinkArn (donde Chime realmente escribió). */
function getBucketFromSinkArn(sinkArn: string | undefined): string | null {
  if (!sinkArn) return null;
  const after = sinkArn.replace(/^arn:aws:s3:::/, '').trim();
  const bucket = after.split('/').filter(Boolean)[0];
  return bucket || null;
}

/**
 * Debug: verificar configuración AWS (solo médico)
 */
export const debugAWSConfig = async (_req: AuthRequest, res: Response) => {
  try {
    const config = {
      region: process.env.AWS_REGION || 'us-east-1',
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasS3RecordingBucket: !!videoCallConfig.s3BucketArn,
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
    const { externalMeetingId, citaId, isGuided } = req.body;
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

    // Upsert: si ya existe un meeting activo para este externalMeetingId, devolver el existente
    const extId = externalMeetingId || `Meeting-Crisalia-${Date.now()}`;
    if (externalMeetingId) {
      const existing = await Meeting.findOne({
        externalMeetingId: extId,
        status: { $in: ['created', 'active'] }
      }).lean();
      if (existing) {
        console.log('[createMeeting] Meeting existente encontrado para', extId);
        return res.status(200).json({ success: true, meeting: existing });
      }
    }

    const createMeetingCommand = new CreateMeetingCommand({
      ClientRequestToken: Date.now().toString(),
      MediaRegion: videoCallConfig.defaultRegion,
      ExternalMeetingId: extId
    });
    const meetingResponse = await chimeClient.send(createMeetingCommand);

    const meeting = new Meeting({
      meetingId: meetingResponse.Meeting!.MeetingId!,
      externalMeetingId: meetingResponse.Meeting!.ExternalMeetingId,
      citaId: citaId || undefined,
      meetingData: meetingResponse.Meeting as unknown as Record<string, unknown>,
      transcriptionEnabled: videoCallConfig.autoStartTranscription,
      isGuided: !!isGuided
    });

    let pipelineId: string | null = null;
    // Grabación S3: requiere bucket con política para Chime (ver CHIME_S3_BUCKET_POLICY.md).
    const sinkArnFirst = videoCallConfig.s3SinkArn || videoCallConfig.s3BucketArn;
    const bucketArnOnly = videoCallConfig.s3BucketArn;
    if (videoCallConfig.autoStartRecording && bucketArnOnly) {
      const tryCreatePipeline = async (sinkArn: string) => {
        return chimeMediaClient.send(
          new CreateMediaCapturePipelineCommand({
            SourceType: 'ChimeSdkMeeting',
            SourceArn: meetingResponse.Meeting!.MeetingArn!,
            SinkType: 'S3Bucket',
            SinkArn: sinkArn,
            ChimeSdkMeetingConfiguration: {
              ArtifactsConfiguration: {
                Audio: { MuxType: 'AudioWithCompositedVideo' },
                Video: { State: 'Disabled', MuxType: 'VideoOnly' },
                Content: { State: 'Disabled', MuxType: 'ContentOnly' },
                CompositedVideo: {
                  Layout: 'GridView',
                  Resolution: 'HD',
                  GridViewConfiguration: {
                    ContentShareLayout: 'ActiveSpeakerOnly',
                    ActiveSpeakerOnlyConfiguration: { ActiveSpeakerPosition: 'TopLeft' }
                  }
                }
              }
            }
          })
        );
      };
      try {
        console.log('🎥 Iniciando grabación de la reunión...');
        console.log('📦 S3 Sink ARN:', sinkArnFirst);
        console.log('🔗 Meeting ARN:', meetingResponse.Meeting!.MeetingArn!);
        let pipelineResponse: Awaited<ReturnType<typeof tryCreatePipeline>>;
        try {
          pipelineResponse = await tryCreatePipeline(sinkArnFirst);
        } catch (err: any) {
          if (sinkArnFirst !== bucketArnOnly && (err.name === 'BadRequestException' || err.Code === 'BadRequest')) {
            console.warn('⚠️ Prefijo S3 no aceptado por Chime, reintentando solo con bucket...');
            pipelineResponse = await tryCreatePipeline(bucketArnOnly);
          } else {
            throw err;
          }
        }
        pipelineId = pipelineResponse.MediaCapturePipeline?.MediaPipelineId ?? null;
        if (pipelineId) {
          meeting.pipelineId = pipelineId;
          const sinkArnReturned = pipelineResponse.MediaCapturePipeline?.SinkArn;
          if (sinkArnReturned) meeting.recordingSinkArn = sinkArnReturned;
          console.log('✅ Grabación iniciada correctamente. Pipeline ID:', pipelineId);
          console.log('📊 Estado del pipeline:', pipelineResponse.MediaCapturePipeline?.Status);
          console.log('📁 S3 URI:', sinkArnReturned);
        } else {
          console.warn('⚠️ No se recibió Pipeline ID del servicio de AWS Chime');
        }
      } catch (pipelineError: any) {
        console.error('❌ Error iniciando grabación:', pipelineError);
        console.error('📋 Detalles del error:', {
          name: pipelineError.name,
          message: pipelineError.message,
          code: pipelineError.Code,
          requestId: pipelineError.$metadata?.requestId
        });
        console.warn('⚠️ Continuando sin grabación. La reunión funcionará normalmente pero no se grabará.');
      }
    } else {
      if (!videoCallConfig.autoStartRecording) {
        console.log('ℹ️ Grabación automática deshabilitada en configuración');
      }
      if (!videoCallConfig.s3BucketArn) {
        console.warn('⚠️ AWS_CHIME_S3_RECORDING_BUCKET_ARN no configurado. No se puede iniciar grabación.');
      }
    }

    await meeting.save();

    if (citaId) {
      const citaPrev = await Cita.findById(citaId).select('estado').lean();
      const patch: { meetingId: string; estado?: string } = { meetingId: meeting.meetingId };
      // No revertir sala de espera ni consulta en curso al crear la reunión
      const est = citaPrev?.estado;
      if (est !== 'en_espera' && est !== 'en_consulta') {
        patch.estado = 'confirmada';
      }
      await Cita.findByIdAndUpdate(citaId, patch);
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
        recordingEnabled: !!pipelineId,
        isGuided: meeting.isGuided
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
        MeetingId: meetingId as string,
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

    // Consultar estado real del pipeline (si existe) para diagnosticar por qué no aparece nada en S3.
    let pipelineStatus: string | null = null;
    let pipelineSinkArn: string | null = null;
    let pipelineErrorMessage: string | null = null;
    if (meeting.pipelineId) {
      try {
        const pipelineResp = await chimeMediaClient.send(
          new GetMediaCapturePipelineCommand({ MediaPipelineId: meeting.pipelineId })
        );
        pipelineStatus = (pipelineResp.MediaCapturePipeline as any)?.Status ?? null;
        pipelineSinkArn = (pipelineResp.MediaCapturePipeline as any)?.SinkArn ?? null;
      } catch (e: unknown) {
        const err = e as any;
        pipelineErrorMessage = err?.message || 'No se pudo consultar el pipeline en AWS';
      }
    }

    let citaData: unknown = meeting.citaId;
    if (meeting.citaId) {
      const cita = await Cita.findById(meeting.citaId)
        .populate('pacienteId', 'nombre apellido email telefono numeroDocumento fechaNacimiento genero sexoBiologico estadoCivil direccion')
        .populate('medicoId', 'nombre apellido email especialidad')
        .lean();
      if (cita) citaData = cita;
    }

    const recordingPath =
      buildRecordingPathFromSinkArn(meeting.recordingSinkArn, meeting.pipelineId) ??
      (meeting.pipelineId && videoCallConfig.s3BucketArn
        ? (() => {
            const bucketName = (videoCallConfig.s3BucketArn || '').replace(/^arn:aws:s3:::/, '').split('/')[0].trim();
            return bucketName ? `${bucketName}/${meeting.pipelineId}` : null;
          })()
        : null);

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
        pipelineStatus,
        pipelineSinkArn,
        pipelineErrorMessage,
        recordingEnabled: !!meeting.pipelineId,
        recordingPath,
        grabacionUrl: meeting.grabacionUrl,
        duracionMinutos: meeting.duracionMinutos,
        isGuided: meeting.isGuided,
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
      await chimeClient.send(new DeleteMeetingCommand({ MeetingId: meetingId as string }));
    } catch {
      // AWS puede devolver error si ya está eliminada
    }

    if (meeting.pipelineId) {
      // Guardar solo la ruta donde Chime escribió: bucket/<pipelineId>/ (bucket desde .env, sin hardcodear)
      const pathFromSink = buildRecordingPathFromSinkArn(meeting.recordingSinkArn, meeting.pipelineId);
      const bucketName = getBucketFromSinkArn(meeting.recordingSinkArn)
        || (videoCallConfig.s3BucketArn || '').replace(/^arn:aws:s3:::/, '').split('/')[0].trim();
      const url = pathFromSink
        ? `s3://${pathFromSink}/`
        : bucketName
          ? `s3://${bucketName}/${meeting.pipelineId}/`
          : null;
      if (url) meeting.grabacionUrl = url;
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

    if (meeting.citaId && meeting.grabacionUrl) {
      await Cita.findByIdAndUpdate(meeting.citaId, { grabacionUrl: meeting.grabacionUrl });
    }

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
