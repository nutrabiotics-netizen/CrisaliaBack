import mongoose from 'mongoose';
import AyudaDiagnostica from '../../../models/AyudaDiagnostica';
import { IAyudaDiagnostica } from '../../../models/AyudaDiagnostica';
import HistoriaClinica from '../../../models/HistoriaClinica';

class AyudaDiagnosticaService {
  async crearAyudaDiagnostica(
    ayudaDiagnosticaData: Partial<IAyudaDiagnostica>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IAyudaDiagnostica> {
    const nuevaAyudaDiagnostica = await AyudaDiagnostica.create({
      ...ayudaDiagnosticaData,
      creadoPor: creadoPor ? ayudaDiagnosticaData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevaAyudaDiagnostica;
  }

  async obtenerAyudaDiagnosticaPorId(
    ayudaDiagnosticaId: string,
    medicoId: string
  ): Promise<IAyudaDiagnostica | null> {
    const ayudaDiagnostica = await AyudaDiagnostica.findOne({
      _id: ayudaDiagnosticaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return ayudaDiagnostica as IAyudaDiagnostica | null;
  }

  async obtenerAyudaDiagnosticaPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IAyudaDiagnostica | null> {
    const ayudaDiagnostica = await AyudaDiagnostica.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return ayudaDiagnostica as IAyudaDiagnostica | null;
  }

  async obtenerAyudasDiagnosticasPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IAyudaDiagnostica[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const ayudasDiagnosticas = await AyudaDiagnostica.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ createdAt: -1 })
      .lean();

    return ayudasDiagnosticas as IAyudaDiagnostica[];
  }

  async actualizarAyudaDiagnostica(
    ayudaDiagnosticaId: string,
    medicoId: string,
    datosActualizados: Partial<IAyudaDiagnostica>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IAyudaDiagnostica | null> {
    const ayudaDiagnostica = await AyudaDiagnostica.findOneAndUpdate(
      {
        _id: ayudaDiagnosticaId,
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

    return ayudaDiagnostica as IAyudaDiagnostica | null;
  }

  async eliminarAyudaDiagnostica(
    ayudaDiagnosticaId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await AyudaDiagnostica.findOneAndDelete({
      _id: ayudaDiagnosticaId,
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

export default new AyudaDiagnosticaService();
