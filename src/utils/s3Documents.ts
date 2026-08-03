import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Bucket para documentos (PDFs, historias, fórmulas, etc.).
 * No usar el bucket de grabaciones aquí: define AWS_S3_DOCUMENTS_BUCKET para el bucket de documentos
 * y AWS_CHIME_S3_RECORDING_BUCKET_ARN para un bucket solo de grabaciones.
 */
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

/** Cliente S3 para el bucket de grabaciones (Chime). Usar misma región que el bucket para evitar 301. */
const recordingRegion = process.env.AWS_CHIME_S3_RECORDING_REGION || process.env.AWS_REGION || 'us-east-1';
const recordingS3Client = new S3Client({
  region: recordingRegion,
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
  return uploadBinary(buffer, key, 'application/pdf');
}

/**
 * Sube un archivo binario al bucket de documentos con el Content-Type indicado.
 */
export async function uploadBinary(buffer: Buffer, key: string, contentType: string): Promise<string> {
  if (!BUCKET) {
    throw new Error('AWS_S3_DOCUMENTS_BUCKET o AWS_CHIME_S3_BUCKET_ARN no configurado');
  }
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream'
  }));
  return key;
}

/**
 * Clave S3 para paraclínicos: pacientes/{numeroDocumento}/paraclinicos/{timestamp}-{nombreSanitizado}
 */
export function buildParaclinicoKey(numeroDocumentoPaciente: string, originalName: string, contentType: string): string {
  const sanitizedDoc = String(numeroDocumentoPaciente || '')
    .replace(/[/\\]/g, '-')
    .trim() || 'sin-documento';
  const ts = Date.now();
  let base = String(originalName || 'archivo')
    .replace(/[/\\]/g, '-')
    .replace(/[^\w.\-() áéíóúñÁÉÍÓÚÑ]/gi, '_')
    .trim()
    .slice(0, 120);
  const extFromMime = (mime: string): string => {
    if (mime === 'application/pdf') return '.pdf';
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    return '';
  };
  const ext = extFromMime(contentType);
  if (ext && !base.toLowerCase().endsWith(ext)) {
    base += ext;
  }
  return `pacientes/${sanitizedDoc}/paraclinicos/${ts}-${base}`;
}

/**
 * Clave S3 para fotos de evaluación de alimentos (Lambda / análisis).
 * pacientes/{numeroDocumento}/evaluacion-alimentos/{timestamp}-{nombre}
 */
export function buildAlimentoEvaluacionKey(
  numeroDocumentoPaciente: string,
  originalName: string,
  contentType: string
): string {
  const sanitizedDoc = String(numeroDocumentoPaciente || '')
    .replace(/[/\\]/g, '-')
    .trim() || 'sin-documento';
  const ts = Date.now();
  let base = String(originalName || 'plato')
    .replace(/[/\\]/g, '-')
    .replace(/[^\w.\-() áéíóúñÁÉÍÓÚÑ]/gi, '_')
    .trim()
    .slice(0, 120);
  const extFromMime = (mime: string): string => {
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    return '';
  };
  const ext = extFromMime(contentType);
  if (ext && !base.toLowerCase().endsWith(ext)) {
    base += ext;
  }
  return `pacientes/${sanitizedDoc}/evaluacion-alimentos/${ts}-${base}`;
}

/**
 * Prefijo S3 esperado para validar que una clave pertenece al paciente (misma lógica que al subir).
 */
export function prefixAlimentoEvaluacionParaPaciente(numeroDocumentoOPacienteId: string): string {
  const sanitizedDoc = String(numeroDocumentoOPacienteId || '')
    .replace(/[/\\]/g, '-')
    .trim() || 'sin-documento';
  return `pacientes/${sanitizedDoc}/evaluacion-alimentos/`;
}

/**
 * Genera una URL firmada para descargar un documento (válida 7 días).
 * unhoistableHeaders evita que x-amz-checksum-mode aparezca en la URL,
 * lo que causaba 403 cuando el navegador cargaba la imagen directamente.
 */
export async function getDocumentUrl(s3Key: string): Promise<string> {
  if (!BUCKET) {
    throw new Error('AWS_S3_DOCUMENTS_BUCKET o AWS_CHIME_S3_BUCKET_ARN no configurado');
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3Client, command, {
    expiresIn: 604800,
    unhoistableHeaders: new Set(['x-amz-checksum-mode']),
  });
}

/**
 * Sube un PDF y devuelve URL firmada directamente (para guardar en BD como pdfUrl).
 * key = ruta completa S3 (usa buildCitaDocumentKey para generarla).
 */
export async function uploadPDFAndGetUrl(buffer: Buffer, key: string): Promise<string> {
  const s3Key = await uploadPDF(buffer, key);
  return getDocumentUrl(s3Key);
}

export async function uploadBinaryAndGetUrl(buffer: Buffer, key: string, contentType: string): Promise<string> {
  const s3Key = await uploadBinary(buffer, key, contentType);
  return getDocumentUrl(s3Key);
}

/**
 * Construye la URL pública permanente de un objeto S3.
 * Solo usar para prefijos con acceso público habilitado (ej. evaluacion-alimentos/).
 */
