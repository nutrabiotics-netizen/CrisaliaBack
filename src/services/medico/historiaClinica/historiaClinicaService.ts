import HistoriaClinica from '../../../models/HistoriaClinica';
import { IHistoriaClinica } from '../../../models/HistoriaClinica';
import { incrementarPacientesPlanPrueba } from '../../../middleware/checkSuscripcion';

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

    // Incrementar contador del plan de prueba (solo aplica si no tiene suscripción activa)
    if (historiaData.medicoId) {
      incrementarPacientesPlanPrueba(String(historiaData.medicoId)).catch((e) =>
        console.warn('[HC] incrementarPlanPrueba error (no crítico):', e)
      );
    }

    return nuevaHistoria;
  }

  async obtenerHistoriaClinicaPorId(
    historiaId: string,
    medicoId: string
  ): Promise<IHistoriaClinica | null> {
    const historia = await HistoriaClinica.findOne({
      _id: historiaId,
      medicoId,
      activo: { $ne: false }
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
    const query: any = { pacienteId, activo: { $ne: false } };
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
    // Borrado lógico: nunca se elimina físicamente (requisito §5.4 del plan maestro)
    const resultado = await HistoriaClinica.findOneAndUpdate(
      { _id: historiaId, medicoId },
      { $set: { activo: false } }
    );
    return resultado !== null;
  }
}

export default new HistoriaClinicaService();

