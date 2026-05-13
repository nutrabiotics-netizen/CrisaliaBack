import HistoriaClinica, { IHistoriaClinica } from '../../../models/HistoriaClinica';
import Cita from '../../../models/Cita';

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
