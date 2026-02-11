/**
 * Servicio para envío de códigos de autenticación por WhatsApp.
 * Integración con API externa Mozart AI.
 */

const WHATSAPP_AUTH_URL = 'https://whatsapp.mozartai.com.co/whatsapp/auth/codigo-login';
const CODIGO_EXPIRA_MINUTOS = 4;

/** Almacén en memoria: celular normalizado -> { codigo, expiresAt } */
const codigosPendientes = new Map<string, { codigo: string; expiresAt: number }>();

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
 * Envía el código de login por WhatsApp al número indicado.
 * Guarda el código en memoria para verificación posterior.
 */
export async function envioCodigoWhatsApp(telefono: string): Promise<{ message: string; codigo?: string }> {
  const formattedPhone = normalizarTelefono(telefono);
  const codigo = generarCodigo();

  try {
    const response = await fetch(WHATSAPP_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        celular: formattedPhone,
        codigo
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('WhatsApp API error:', response.status, errText);
      throw new Error('Error al enviar WhatsApp');
    }

    const expiresAt = Date.now() + CODIGO_EXPIRA_MINUTOS * 60 * 1000;
    codigosPendientes.set(formattedPhone, { codigo, expiresAt });

    return { message: 'Código enviado por WhatsApp' };
  } catch (error) {
    console.error('Error enviando WhatsApp:', error);
    throw new Error('Error al enviar WhatsApp');
  }
}

/**
 * Verifica el código ingresado para un celular.
 * Elimina el código del almacén si es válido.
 * @returns true si el código es correcto y no ha expirado
 */
export function verificarCodigoWhatsApp(telefono: string, codigoIngresado: string): boolean {
  const formattedPhone = normalizarTelefono(telefono);
  const pendiente = codigosPendientes.get(formattedPhone);

  if (!pendiente) {
    return false;
  }
  if (Date.now() > pendiente.expiresAt) {
    codigosPendientes.delete(formattedPhone);
    return false;
  }
  if (pendiente.codigo !== codigoIngresado.trim()) {
    return false;
  }

  codigosPendientes.delete(formattedPhone);
  return true;
}
