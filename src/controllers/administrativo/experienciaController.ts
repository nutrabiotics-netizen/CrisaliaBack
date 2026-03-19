import express from 'express';
import { AuthRequest } from '../../middleware/auth';
import EncuestaSatisfaccion from '../../models/EncuestaSatisfaccion';
import Paciente from '../../models/Paciente';

// Promedia cada categoría de las encuestas registradas
export const obtenerMetricasGlobales = async (_req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const encuestas = await EncuestaSatisfaccion.find().lean();
    
    if (encuestas.length === 0) {
      res.json({
        success: true,
        data: {
          totalEncuestas: 0,
          promedios: { agendamiento: 0, preconsultaIA: 0, recomendaciones: 0, presencial: 0, tiemposEspera: 0 },
          npsGlobal: 0
        }
      });
      return;
    }

    let a = 0, p = 0, r = 0, at = 0, t = 0;
    encuestas.forEach(e => {
      a += e.calificacionAgendamiento;
      p += e.calificacionPreconsultaIA;
      r += e.calificacionRecomendaciones;
      at += e.calificacionAtencionPresencial;
      t += e.calificacionTiemposEspera;
    });

    const len = encuestas.length;
    const promedios = {
      agendamiento: a / len,
      preconsultaIA: p / len,
      recomendaciones: r / len,
      presencial: at / len,
      tiemposEspera: t / len
    };

    const npsGlobal = (promedios.agendamiento + promedios.preconsultaIA + promedios.recomendaciones + promedios.presencial + promedios.tiemposEspera) / 5;

    res.json({
      success: true,
      data: {
        totalEncuestas: len,
        promedios,
        npsGlobal
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo métricas', error: error.message });
  }
};

// Retorna el feed de comentarios/críticas ocultando al paciente si es anónimo
export const listarSugerencias = async (_req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const encuestas = await EncuestaSatisfaccion.find({ sugerencias: { $exists: true, $ne: '' } })
      .populate('pacienteId', 'primerNombre primerApellido numeroIdentificacion')
      .sort({ createdAt: -1 })
      .lean();

    const sugerenciasProcesadas = encuestas.map(e => {
      const p = e.pacienteId as any;
      let autor = 'Paciente Anónimo';
      
      if (!e.esAnonimo && p) {
        autor = `${p.primerNombre} ${p.primerApellido}`;
      }

      const calificacionMedia = (e.calificacionAgendamiento + e.calificacionAtencionPresencial + e.calificacionPreconsultaIA + e.calificacionRecomendaciones + e.calificacionTiemposEspera) / 5;

      return {
        _id: e._id,
        autor,
        fecha: e.createdAt,
        comentario: e.sugerencias,
        calificacionGlobalRespuesta: calificacionMedia.toFixed(1),
        leido: e.leidoPorAdministrador
      };
    });

    res.json({ success: true, data: sugerenciasProcesadas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error listando sugerencias', error: error.message });
  }
};

// Genera un batch aleatorio de encuestas (solo con fines evaluativos)
export const generarSemillaPruebas = async (_req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const pacientes = await Paciente.find().limit(5).lean();
    if (pacientes.length === 0) {
      res.status(400).json({ success: false, message: 'No hay pacientes en BD para simular encuestas.' });
      return;
    }

    const feedbacks = [
      'Excelente atención por parte del médico, pero demoraron en llamarme. El agendamiento fue genial.',
      'Me gustó mucho la IA de pre-consulta, me ahorró preguntas del doctor. Altamente recomendados.',
      'Las recomendaciones de la IA me resultaron un poco repetitivas. Sin embargo, la atención presencial fue de 5 estrellas.',
      'El sistema en línea de citas es fallido a veces, pero logré comunicarme por teléfono. Recomiendo mejorar el portal de agendamiento.',
      'Me sentí muy bien atendido. Todo rápido y al punto gracias a la evaluación previa por la app.'
    ];

    const batch = [];
    for (let i = 0; i < 15; i++) {
        const randPac = pacientes[Math.floor(Math.random() * pacientes.length)] as any;
        const wantsAnon = Math.random() > 0.5;
        const hasComment = Math.random() > 0.4;

        batch.push({
            pacienteId: randPac._id,
            calificacionAgendamiento: Math.floor(Math.random() * 3) + 3, // 3 to 5
            calificacionPreconsultaIA: Math.floor(Math.random() * 2) + 4, // 4 to 5
            calificacionRecomendaciones: Math.floor(Math.random() * 3) + 3,
            calificacionAtencionPresencial: 5,
            calificacionTiemposEspera: Math.floor(Math.random() * 5) + 1, // 1 to 5
            sugerencias: hasComment ? feedbacks[Math.floor(Math.random() * feedbacks.length)] : '',
            esAnonimo: wantsAnon,
            leidoPorAdministrador: Math.random() > 0.7
        });
    }

    await EncuestaSatisfaccion.insertMany(batch);

    res.json({ success: true, message: '15 encuestas generadas exitosamente.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generando semillas', error: error.message });
  }
};
