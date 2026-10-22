import RegistroRDA from '../../models/RegistroRDA';
import { cambiosDemografiaRDA, proyectarDemografiaPaciente } from '../medico/registroRDA/demografiaRDA';

export async function sincronizarDemografiaRegistro(registro: any, paciente: Record<string, any>) {
  if (!registro || registro.estado !== 'borrador' || registro.activo === false) return registro;
  if (paciente._id && String(registro.pacienteId) !== String(paciente._id)) return registro;
  if (registro.fuenteDemografiaPaciente?.actualizadoEn && paciente.updatedAt &&
    new Date(registro.fuenteDemografiaPaciente.actualizadoEn).getTime() > new Date(paciente.updatedAt).getTime()) return registro;
  const cambios = cambiosDemografiaRDA(registro, proyectarDemografiaPaciente(paciente));
  if (!Object.keys(cambios.set).length && !Object.keys(cambios.unset).length) return registro;
  const filtro: Record<string, any> = { _id: registro._id, pacienteId: registro.pacienteId,
    estado: 'borrador', activo: { $ne: false }, updatedAt: registro.updatedAt };
  // Protege también ediciones dentro del mismo milisegundo y escrituras sin timestamps.
  for (const campo of ['seccionCuenta', 'seccionFacturacion', 'fuenteDemografiaPaciente']) {
    filtro[campo] = registro[campo] === undefined ? { $exists: false } : registro[campo];
  }
  return await RegistroRDA.findOneAndUpdate(filtro, { $set: cambios.set, $unset: cambios.unset },
    { new: true, runValidators: true }).lean()
    || await RegistroRDA.findOne({ _id: registro._id, pacienteId: registro.pacienteId }).lean();
}

export async function sincronizarDemografiaPaciente(paciente: any): Promise<void> {
  const registros = await RegistroRDA.find({ pacienteId: paciente._id, estado: 'borrador', activo: { $ne: false } }).lean();
  const datos = typeof paciente.toObject === 'function' ? paciente.toObject() : paciente;
  for (const registro of registros) await sincronizarDemografiaRegistro(registro, datos);
}
