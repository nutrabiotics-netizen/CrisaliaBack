import RegistroRDA from '../../models/RegistroRDA';
import Paciente from '../../models/Paciente';
import type { IInterrogatorio } from '../../models/Interrogatorio';
import { proyectarFase1RDA } from '../medico/registroRDA/fase1RDA';
import { AppError } from '../../utils/errors';
import { proyectarDemografiaPaciente } from '../medico/registroRDA/demografiaRDA';
import { sincronizarDemografiaRegistro } from './demografiaRDASyncService';
import { sincronizarFase1RDA } from './registroRDAFase1Sync';

/** Reutiliza el borrador de la cuenta y persiste los grupos clínicos aceptados de fase 1. */
export async function guardarRDAInicial(interrogatorio: Pick<IInterrogatorio, '_id' | 'pacienteId' | 'tipo' | 'fase1' | 'respuestas' | 'fase2Generacion'>) {
  if (interrogatorio.tipo !== 'primera_vez' || !interrogatorio.fase1) return null;
  const filtro = { tipoRegistro: 'inicial', pacienteId: interrogatorio.pacienteId,
    'fuenteFase1.interrogatorioId': interrogatorio._id };
  let existente = await RegistroRDA.findOne(filtro).lean();
  const cuenta = !existente ? await RegistroRDA.findOne({ pacienteId: interrogatorio.pacienteId,
    tipoRegistro: 'inicial', origenCuenta: true }).lean() : null;
  if (!existente && cuenta?.estado === 'borrador' && cuenta.activo !== false && !cuenta.fuenteFase1?.interrogatorioId) existente = cuenta;
  // Compatibilidad: los pacientes anteriores sin borrador de cuenta se incorporan al confirmar.
  if (!existente && !cuenta && !interrogatorio.fase1.confirmada) return null;
  if (existente && (existente.estado !== 'borrador' || existente.activo === false)) return existente;
  const paciente = await Paciente.findById(interrogatorio.pacienteId).lean();
  if (!paciente) throw new AppError('Paciente no encontrado', 404);
  if (existente) return sincronizarFase1RDA(await sincronizarDemografiaRegistro(existente, paciente), interrogatorio);
  const demografia = proyectarDemografiaPaciente(paciente);
  const datos = {
    ...filtro, estado: 'borrador', activo: true, generacionPruebasFase2: interrogatorio.fase2Generacion || 0,
    fuenteFase1: { interrogatorioId: interrogatorio._id, version: interrogatorio.fase1.version, incorporadoEn: new Date() },
    seccionCuenta: demografia.seccionCuenta,
    seccionFacturacion: demografia.seccionFacturacion,
    fuenteDemografiaPaciente: demografia,
    seccionInterrogatorioInicial: proyectarFase1RDA(interrogatorio.respuestas || {}),
    fuenteRespuestasFase1: proyectarFase1RDA(interrogatorio.respuestas || {}),
    creadoPor: interrogatorio.pacienteId, creadoPorRol: 'Paciente', createdAt: new Date(), updatedAt: new Date(),
  };
  // El campo anidado del filtro ya está representado por fuenteFase1; no enviar ambos paths a MongoDB.
  delete (datos as Record<string, unknown>)['fuenteFase1.interrogatorioId'];
  try {
    const registro = await RegistroRDA.findOneAndUpdate(filtro, { $setOnInsert: datos },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false }).lean();
    if (!registro) throw new AppError('No se pudo guardar el borrador RDA', 503);
    return sincronizarFase1RDA(registro, interrogatorio);
  } catch (error: any) {
    if (error.code === 11000) {
      const ganador = await RegistroRDA.findOne(filtro).lean();
      if (ganador) return sincronizarFase1RDA(ganador, interrogatorio);
    }
    throw error;
  }
}
