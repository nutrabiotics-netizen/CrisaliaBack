import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.AWS_S3_DOCUMENTS_BUCKET || (() => {
  const arn = process.env.AWS_CHIME_S3_BUCKET_ARN || '';
  const match = arn.match(/arn:aws:s3:::([^/]+)/);
  return match ? match[1] : '';
})();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined
});

/**
 * Construye la clave S3 para un documento de cita:
 * pacientes/{numeroDocumento}/citas/{citaId}/{nombreArchivo}.pdf
 * Sanitiza numeroDocumento para evitar barras en la ruta.
 */
export function buildCitaDocumentKey(
  numeroDocumentoPaciente: string,
  citaId: string,
  nombreArchivo: string
): string {
  const sanitized = String(numeroDocumentoPaciente || '')
    .replace(/[/\\]/g, '-')
    .trim() || 'sin-documento';
  const base = nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`;
  return `pacientes/${sanitized}/citas/${citaId}/${base}`;
}

/**
 * Sube un PDF a S3 y devuelve la clave (ruta completa).
 * key = ruta completa, ej: pacientes/123/citas/abc/historia-clinica.pdf
 */
export async function uploadPDF(buffer: Buffer, key: string): Promise<string> {
  if (!BUCKET) {
    throw new Error('AWS_S3_DOCUMENTS_BUCKET o AWS_CHIME_S3_BUCKET_ARN no configurado');
  }
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf'
  }));
  return key;
}

/**
 * Genera una URL firmada para descargar un documento (válida 7 días).
 */
export async function getDocumentUrl(s3Key: string): Promise<string> {
  if (!BUCKET) {
    throw new Error('AWS_S3_DOCUMENTS_BUCKET o AWS_CHIME_S3_BUCKET_ARN no configurado');
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3Client, command, { expiresIn: 604800 }); // 7 días
}

/**
 * Sube un PDF y devuelve URL firmada directamente (para guardar en BD como pdfUrl).
 * key = ruta completa S3 (usa buildCitaDocumentKey para generarla).
 */
export async function uploadPDFAndGetUrl(buffer: Buffer, key: string): Promise<string> {
  const s3Key = await uploadPDF(buffer, key);
  return getDocumentUrl(s3Key);
}
