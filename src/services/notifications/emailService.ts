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

export async function enviarDocumentoPaciente(opts: {
  emailPaciente: string;
  nombrePaciente: string;
  nombreMedico: string;
  tipoDocumento: string;
  pdfBase64: string;
  nombreArchivo: string;
}): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[EmailService] SENDGRID_API_KEY no configurada — omitiendo envío');
    return;
  }
  const titulos: Record<string, string> = {
    'formula-medica':         'Fórmula médica',
    'estrategia-terapeutica': 'Estrategia Terapéutica',
    'orden-examenes':         'Orden de exámenes',
  };
  const titulo = titulos[opts.tipoDocumento] ?? 'Documento clínico';
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>${titulo}</title>
<style>body{font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937}
h2{color:#224DC6}p{line-height:1.6;color:#555}.footer{margin-top:30px;font-size:11px;color:#9ca3af;text-align:center}</style>
</head><body>
<h2>${titulo} — Crisal·IA</h2>
<p>Hola <strong>${opts.nombrePaciente}</strong>,</p>
<p>Tu médico <strong>${opts.nombreMedico}</strong> ha firmado y enviado el documento adjunto desde la plataforma Crisal·IA.</p>
<p>Por favor revisa el archivo PDF adjunto con tus indicaciones.</p>
<div class="footer">Crisal·IA · Medicina Funcional e Integrativa</div>
</body></html>`;
  await sgMail.send({
    to:      opts.emailPaciente,
    from:    FROM_EMAIL,
    subject: `${titulo} — ${opts.nombreMedico}`,
    html,
    attachments: [{ content: opts.pdfBase64, filename: opts.nombreArchivo, type: 'application/pdf', disposition: 'attachment' }],
  });
}
