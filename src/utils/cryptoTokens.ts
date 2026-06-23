import crypto from 'crypto';

/**
 * Cifrado simétrico AES-256-GCM para tokens OAuth de terceros (wearables).
 * La key viene de `process.env.WEARABLES_ENC_KEY` (32 bytes en hex).
 *
 * Formato del ciphertext: base64(`iv | authTag | ciphertext`)
 *   - iv:        12 bytes
 *   - authTag:   16 bytes
 *   - ciphertext: N bytes
 */

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.WEARABLES_ENC_KEY;
  if (!raw) {
    throw new Error(
      'WEARABLES_ENC_KEY no configurada. Genera una con: ' +
      'node -e "console.log(require(\\\"crypto\\\").randomBytes(32).toString(\\\"hex\\\"))"'
    );
  }
  // 64 hex chars = 32 bytes
  if (raw.length !== 64) {
    throw new Error('WEARABLES_ENC_KEY debe ser 32 bytes en hex (64 caracteres)');
  }
  return Buffer.from(raw, 'hex');
}

export function encryptToken(plain: string): string {
  if (!plain) return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(enc: string): string {
  if (!enc) return '';
  const key = getKey();
  const buf = Buffer.from(enc, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}
