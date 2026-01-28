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

export const videoCallConfig = {
  defaultRegion: process.env.AWS_REGION || 'us-east-1',
  s3BucketArn: process.env.AWS_CHIME_S3_BUCKET_ARN || '',
  maxMeetingDurationMinutes: 120,
  autoStartRecording: !!process.env.AWS_CHIME_S3_BUCKET_ARN,
  autoStartTranscription: false
};
