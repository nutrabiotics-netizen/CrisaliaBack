import Incapacidad from '../../../models/Incapacidad';
import { IIncapacidad } from '../../../models/Incapacidad';
import HistoriaClinica from '../../../models/HistoriaClinica';

class IncapacidadService {
  async crearIncapacidad(
    incapacidadData: Partial<IIncapacidad>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IIncapacidad> {
    const nuevaIncapacidad = await Incapacidad.create({
      ...incapacidadData,
      creadoPor: creadoPor ? incapacidadData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevaIncapacidad;
  }

  async obtenerIncapacidadPorId(
    incapacidadId: string,
    medicoId: string
  ): Promise<IIncapacidad | null> {
    const incapacidad = await Incapacidad.findOne({
      _id: incapacidadId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return incapacidad as IIncapacidad | null;
  }

  async obtenerIncapacidadPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IIncapacidad | null> {
    const incapacidad = await Incapacidad.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return incapacidad as IIncapacidad | null;
  }

  async obtenerIncapacidadesPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IIncapacidad[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const incapacidades = await Incapacidad.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ fechaExpedicion: -1 })
      .lean();

    return incapacidades as IIncapacidad[];
  }

  async actualizarIncapacidad(
    incapacidadId: string,
    medicoId: string,
    datosActualizados: Partial<IIncapacidad>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IIncapacidad | null> {
    const incapacidad = await Incapacidad.findOneAndUpdate(
      {
        _id: incapacidadId,
        medicoId
      },
      {
        ...datosActualizados,
        actualizadoPor: actualizadoPor ? incapacidadId : undefined,
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

    return incapacidad;
  }

  async eliminarIncapacidad(
    incapacidadId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await Incapacidad.deleteOne({
      _id: incapacidadId,
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

export default new IncapacidadService();
