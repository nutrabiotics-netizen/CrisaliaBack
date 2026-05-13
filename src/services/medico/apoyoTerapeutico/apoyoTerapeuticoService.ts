import mongoose from 'mongoose';
import ApoyoTerapeutico from '../../../models/ApoyoTerapeutico';
import { IApoyoTerapeutico } from '../../../models/ApoyoTerapeutico';
import HistoriaClinica from '../../../models/HistoriaClinica';

class ApoyoTerapeuticoService {
  async crearApoyoTerapeutico(
    apoyoTerapeuticoData: Partial<IApoyoTerapeutico>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IApoyoTerapeutico> {
    const nuevoApoyoTerapeutico = await ApoyoTerapeutico.create({
      ...apoyoTerapeuticoData,
      creadoPor: creadoPor ? apoyoTerapeuticoData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevoApoyoTerapeutico;
  }

  async obtenerApoyoTerapeuticoPorId(
    apoyoTerapeuticoId: string,
    medicoId: string
  ): Promise<IApoyoTerapeutico | null> {
    const apoyoTerapeutico = await ApoyoTerapeutico.findOne({
      _id: apoyoTerapeuticoId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return apoyoTerapeutico as IApoyoTerapeutico | null;
  }

  async obtenerApoyoTerapeuticoPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IApoyoTerapeutico | null> {
    const apoyoTerapeutico = await ApoyoTerapeutico.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return apoyoTerapeutico as IApoyoTerapeutico | null;
  }

  async obtenerApoyosTerapeuticosPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IApoyoTerapeutico[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const apoyosTerapeuticos = await ApoyoTerapeutico.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ createdAt: -1 })
      .lean();

    return apoyosTerapeuticos as unknown as IApoyoTerapeutico[];
  }

  async actualizarApoyoTerapeutico(
    apoyoTerapeuticoId: string,
    medicoId: string,
    datosActualizados: Partial<IApoyoTerapeutico>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IApoyoTerapeutico | null> {
    const apoyoTerapeutico = await ApoyoTerapeutico.findOneAndUpdate(
      {
        _id: apoyoTerapeuticoId,
        medicoId
      },
      {
        ...datosActualizados,
        actualizadoPor: actualizadoPor ? new mongoose.Types.ObjectId(actualizadoPor) : undefined,
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

    return apoyoTerapeutico;
  }

  async eliminarApoyoTerapeutico(
    apoyoTerapeuticoId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await ApoyoTerapeutico.deleteOne({
      _id: apoyoTerapeuticoId,
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

export default new ApoyoTerapeuticoService();
