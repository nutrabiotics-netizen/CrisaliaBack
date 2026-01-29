import { ChimeSDKMeetingsClient } from '@aws-sdk/client-chime-sdk-meetings';
import { ChimeSDKMediaPipelinesClient } from '@aws-sdk/client-chime-sdk-media-pipelines';

export const chimeClient = new ChimeSDKMeetingsClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

export const chimeMediaClient = new ChimeSDKMediaPipelinesClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

/** Prefijo opcional en el bucket. Si se usa, Chime escribe en bucket/prefix/ SIN subcarpeta por pipelineId (todas las reuniones se mezclarían). Por eso por defecto está vacío: cada reunión queda en bucket/<pipelineId>/ */
const s3RecordingPrefix = (process.env.AWS_CHIME_S3_RECORDING_PREFIX || '').replace(/^\/+|\/+$/g, '');

export const videoCallConfig = {
  defaultRegion: process.env.AWS_REGION || 'us-east-1',
  s3BucketArn: process.env.AWS_CHIME_S3_BUCKET_ARN || '',
  /** Solo bucket (sin prefijo) para que Chime cree bucket/<pipelineId>/ y cada reunión tenga su carpeta */
  s3SinkArn: process.env.AWS_CHIME_S3_BUCKET_ARN || '',
  s3RecordingPrefix: s3RecordingPrefix || undefined,
  maxMeetingDurationMinutes: 120,
  autoStartRecording: !!process.env.AWS_CHIME_S3_BUCKET_ARN,
  autoStartTranscription: false
};
