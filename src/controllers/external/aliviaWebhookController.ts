import { Request, Response } from 'express';
import FormulaMedica from '../../models/FormulaMedica';

/**
 * POST /api/external/alivia/webhook
 *
 * Protegido por authenticateExternal (token externo) que se aplica
 * en el router /api/external.
 *
 * Body esperado:
 * {
 *   id_orden: string,       // "CRISAL-{timestamp}-{random}"
 *   link_carrito: string,   // URL del carrito/tracking de ALIVIA
 *   estado: "pagado"
 * }
 */
export const aliviaWebhook = async (req: Request, res: Response): Promise<void> => {
  // Feature flag — rechaza llamadas si la integración no está activa
  if (process.env.ALIVIA_ENABLED !== 'true') {
    res.status(503).json({
      success: false,
      mensaje: 'La integración con ALIVIA no está activada en este entorno.'
    });
    return;
  }

  try {
    const { id_orden, link_carrito, estado } = req.body;

    if (!id_orden || !estado) {
      res.status(400).json({ mensaje: 'id_orden y estado son obligatorios.' });
      return;
    }

    // Buscar la fórmula que tenga esa orden
    const formula = await FormulaMedica.findOne({ 'ordenAlivia.json.id_orden': id_orden })
      .populate('pacienteId', 'nombre apellido celular')
      .populate('medicoId', 'nombre apellido celular')
      .lean();

    if (!formula) {
      res.status(404).json({ mensaje: `No se encontró fórmula con id_orden ${id_orden}.` });
      return;
    }

    // Actualizar estado en DB
    await FormulaMedica.findByIdAndUpdate(formula._id, {
      $set: {
        'ordenAlivia.estado': estado === 'pagado' ? 'pagado' : 'enviado',
        'ordenAlivia.linkCarrito': link_carrito ?? undefined,
        'ordenAlivia.fechaEnvio': new Date()
      }
    });

    const paciente = formula.pacienteId as any;
    const medico = formula.medicoId as any;
    const waBaseUrl = process.env.WHATSAPP_API_URL ?? 'https://whatsapp.mozartai.com.co/whatsapp';

    // Notificar al médico
    if (medico?.celular) {
      const msgMedico = `✅ *Crisal-iA — Compra ALIVIA confirmada*\nEl paciente *${paciente?.nombre ?? ''} ${paciente?.apellido ?? ''}* completó la compra de sus suplementos.\nOrden: ${id_orden}`;
      fetch(`${waBaseUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular: medico.celular, mensaje: msgMedico })
      }).catch((e: Error) => console.error('[AliviaWebhook] WA médico error:', e.message));
    }

    // Notificar al paciente
    if (paciente?.celular) {
      const msgPaciente = `🎉 *Crisal-iA — Tu orden de suplementos fue confirmada*\nHemos recibido tu compra en ALIVIA.\nOrden: ${id_orden}${link_carrito ? `\nSeguimiento: ${link_carrito}` : ''}`;
      fetch(`${waBaseUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular: paciente.celular, mensaje: msgPaciente })
      }).catch((e: Error) => console.error('[AliviaWebhook] WA paciente error:', e.message));
    }

    res.json({ success: true, mensaje: 'Orden actualizada correctamente.' });
  } catch (err: any) {
    console.error('[AliviaWebhook] error:', err);
    res.status(500).json({ mensaje: 'Error procesando webhook ALIVIA.', error: err.message });
  }
};
