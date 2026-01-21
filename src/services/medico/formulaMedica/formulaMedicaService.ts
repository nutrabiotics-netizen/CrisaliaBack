import FormulaMedica, { IFormulaMedica } from '../../../models/FormulaMedica';
import HistoriaClinica from '../../../models/HistoriaClinica';

class FormulaMedicaService {
  async crearFormulaMedica(
    formulaData: Partial<IFormulaMedica>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<IFormulaMedica> {
    const nuevaFormula = await FormulaMedica.create({
      ...formulaData,
      creadoPor: creadoPor ? formulaData.medicoId : undefined,
      creadoPorRol: creadoPorRol || 'Medico'
    });

    return nuevaFormula;
  }

  async obtenerFormulaMedicaPorId(
    formulaId: string,
    medicoId: string
  ): Promise<IFormulaMedica | null> {
    const formula = await FormulaMedica.findOne({
      _id: formulaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return formula as IFormulaMedica | null;
  }

  async obtenerFormulaMedicaPorCita(
    citaId: string,
    medicoId: string
  ): Promise<IFormulaMedica | null> {
    const formula = await FormulaMedica.findOne({
      citaId,
      medicoId
    })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    return formula as IFormulaMedica | null;
  }

  async obtenerFormulasMedicasPorPaciente(
    pacienteId: string,
    medicoId?: string
  ): Promise<IFormulaMedica[]> {
    const query: any = { pacienteId };
    if (medicoId) {
      query.medicoId = medicoId;
    }

    const formulas = await FormulaMedica.find(query)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ createdAt: -1 })
      .lean();

    return formulas as IFormulaMedica[];
  }

  async actualizarFormulaMedica(
    formulaId: string,
    medicoId: string,
    datosActualizados: Partial<IFormulaMedica>,
    actualizadoPor?: string,
    actualizadoPorRol?: string
  ): Promise<IFormulaMedica | null> {
    const formula = await FormulaMedica.findOneAndUpdate(
      {
        _id: formulaId,
        medicoId
      },
      {
        ...datosActualizados,
        actualizadoPor: actualizadoPor ? formulaId : undefined,
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

    return formula;
  }

  async eliminarFormulaMedica(
    formulaId: string,
    medicoId: string
  ): Promise<boolean> {
    const resultado = await FormulaMedica.deleteOne({
      _id: formulaId,
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

export default new FormulaMedicaService();
