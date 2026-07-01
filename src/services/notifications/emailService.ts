import sgMail from '@sendgrid/mail';

const FROM_EMAIL = 'nutrabiotics@mozartai.com.co';

function initSendGrid(): void {
  const key = process.env.SENDGRID_API_KEY;
  if (key) sgMail.setApiKey(key);
}

initSendGrid();

function codigoOtpHtml(codigo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Código de verificación</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
    h2 { color: #443c92; text-align: center; }
    .code { text-align: center; margin: 20px 0; }
    .code span { font-size: 28px; font-weight: bold; padding: 12px 24px; color: #fff; background-color: #443c92; border-radius: 8px; letter-spacing: 4px; }
    p { color: #555; line-height: 1.6; }
    .footer { margin-top: 30px; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <h2>Código de verificación</h2>
  <p>Hola,</p>
  <p>Tu código de verificación para ingresar a Crisalia es:</p>
  <div class="code">
    <span>${codigo}</span>
  </div>
  <p><strong>El código expira en 4 minutos.</strong></p>
  <p>Si no solicitaste este código, ignora este mensaje.</p>
  <div class="footer">Nutrabiotics · Crisalia</div>
</body>
</html>`;
}

export async function enviarCodigoOtpEmail(email: string, codigo: string): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[EmailService] SENDGRID_API_KEY no configurada — omitiendo envío de email');
    return;
  }

  const msg = {
    to: email,
    from: FROM_EMAIL,
    subject: 'Código de verificación — Crisalia',
    html: codigoOtpHtml(codigo),
  };

  try {
    await sgMail.send(msg);
    console.log('[EmailService] Código OTP enviado a:', email);
  } catch (err: any) {
    console.error('[EmailService] Error enviando email:', err?.response?.body ?? err?.message ?? err);
    // No lanzamos error — el envío por WhatsApp ya fue exitoso, el email es complementario
  }
}
