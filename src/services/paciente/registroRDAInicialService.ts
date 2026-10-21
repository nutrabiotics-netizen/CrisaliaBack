import RegistroRDA from '../../models/RegistroRDA';
import Paciente from '../../models/Paciente';
import type { IInterrogatorio } from '../../models/Interrogatorio';
import { proyectarFase1RDA } from '../medico/registroRDA/fase1RDA';
import { AppError } from '../../utils/errors';

/** Borrador del paciente previo a la cita. La inserción es idempotente y nunca modifica un RDA existente. */
export async function guardarRDAInicial(interrogatorio: Pick<IInterrogatorio, '_id' | 'pacienteId' | 'tipo' | 'fase1' | 'respuestas' | 'fase2Generacion'>) {
  if (interrogatorio.tipo !== 'primera_vez' || !interrogatorio.fase1?.confirmada) return null;
  const filtro = { tipoRegistro: 'inicial', pacienteId: interrogatorio.pacienteId,
    'fuenteFase1.interrogatorioId': interrogatorio._id };
  const existente = await RegistroRDA.findOne(filtro).lean();
  if (existente) return existente;
  const paciente = await Paciente.findById(interrogatorio.pacienteId).lean();
  if (!paciente) throw new AppError('Paciente no encontrado', 404);
  const partes = (valor?: string) => (valor || '').trim().split(/\s+/);
  const sexo: Record<string, string> = { masculino: '01', femenino: '02', intersexual: '03' };
  const datos = {
    ...filtro, estado: 'borrador', activo: true, generacionPruebasFase2: interrogatorio.fase2Generacion || 0,
    fuenteFase1: { interrogatorioId: interrogatorio._id, version: interrogatorio.fase1.version, incorporadoEn: new Date() },
    seccionCuenta: {
      primerNombre: paciente.primerNombre || partes(paciente.nombre)[0],
      segundoNombre: paciente.segundoNombre || partes(paciente.nombre).slice(1).join(' ') || undefined,
      primerApellido: paciente.primerApellido || partes(paciente.apellido)[0],
      segundoApellido: paciente.segundoApellido || partes(paciente.apellido).slice(1).join(' ') || undefined,
      telefono: paciente.telefono, correoElectronico: paciente.email, tipoDocumentoCodigo: paciente.tipoDocumento,
      numeroDocumento: paciente.numeroDocumento, sexoBiologico: sexo[paciente.sexoBiologico || ''], fechaNacimiento: paciente.fechaNacimiento,
    },
    seccionInterrogatorioInicial: proyectarFase1RDA(interrogatorio.respuestas || {}),
    creadoPor: interrogatorio.pacienteId, creadoPorRol: 'Paciente', createdAt: new Date(), updatedAt: new Date(),
  };
  // El campo anidado del filtro ya está representado por fuenteFase1; no enviar ambos paths a MongoDB.
  delete (datos as Record<string, unknown>)['fuenteFase1.interrogatorioId'];
  try {
    const registro = await RegistroRDA.findOneAndUpdate(filtro, { $setOnInsert: datos },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false }).lean();
    if (!registro) throw new AppError('No se pudo guardar el borrador RDA', 503);
    return registro;
  } catch (error: any) {
    if (error.code === 11000) {
      const ganador = await RegistroRDA.findOne(filtro).lean();
      if (ganador) return ganador;
    }
    throw error;
  }
}
