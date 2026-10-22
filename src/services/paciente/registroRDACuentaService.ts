import RegistroRDA from '../../models/RegistroRDA';
import { proyectarDemografiaPaciente } from '../medico/registroRDA/demografiaRDA';
import { AppError } from '../../utils/errors';

/** Un borrador por cuenta; compatible con pacientes que ya tienen un RDA anterior. */
export async function crearRDACuenta(paciente: any) {
  const filtro = { pacienteId: paciente._id, tipoRegistro: 'inicial', origenCuenta: true };
  const existente = await RegistroRDA.findOne(filtro).lean()
    || await RegistroRDA.findOne({ pacienteId: paciente._id, tipoRegistro: 'inicial' }).sort({ createdAt: 1 }).lean();
  if (existente) return existente;
  const perfil = typeof paciente.toObject === 'function' ? paciente.toObject() : paciente;
  const demografia = proyectarDemografiaPaciente(perfil);
  try {
    const registro = await RegistroRDA.findOneAndUpdate(filtro, { $setOnInsert: { ...filtro,
      estado: 'borrador', activo: true, generacionPruebasFase2: 0,
      seccionCuenta: demografia.seccionCuenta, seccionFacturacion: demografia.seccionFacturacion,
      fuenteDemografiaPaciente: demografia,
      creadoPor: paciente._id, creadoPorRol: 'Paciente', createdAt: new Date(), updatedAt: new Date(),
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false }).lean();
    if (!registro) throw new AppError('No se pudo crear el borrador RDA de la cuenta', 503);
    return registro;
  } catch (error: any) {
    if (error.code === 11000) {
      const ganador = await RegistroRDA.findOne(filtro).lean();
      if (ganador) return ganador;
    }
    throw error;
  }
}
