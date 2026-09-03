import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import HistoriaClinica from '../../models/HistoriaClinica';
import FormulaMedica from '../../models/FormulaMedica';
import Paraclinico from '../../models/Paraclinico';
import Interrogatorio from '../../models/Interrogatorio';
import Cita from '../../models/Cita';
import { handleError } from '../../utils/errors';

/**
 * GET /api/paciente/mi-historial
 * Devuelve el historial completo del paciente autenticado agrupado por sección.
 * Usado para que el paciente revise su información antes de compartirla.
 */
export const obtenerMiHistorial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;

    const [historias, formulas, paraclinicos, interrogatorio, citas] = await Promise.all([
      HistoriaClinica.find({ pacienteId, activo: { $ne: false } })
        .sort({ createdAt: -1 })
        .select('motivoConsulta diagnosticos recomendaciones analisisyplan createdAt citaId')
        .limit(10)
        .lean(),

      FormulaMedica.find({ pacienteId, activo: { $ne: false } })
        .sort({ createdAt: -1 })
        .select('medicamentos diagnosticos observaciones createdAt citaId')
        .limit(10)
        .lean(),

      Paraclinico.find({ pacienteId })
        .sort({ fecha: -1 })
        .select('nombre tipo fecha urlArchivo tipoDocumento ocrEstado ocrValores revisadoPorMedico tamañoBytes')
        .lean(),

      Interrogatorio.findOne({ pacienteId, estado: 'completado' })
        .sort({ createdAt: -1 })
        .select('tipo estado progreso analisisIA objetivos analisisFisiologicoIA createdAt')
        .lean(),

      Cita.find({ pacienteId, estado: { $ne: 'cancelada' } })
        .sort({ fecha: -1 })
        .select('fecha hora modalidad tipo estado createdAt')
        .populate('medicoId', 'nombre apellido especialidad')
        .limit(20)
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        historia_clinica:  { total: historias.length,    items: historias },
        formulas_medicas:  { total: formulas.length,     items: formulas },
        paraclinicos:      { total: paraclinicos.length, items: paraclinicos },
        interrogatorio:    { disponible: !!interrogatorio, item: interrogatorio },
        citas:             { total: citas.length,        items: citas },
      },
    });
  } catch (err: any) {
    handleError(err, res);
  }
};