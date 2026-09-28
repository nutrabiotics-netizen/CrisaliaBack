import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const VIDEOS_BUCKET = process.env.AWS_S3_VIDEOS_BUCKET || '';

const s3VideosClient = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined
});

// Genera una URL prefirmada válida por 1 hora para reproducir un video del bucket privado
export async function getVideoSignedUrl(videoKey: string): Promise<string> {
  if (!VIDEOS_BUCKET) {
    throw new Error('AWS_S3_VIDEOS_BUCKET no configurado');
  }
  const command = new GetObjectCommand({ Bucket: VIDEOS_BUCKET, Key: videoKey });
  return getSignedUrl(s3VideosClient, command, { expiresIn: 3600 });
}