export function getPublicObjectUrl(s3Key: string): string {
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;
}

export async function uploadBinaryAndGetPublicUrl(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await uploadBinary(buffer, key, contentType);
  return getPublicObjectUrl(key);
}

/**
 * Descarga un objeto de S3 al buffer en memoria (para mandárselo a un modelo
 * multimodal por ejemplo). NO usar para archivos grandes (>10MB).
 */
export async function getBinaryFromKey(s3Key: string): Promise<{ buffer: Buffer; contentType?: string }> {
  if (!BUCKET) {
    throw new Error('AWS_S3_DOCUMENTS_BUCKET o AWS_CHIME_S3_BUCKET_ARN no configurado');
  }
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  const resp = await s3Client.send(command);
  const body = resp.Body as any;
  if (!body) throw new Error('S3 devolvió un body vacío');
  // body es un stream readable; lo materializamos a Buffer
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { buffer: Buffer.concat(chunks), contentType: resp.ContentType };
}

/**
 * Parsea una URI S3 (ej. s3://bucket/prefix/pipelineId/) y devuelve bucket y prefijo de clave.
 */
export function parseS3Uri(s3Uri: string): { bucket: string; keyPrefix: string } | null {
  const trimmed = String(s3Uri || '').trim();
  const match = trimmed.match(/^s3:\/\/([^/]+)\/(.*)$/);
  if (!match) return null;
  const bucket = match[1];
  const keyPrefix = match[2] ? (match[2].endsWith('/') ? match[2] : `${match[2]}/`) : '';
  return { bucket, keyPrefix };
}

/**
 * Copia todos los objetos de un prefijo S3 a otro (mismo bucket).
 * Útil para mover grabaciones de grabaciones/<pipelineId>/ a grabaciones/<citaId>/.
 */
export async function copyS3PrefixToPrefix(
  bucket: string,
  sourcePrefix: string,
  destPrefix: string
): Promise<number> {
  const src = sourcePrefix.endsWith('/') ? sourcePrefix : `${sourcePrefix}/`;
  const dst = destPrefix.endsWith('/') ? destPrefix : `${destPrefix}/`;
  let count = 0;
  let continuationToken: string | undefined;
  do {
    const list = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: src,
      MaxKeys: 1000,
      ContinuationToken: continuationToken
    }));
    const contents = list.Contents || [];
    for (const obj of contents) {
      if (!obj.Key || obj.Key.endsWith('/')) continue;
      const relativeKey = obj.Key.slice(src.length);
      const destKey = dst + relativeKey;
      await s3Client.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${obj.Key}`,
        Key: destKey
      }));
      count++;
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return count;
}

function findFirstMediaKey(contents: { Key?: string }[]): string | null {
  const mediaExt = /\.(mp4|mkv|webm)$/i;
  const composited = contents.find((c) => c.Key && c.Key.includes('composited-video') && mediaExt.test(c.Key));
  const firstMedia = composited || contents.find((c) => c.Key && mediaExt.test(c.Key));
  const fallback = contents.find((c) => c.Key && !(c.Key.endsWith('/')));
  return (firstMedia?.Key ?? fallback?.Key) ?? null;
}

/** Lista todos los objetos bajo un prefijo (con paginación). Usa el cliente de grabaciones. */
async function listAllRecordingKeys(bucket: string, prefix: string): Promise<{ Key?: string }[]> {
  const all: { Key?: string }[] = [];
  let continuationToken: string | undefined;
  do {
    const list = await recordingS3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
      ContinuationToken: continuationToken
    }));
    const contents = list.Contents || [];
    all.push(...contents);
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return all;
}

/**
 * Obtiene una URL firmada para reproducir la grabación de una videoconsulta (Chime).
 * Ruta en BD: s3://bucket/pipelineId/ (Chime escribe en bucket/pipelineId/composited-video/...).
 * Usa cliente S3 en región de grabaciones (AWS_CHIME_S3_RECORDING_REGION o AWS_REGION).
 * Válida 7 días.
 */
export async function getRecordingPlaybackUrl(grabacionUrl: string): Promise<string | null> {
  const parsed = parseS3Uri(grabacionUrl);
  if (!parsed || !parsed.keyPrefix) return null;
  const { bucket, keyPrefix } = parsed;
  const prefix = keyPrefix.endsWith('/') ? keyPrefix : `${keyPrefix}/`;

  // 1) Listar todo bajo pipelineId/
  let contents = await listAllRecordingKeys(bucket, prefix);
  let key = findFirstMediaKey(contents);

  // 2) Si no hay video en la raíz, intentar explícitamente composited-video/ (estructura Chime)
  if (!key) {
    const compositedPrefix = `${prefix}composited-video/`;
    contents = await listAllRecordingKeys(bucket, compositedPrefix);
    key = findFirstMediaKey(contents);
  }

  if (!key) {
    console.warn('[getRecordingPlaybackUrl] No se encontraron archivos de video en S3', {
      bucket,
      prefix,
      grabacionUrl: grabacionUrl.substring(0, 80) + '...'
    });
    return null;
  }

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(recordingS3Client, command, { expiresIn: 604800 }); // 7 días
}
