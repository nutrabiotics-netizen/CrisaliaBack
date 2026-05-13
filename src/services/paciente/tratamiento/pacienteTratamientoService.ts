import FormulaMedica, { IFormulaMedica, IMedicamento } from '../../../models/FormulaMedica';
import HistoriaClinica from '../../../models/HistoriaClinica';
import AdherenciaToma from '../../../models/AdherenciaToma';

export interface IndicacionActiva {
  formulaMedicaId: string;
  medicamentoIndex: number;
  denominacionComun: string;
  concentracion: string;
  dosis: string;
  frecuencia: string;
  viaAdministracion: string;
  diasTratamiento: string;
  fechaInicio?: Date;
  indicaciones?: string;
  tomasRegistradas: number;
}

class PacienteTratamientoService {
  private async getUltimaFormula(pacienteId: string): Promise<IFormulaMedica | null> {
    return FormulaMedica.findOne({ pacienteId })
      .sort({ createdAt: -1 })
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad')
      .lean<IFormulaMedica | null>();
  }

  async obtenerActivo(pacienteId: string) {
    const [formula, ultimaHC] = await Promise.all([
      this.getUltimaFormula(pacienteId),
      HistoriaClinica.findOne({ pacienteId, activo: { $ne: false } })
        .sort({ fechaRegistro: -1 })
        .populate('medicoId', 'nombre apellido especialidad')
        .populate('citaId', 'fecha hora tipo modalidad')
        .lean()
    ]);

    return {
      formula: formula ?? null,
      historiaClinica: ultimaHC ?? null,
      estrategia: ultimaHC
        ? {
            medico: (ultimaHC as any).medicoId,
            cita: (ultimaHC as any).citaId,
            fechaInicio: (ultimaHC as any).fechaRegistro,
            objetivo: (ultimaHC as any).analisisyplan ?? null,
            diagnosticos: (ultimaHC as any).diagnosticos ?? []
          }
        : null
    };
  }

  async obtenerIndicaciones(pacienteId: string): Promise<IndicacionActiva[]> {
    const formula = await this.getUltimaFormula(pacienteId);
    if (!formula || !formula.medicamentos?.length) return [];

    const formulaIdStr = String(formula._id);
    const tomas = await AdherenciaToma.find({ formulaMedicaId: formula._id }).lean();
    const conteo = new Map<number, number>();
    for (const t of tomas) conteo.set(t.medicamentoIndex, (conteo.get(t.medicamentoIndex) ?? 0) + 1);

    return formula.medicamentos.map((m: IMedicamento, idx: number) => ({
      formulaMedicaId: formulaIdStr,
      medicamentoIndex: idx,
      denominacionComun: m.denominacionComun,
      concentracion: m.concentracion,
      dosis: m.dosis,
      frecuencia: m.frecuencia,
      viaAdministracion: m.viaAdministracion,
      diasTratamiento: m.diasTratamiento,
      fechaInicio: m.fechaInicio,
      indicaciones: m.indicaciones,
      tomasRegistradas: conteo.get(idx) ?? 0
    }));
  }

  async marcarToma(
    pacienteId: string,
    formulaMedicaId: string,
    medicamentoIndex: number,
    notas?: string
  ) {
    // Verificar que la fórmula pertenezca al paciente
    const formula = await FormulaMedica.findOne({ _id: formulaMedicaId, pacienteId }).select('_id medicamentos').lean<IFormulaMedica | null>();
    if (!formula) throw new Error('Fórmula no encontrada o no pertenece al paciente');
    if (medicamentoIndex < 0 || medicamentoIndex >= (formula.medicamentos?.length ?? 0)) {
      throw new Error('Índice de medicamento inválido');
    }

    return AdherenciaToma.create({
      pacienteId,
      formulaMedicaId,
      medicamentoIndex,
      fechaToma: new Date(),
      notas
    });
  }

  async obtenerRecomendaciones(pacienteId: string): Promise<string[]> {
    const ultimaHC = await HistoriaClinica.findOne({ pacienteId, activo: { $ne: false } })
      .sort({ fechaRegistro: -1 })
      .select('recomendaciones')
      .lean<{ recomendaciones?: string } | null>();

    if (!ultimaHC?.recomendaciones) return [];
    return ultimaHC.recomendaciones
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Hábitos y ejercicios sugeridos. Por ahora no existe modelo dedicado; se devuelve
   * arreglo vacío hasta que el médico tenga UI para registrarlos. TODO.
   */
  async obtenerHabitos(_pacienteId: string): Promise<any[]> {
    return [];
  }
}

export default new PacienteTratamientoService();
