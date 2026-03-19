import { Request, Response } from 'express';
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
