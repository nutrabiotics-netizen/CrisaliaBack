import { ChimeSDKMeetingsClient } from '@aws-sdk/client-chime-sdk-meetings';
import { ChimeSDKMediaPipelinesClient } from '@aws-sdk/client-chime-sdk-media-pipelines';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';

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

export const bedrockClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

/**
 * Bucket para grabaciones de videoconsultas (Chime).
 * Definir en .env: AWS_CHIME_S3_RECORDING_BUCKET_ARN=arn:aws:s3:::tu-bucket
 * Chime escribe en bucket/<pipelineId>/ (sin subcarpetas extra).
 */
const recordingBucketArn = (process.env.AWS_CHIME_S3_RECORDING_BUCKET_ARN || '').trim();

export const videoCallConfig = {
  defaultRegion: process.env.AWS_REGION || 'us-east-1',
  s3BucketArn: recordingBucketArn,
  s3SinkArn: recordingBucketArn,
  maxMeetingDurationMinutes: 120,
  autoStartRecording: !!recordingBucketArn,
  autoStartTranscription: false,
  // Sin fallback hardcodeado: si BEDROCK_AGENT_ID no está seteado en .env, deja
  // string vacío y el SDK falla con un error claro en vez de pegarle a un
  // agente que ya no existe en otra cuenta.
  bedrockAgentId: (process.env.BEDROCK_AGENT_ID || '').trim(),
  bedrockAgentAliasId: (process.env.BEDROCK_AGENT_ALIAS_ID || '').trim()
};
