import HistoriaClinica from '../../../models/HistoriaClinica';
import { IHistoriaClinica } from '../../../models/HistoriaClinica';

class HistoriaClinicaService {
  async crearHistoriaClinica(
    historiaData: Partial<IHistoriaClinica>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IHistoriaClinica> {
    const nuevaHistoria = await HistoriaClinica.create({
      ...historiaData,
      creadoPor: creadoPor ? historiaData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevaHistoria;
  }

  async obtenerHistoriaClinicaPorId(
    historiaId: string,
    medicoId: string
  ): Promise<IHistoriaClinica | null> {
    const historia = await HistoriaClinica.findOne({
      _id: historiaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return historia as IHistoriaClinica | null;
  }

  async obtenerHistoriaClinicaPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IHistoriaClinica | null> {
    const historia = await HistoriaClinica.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return historia as IHistoriaClinica | null;
  }

  async obtenerHistoriasClinicasPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IHistoriaClinica[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const historias = await HistoriaClinica.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ fechaRegistro: -1 })
      .lean();

    return historias as IHistoriaClinica[];
  }

  async actualizarHistoriaClinica(
    historiaId: string,
    medicoId: string,
    datosActualizados: Partial<IHistoriaClinica>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IHistoriaClinica | null> {
    const historia = await HistoriaClinica.findOneAndUpdate(
      {
        _id: historiaId,
        medicoId
      },
      {
        ...datosActualizados,
        actualizadoPor: actualizadoPor ? historiaId : undefined,
        actualizadoPorRol: actualizadoPorRol || 'Medico'
      },
      {
        new: true,
        runValidators: true
      }
    )
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('citaId', 'fecha hora tipo modalidad estado');

    return historia;
  }

  async eliminarHistoriaClinica(
    historiaId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await HistoriaClinica.deleteOne({
      _id: historiaId,
      medicoId
    });

    return resultado.deletedCount > 0;
  }
}

export default new HistoriaClinicaService();

