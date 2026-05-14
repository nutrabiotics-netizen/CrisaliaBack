/**
 * Servicio para envío de códigos de autenticación 2FA por WhatsApp.
 * Integración con API externa Mozart AI.
 *
 * Los códigos se persisten en Mongo (modelo Codigo2FA) con:
 *   - hash bcrypt del código (no se guarda en plano)
 *   - expiración automática vía TTL index
 *   - contador de intentos por código (anti-fuerza-bruta)
 */

import Codigo2FA, { hashCodigo, compararCodigo } from '../../models/Codigo2FA';

const WHATSAPP_AUTH_URL = 'https://whatsapp.mozartai.com.co/whatsapp/auth/codigo-login';
const CODIGO_EXPIRA_MINUTOS = 4;
const MAX_INTENTOS_POR_CODIGO = 3;

/**
 * Normaliza el número de teléfono para uso interno (formato Colombia +57).
 */
export function normalizarTelefono(telefono: string): string {
  const limpio = telefono.replace(/\s+/g, '').replace(/^\+/, '');
  if (limpio.startsWith('57') && limpio.length >= 12) {
    return `+${limpio}`;
  }
  if (limpio.length <= 10) {
    return `+57${limpio}`;
  }
  return `+${limpio}`;
}

/**
 * Genera un código numérico de 4 dígitos.
 */
function generarCodigo(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Envía un código de login por WhatsApp al número indicado y lo persiste en Mongo.
 * Si ya existía un código vigente para ese teléfono, lo invalida antes de crear uno nuevo
 * (así un nuevo envío siempre deja exactamente UN código vigente).
 */
export async function envioCodigoWhatsApp(telefono: string): Promise<{ message: string }> {
  const formattedPhone = normalizarTelefono(telefono);
  const codigo = generarCodigo();

  // Invalidar códigos anteriores no usados para este teléfono.
  await Codigo2FA.updateMany(
    { telefono: formattedPhone, usado: false, expiresAt: { $gt: new Date() } },
    { $set: { usado: true } }
  );

  const response = await fetch(WHATSAPP_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ celular: formattedPhone, codigo })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[WhatsApp] API error:', response.status, errText);
    throw new Error('Error al enviar WhatsApp');
  }

  await Codigo2FA.create({
    telefono: formattedPhone,
    codigoHash: await hashCodigo(codigo),
    expiresAt: new Date(Date.now() + CODIGO_EXPIRA_MINUTOS * 60 * 1000)
  });

  return { message: 'Código enviado por WhatsApp' };
}

/**
 * Resultado detallado de la verificación. Útil para que el controller decida
 * si reenviar, mostrar "código incorrecto", "bloqueado por intentos", etc.
 */
export type ResultadoVerificacion =
  | { ok: true }
  | { ok: false; razon: 'sin_codigo' | 'expirado' | 'codigo_incorrecto' | 'bloqueado' };

/**
 * Verifica el código ingresado para un teléfono.
 *
 * Reglas:
 *  - Si no hay código vigente: { ok: false, razon: 'sin_codigo' }
 *  - Si el último ya expiró:    { ok: false, razon: 'expirado' }
 *  - Si excedió 3 intentos:     { ok: false, razon: 'bloqueado' }
 *  - Si el código es correcto:  { ok: true } y se marca usado.
 *  - Si es incorrecto:          { ok: false, razon: 'codigo_incorrecto' } e incrementa intentos.
 */
export async function verificarCodigoWhatsAppDetallado(
  telefono: string,
  codigoIngresado: string
): Promise<ResultadoVerificacion> {
  const formattedPhone = normalizarTelefono(telefono);

  // Tomar el más reciente, sin importar estado, para distinguir razones.
  const reciente = await Codigo2FA.findOne({ telefono: formattedPhone })
    .sort({ createdAt: -1 });

  if (!reciente) return { ok: false, razon: 'sin_codigo' };

  if (reciente.usado) return { ok: false, razon: 'sin_codigo' };

  if (reciente.expiresAt.getTime() < Date.now()) {
    return { ok: false, razon: 'expirado' };
  }

  if (reciente.intentos >= MAX_INTENTOS_POR_CODIGO) {
    // Marcar como usado para que el próximo envío sea limpio.
    reciente.usado = true;
    await reciente.save();
    return { ok: false, razon: 'bloqueado' };
  }

  const coincide = await compararCodigo(codigoIngresado.trim(), reciente.codigoHash);

  if (!coincide) {
    reciente.intentos += 1;
    await reciente.save();
    return { ok: false, razon: 'codigo_incorrecto' };
  }

  reciente.usado = true;
  await reciente.save();
  return { ok: true };
}

/**
 * Wrapper compatible con la firma anterior (boolean) para no romper código
 * existente que llama a `verificarCodigoWhatsApp`.
 */
export async function verificarCodigoWhatsApp(
  telefono: string,
  codigoIngresado: string
): Promise<boolean> {
  const res = await verificarCodigoWhatsAppDetallado(telefono, codigoIngresado);
  return res.ok;
}
