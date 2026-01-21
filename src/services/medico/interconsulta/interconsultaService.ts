import Interconsulta from '../../../models/Interconsulta';
import { IInterconsulta } from '../../../models/Interconsulta';
import HistoriaClinica from '../../../models/HistoriaClinica';

class InterconsultaService {
  async crearInterconsulta(
    interconsultaData: Partial<IInterconsulta>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IInterconsulta> {
    const nuevaInterconsulta = await Interconsulta.create({
      ...interconsultaData,
      creadoPor: creadoPor ? interconsultaData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevaInterconsulta;
  }

  async obtenerInterconsultaPorId(
    interconsultaId: string,
    medicoId: string
  ): Promise<IInterconsulta | null> {
    const interconsulta = await Interconsulta.findOne({
      _id: interconsultaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return interconsulta as IInterconsulta | null;
  }

  async obtenerInterconsultaPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IInterconsulta | null> {
    const interconsulta = await Interconsulta.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return interconsulta as IInterconsulta | null;
  }

  async obtenerInterconsultasPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IInterconsulta[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const interconsultas = await Interconsulta.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ createdAt: -1 })
      .lean();

    return interconsultas as IInterconsulta[];
  }

  async actualizarInterconsulta(
    interconsultaId: string,
    medicoId: string,
    datosActualizados: Partial<IInterconsulta>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IInterconsulta | null> {
    const interconsulta = await Interconsulta.findOneAndUpdate(
      {
        _id: interconsultaId,
        medicoId
      },
      {
        ...datosActualizados,
        actualizadoPor: actualizadoPor ? interconsultaId : undefined,
        actualizadoPorRol: actualizadoPorRol || 'Medico'
      },
      {
        new: true,
        runValidators: true
      }
    )
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado');

    return interconsulta;
  }

  async eliminarInterconsulta(
    interconsultaId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await Interconsulta.deleteOne({
      _id: interconsultaId,
      medicoId
    });

    return resultado.deletedCount > 0;
  }

  // Verificar que existe historia clínica con diagnósticos para la cita
  async verificarHistoriaClinicaConDiagnosticos(
    citaId: string,
    medicoId: string
  ): Promise<{ existe: boolean; historiaClinica?: any; diagnosticos?: any[] }> {
    const historia = await HistoriaClinica.findOne({
      citaId,
      medicoId
    }).lean();

    if (!historia) {
      return { existe: false };
    }

    const diagnosticos = historia.diagnosticos || [];
    return {
      existe: true,
      historiaClinica: historia,
      diagnosticos: diagnosticos.length > 0 ? diagnosticos : undefined
    };
  }
}

export default new InterconsultaService();
