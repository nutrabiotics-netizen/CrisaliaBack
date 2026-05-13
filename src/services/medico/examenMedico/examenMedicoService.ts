import mongoose from 'mongoose';
import ExamenMedico from '../../../models/ExamenMedico';
import { IExamenMedico } from '../../../models/ExamenMedico';
import HistoriaClinica from '../../../models/HistoriaClinica';

class ExamenMedicoService {
  async crearExamenMedico(
    examenMedicoData: Partial<IExamenMedico>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IExamenMedico> {
    const nuevoExamenMedico = await ExamenMedico.create({
      ...examenMedicoData,
      creadoPor: creadoPor ? examenMedicoData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevoExamenMedico;
  }

  async obtenerExamenMedicoPorId(
    examenMedicoId: string,
    medicoId: string
  ): Promise<IExamenMedico | null> {
    const examenMedico = await ExamenMedico.findOne({
      _id: examenMedicoId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return examenMedico as IExamenMedico | null;
  }

  async obtenerExamenMedicoPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IExamenMedico | null> {
    const examenMedico = await ExamenMedico.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return examenMedico as IExamenMedico | null;
  }

  async obtenerExamenesMedicosPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IExamenMedico[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const examenesMedicos = await ExamenMedico.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ createdAt: -1 })
      .lean();

    return examenesMedicos as unknown as IExamenMedico[];
  }

  async actualizarExamenMedico(
    examenMedicoId: string,
    medicoId: string,
    datosActualizados: Partial<IExamenMedico>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IExamenMedico | null> {
    const examenMedico = await ExamenMedico.findOneAndUpdate(
      {
        _id: examenMedicoId,
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
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return examenMedico as IExamenMedico | null;
  }

  async eliminarExamenMedico(
    examenMedicoId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await ExamenMedico.findOneAndDelete({
      _id: examenMedicoId,
      medicoId
    });

    return !!resultado;
  }

  async verificarHistoriaClinicaConDiagnosticos(
    citaId: string,
    medicoId: string
  ): Promise<{
    existe: boolean;
    historiaClinica?: any;
    diagnosticos?: any[];
  }> {
    const historiaClinica = await HistoriaClinica.findOne({
      citaId,
      medicoId
    })
      .populate('diagnosticos.codigo')
      .lean();

    if (!historiaClinica) {
      return { existe: false };
    }

    const diagnosticos = historiaClinica.diagnosticos || [];

    return {
      existe: true,
      historiaClinica,
      diagnosticos
    };
  }
}

export default new ExamenMedicoService();
