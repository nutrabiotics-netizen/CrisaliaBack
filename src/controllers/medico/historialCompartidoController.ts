import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import CompartirHistorial from '../../models/CompartirHistorial';
import HistoriaClinica from '../../models/HistoriaClinica';
import FormulaMedica from '../../models/FormulaMedica';
import Paraclinico from '../../models/Paraclinico';
import Interrogatorio from '../../models/Interrogatorio';
import Cita from '../../models/Cita';
import { handleError } from '../../utils/errors';

/** GET /api/medico/historial-compartido/:pacienteId
 *  Devuelve las secciones que el paciente autorizó al médico autenticado. */
export const obtenerHistorialCompartido = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const { pacienteId } = req.params;

    const acceso = await CompartirHistorial.findOne({ pacienteId, medicoId, activo: true }).lean();
    if (!acceso) {
      res.status(403).json({ success: false, message: 'Este paciente no ha compartido su historial contigo.' });
      return;
    }

    const secciones = acceso.secciones;
    const resultado: Record<string, any> = { secciones };

    await Promise.all([
      secciones.includes('historia_clinica') &&
        HistoriaClinica.find({ pacienteId }).sort({ createdAt: -1 }).limit(10).lean()
          .then(d => { resultado.historias_clinicas = d; }),

      secciones.includes('formulas_medicas') &&
        FormulaMedica.find({ pacienteId }).sort({ createdAt: -1 }).limit(10).lean()
          .then(d => { resultado.formulas_medicas = d; }),

      secciones.includes('paraclinicos') &&
        Paraclinico.find({ pacienteId }).sort({ fecha: -1 }).lean()
          .then(d => { resultado.paraclinicos = d; }),

      secciones.includes('interrogatorio') &&
        Interrogatorio.findOne({ pacienteId }).sort({ createdAt: -1 }).lean()
          .then(d => { resultado.interrogatorio = d; }),

      secciones.includes('citas') &&
        Cita.find({ pacienteId }).sort({ fecha: -1 }).limit(20).lean()
          .then(d => { resultado.citas = d; }),
    ]);

    res.json({ success: true, data: resultado });
  } catch (err: any) {
    handleError(err, res);
  }
};

/** GET /api/medico/historial-compartido — lista pacientes que compartieron con este médico */
export const listarPacientesCompartidos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const registros = await CompartirHistorial.find({ medicoId, activo: true })
      .populate('pacienteId', 'nombre apellido fechaNacimiento tipoDocumento numeroDocumento telefono')
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ success: true, data: registros });
  } catch (err: any) {
    handleError(err, res);
  }
};