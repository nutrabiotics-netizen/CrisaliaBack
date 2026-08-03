import { Request, Response } from 'express';
import mongoose from 'mongoose';
import EncuestaSatisfaccion from '../../models/EncuestaSatisfaccion';

// Recibe la encuesta enviada desde el portal/correo del paciente sin Auth
export const enviarEncuesta = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      calificacionAgendamiento,
      calificacionPreconsultaIA,
      calificacionRecomendaciones,
      calificacionAtencionPresencial,
      calificacionTiemposEspera,
      sugerencias,
      esAnonimo
    } = req.body;

    // Validación básica de 1 a 5
    const ratings = [calificacionAgendamiento, calificacionPreconsultaIA, calificacionRecomendaciones, calificacionAtencionPresencial, calificacionTiemposEspera];
    for (const r of ratings) {
      if (!r || r < 1 || r > 5) {
        res.status(400).json({ success: false, message: 'Todas las calificaciones deben estar entre 1 y 5.' });
        return;
      }
    }

    const nuevaEncuesta = new EncuestaSatisfaccion({
      calificacionAgendamiento,
      calificacionPreconsultaIA,
      calificacionRecomendaciones,
      calificacionAtencionPresencial,
      calificacionTiemposEspera,
      sugerencias: sugerencias || '',
      esAnonimo: Boolean(esAnonimo),
      leidoPorAdministrador: false
    });

    await nuevaEncuesta.save();

    res.status(201).json({ success: true, message: '¡Gracias por ayudarnos a mejorar! Encuesta guardada.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error guardando encuesta de paciente.', error: error.message });
  }
};

/**
 * POST /api/public/encuesta-post-pago
 * Guarda el feedback del formulario post-pago del paciente.
 * No requiere autenticación. Los campos del formulario van en datosPostPago.
 * Body: { estadoPago, seguridad, friccion, comentario, citaId?, pacienteId? }
 */
export const enviarEncuestaPostPago = async (req: Request, res: Response): Promise<void> => {
  try {
    const { estadoPago, seguridad, friccion, comentario, citaId, pacienteId } = req.body;

    const nuevaEncuesta = new EncuestaSatisfaccion({
      citaId: citaId && mongoose.isValidObjectId(citaId) ? citaId : undefined,
      pacienteId: pacienteId && mongoose.isValidObjectId(pacienteId) ? pacienteId : undefined,
      // Campos requeridos del schema — usamos valor neutro (3) ya que no aplican aquí
      calificacionAgendamiento: 3,
      calificacionPreconsultaIA: 3,
      calificacionRecomendaciones: 3,
      calificacionAtencionPresencial: 3,
      calificacionTiemposEspera: 3,
      sugerencias: comentario || '',
      esAnonimo: !pacienteId,
      leidoPorAdministrador: false,
      datosPostPago: {
        estadoPago: estadoPago ?? null,
        seguridad: seguridad ?? null,
        friccion: friccion ?? null,
        comentario: comentario ?? '',
      },
    });

    await nuevaEncuesta.save();

    res.status(201).json({ success: true, message: '¡Gracias por tu feedback!' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error guardando encuesta post-pago.', error: error.message });
  }
};
