import HistoriaClinica, { IHistoriaClinica } from '../../../models/HistoriaClinica';
import Cita from '../../../models/Cita';
import FormulaMedica from '../../../models/FormulaMedica';
import ExamenMedico from '../../../models/ExamenMedico';
import PagoSimulado from '../../../models/PagoSimulado';

class PacienteHistoriaClinicaService {
  async obtenerPorCita(citaId: string, pacienteId: string): Promise<IHistoriaClinica | null> {
    const cita = await Cita.findOne({ _id: citaId, pacienteId }).select('_id').lean();
    if (!cita) return null;

    const historia = await HistoriaClinica.findOne({
      citaId,
      pacienteId,
      activo: { $ne: false }
    })
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return historia as IHistoriaClinica | null;
  }

  /**
   * Detalle completo de una cita: HC + Fórmula + Exámenes + Pago + Cita.
   * Verifica que la cita sea del paciente; si no es, devuelve null.
   */
  async obtenerDetalleCompleto(citaId: string, pacienteId: string) {
    const cita = await Cita.findOne({ _id: citaId, pacienteId })
      .populate('medicoId', 'nombre apellido especialidad')
      .lean();
    if (!cita) return null;

    const [historia, formula, examenMedico, pagos] = await Promise.all([
      HistoriaClinica.findOne({ citaId, pacienteId, activo: { $ne: false } })
        .populate('medicoId', 'nombre apellido especialidad')
        .lean(),
      FormulaMedica.findOne({ citaId, pacienteId }).lean(),
      ExamenMedico.findOne({ citaId, pacienteId }).lean(),
      PagoSimulado.find({ pacienteId }).sort({ createdAt: -1 }).limit(5).lean()
    ]);

    // Tomamos el pago más reciente como representativo de esta cita (el modelo
    // PagoSimulado actual no está vinculado a citaId; mejor que nada).
    const pagoReciente = pagos[0] ?? null;

    return {
      cita,
      historia: historia ?? null,
      formula: formula ?? null,
      examenMedico: examenMedico ?? null,
      pago: pagoReciente
    };
  }

  async listarPorPaciente(pacienteId: string): Promise<IHistoriaClinica[]> {
    const historias = await HistoriaClinica.find({
      pacienteId,
      activo: { $ne: false }
    })
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ fechaRegistro: -1 })
      .lean();

    return historias as unknown as IHistoriaClinica[];
  }
}

export default new PacienteHistoriaClinicaService();
