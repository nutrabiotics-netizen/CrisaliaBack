import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Cita from '../../models/Cita';
import HistoriaClinica from '../../models/HistoriaClinica';
import FormulaMedica from '../../models/FormulaMedica';
import Incapacidad from '../../models/Incapacidad';
import Interconsulta from '../../models/Interconsulta';
import ExamenMedico from '../../models/ExamenMedico';
import ApoyoTerapeutico from '../../models/ApoyoTerapeutico';
import AyudaDiagnostica from '../../models/AyudaDiagnostica';

/**
 * Lista documentos del paciente: por cita (resumen + individuales) o todas las citas con documentos.
 */
export const listarDocumentos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.query;

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    if (citaId && typeof citaId === 'string') {
      // Documentos de una cita concreta
      const cita = await Cita.findOne({ _id: citaId, pacienteId }).lean();
      if (!cita) {
        res.status(404).json({ success: false, message: 'Cita no encontrada' });
        return;
      }
      const [historia, formula, incapacidad, interconsulta, examen, apoyo, ayuda] = await Promise.all([
        HistoriaClinica.findOne({ citaId, pacienteId }).lean(),
        FormulaMedica.findOne({ citaId, pacienteId }).lean(),
        Incapacidad.findOne({ citaId, pacienteId }).lean(),
        Interconsulta.findOne({ citaId, pacienteId }).lean(),
        ExamenMedico.findOne({ citaId, pacienteId }).lean(),
        ApoyoTerapeutico.findOne({ citaId, pacienteId }).lean(),
        AyudaDiagnostica.findOne({ citaId, pacienteId }).lean()
      ]);
      const documentos: { tipo: string; nombre: string; url: string }[] = [];
      if (historia?.pdfUrl) documentos.push({ tipo: 'historia', nombre: 'Historia Clínica', url: historia.pdfUrl });
      if (formula?.pdfUrl) documentos.push({ tipo: 'formula', nombre: 'Fórmula Médica', url: formula.pdfUrl });
      if (incapacidad?.pdfUrl) documentos.push({ tipo: 'incapacidad', nombre: 'Incapacidad', url: incapacidad.pdfUrl });
      if (interconsulta?.pdfUrl) documentos.push({ tipo: 'interconsulta', nombre: 'Interconsulta', url: interconsulta.pdfUrl });
      if ((examen as any)?.pdfUrl) documentos.push({ tipo: 'examen', nombre: 'Exámenes de Laboratorio', url: (examen as any).pdfUrl });
      if ((apoyo as any)?.pdfUrl) documentos.push({ tipo: 'apoyo', nombre: 'Apoyo Terapéutico', url: (apoyo as any).pdfUrl });
      if ((ayuda as any)?.pdfUrl) documentos.push({ tipo: 'ayuda', nombre: 'Ayudas Diagnósticas', url: (ayuda as any).pdfUrl });

      res.json({
        success: true,
        data: {
          citaId: cita._id,
          fecha: cita.fecha,
          hora: cita.hora,
          pdfResumenUrl: (cita as any).pdfResumenUrl || null,
          documentos
        }
      });
      return;
    }

    // Todas las citas del paciente con documentos
    const citas = await Cita.find({ pacienteId }).sort({ fecha: -1, hora: -1 }).lean();
    const resultado = await Promise.all(
      citas.map(async (cita) => {
        const [historia, formula, incapacidad, interconsulta, examen, apoyo, ayuda] = await Promise.all([
          HistoriaClinica.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean(),
          FormulaMedica.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean(),
          Incapacidad.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean(),
          Interconsulta.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean(),
          ExamenMedico.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean(),
          ApoyoTerapeutico.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean(),
          AyudaDiagnostica.findOne({ citaId: cita._id, pacienteId }).select('pdfUrl').lean()
        ]);
        const documentos: { tipo: string; nombre: string; url: string }[] = [];
        if (historia?.pdfUrl) documentos.push({ tipo: 'historia', nombre: 'Historia Clínica', url: historia.pdfUrl });
        if (formula?.pdfUrl) documentos.push({ tipo: 'formula', nombre: 'Fórmula Médica', url: formula.pdfUrl });
        if (incapacidad?.pdfUrl) documentos.push({ tipo: 'incapacidad', nombre: 'Incapacidad', url: incapacidad.pdfUrl });
        if (interconsulta?.pdfUrl) documentos.push({ tipo: 'interconsulta', nombre: 'Interconsulta', url: interconsulta.pdfUrl });
        if ((examen as any)?.pdfUrl) documentos.push({ tipo: 'examen', nombre: 'Exámenes de Laboratorio', url: (examen as any).pdfUrl });
        if ((apoyo as any)?.pdfUrl) documentos.push({ tipo: 'apoyo', nombre: 'Apoyo Terapéutico', url: (apoyo as any).pdfUrl });
        if ((ayuda as any)?.pdfUrl) documentos.push({ tipo: 'ayuda', nombre: 'Ayudas Diagnósticas', url: (ayuda as any).pdfUrl });
        const tieneAlgo = (cita as any).pdfResumenUrl || documentos.length > 0;
        return tieneAlgo ? {
          citaId: cita._id,
          fecha: cita.fecha,
          hora: cita.hora,
          pdfResumenUrl: (cita as any).pdfResumenUrl || null,
          documentos
        } : null;
      })
    );

    res.json({
      success: true,
      data: resultado.filter(Boolean)
    });
  } catch (error: any) {
    console.error('Error al listar documentos del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar documentos',
      error: error.message
    });
  }
};
