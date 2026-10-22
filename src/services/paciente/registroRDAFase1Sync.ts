import RegistroRDA from '../../models/RegistroRDA';
import { proyectarFase1RDA } from '../medico/registroRDA/fase1RDA';
import { AppError } from '../../utils/errors';

const grupos = [['identidadGenero'], ['ocupacionCodigo', 'ocupacionNombre'],
  ['indicadorAlergia', 'antecedentesAlergias'], ['estadoAntecedentesFamiliares', 'antecedentesFamiliares'],
  ['estadoAntecedentesFarmacologicos', 'antecedentesFarmacologicos']];
// Los subdocumentos Mongoose añaden _id, que no forma parte de la declaración del paciente.
const normalizar = (v: any): any => Array.isArray(v) ? v.map(normalizar)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => k !== '_id').sort().map(k => [k, normalizar(v[k])])) : v ?? null;
const igual = (a: any, b: any) => JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
const vacio = (v: any) => v == null || v === '' || Array.isArray(v) && v.length === 0;

export async function sincronizarFase1RDA(registro: any, interrogatorio: any) {
  if (!registro || registro.estado !== 'borrador' || registro.activo === false) return registro;
  if (String(registro.pacienteId) !== String(interrogatorio.pacienteId)) return registro;
  const anterior = registro.fuenteFase1;
  if (anterior?.interrogatorioId && String(anterior.interrogatorioId) !== String(interrogatorio._id)) return registro;
  if (anterior?.version > interrogatorio.fase1.version) return registro;
  if ((registro.generacionPruebasFase2 || 0) > (interrogatorio.fase2Generacion || 0)) return registro;
  const actual = registro.seccionInterrogatorioInicial || {}, origen = registro.fuenteRespuestasFase1 || {};
  const nuevo = proyectarFase1RDA(interrogatorio.respuestas || {});
  const cambios: Record<string, any> = {}, fuente = { ...origen };
  for (const grupo of grupos) {
    if (!grupo.some(k => (nuevo as any)[k] !== undefined)) continue;
    const propio = grupo.some(k => Object.prototype.hasOwnProperty.call(origen, k));
    if (!grupo.every(k => propio ? igual(actual[k], origen[k]) : vacio(actual[k]))) continue;
    for (const campo of grupo) {
      const valor = (nuevo as any)[campo];
      if (valor === undefined) continue;
      if (!igual(actual[campo], valor)) cambios[`seccionInterrogatorioInicial.${campo}`] = valor;
      fuente[campo] = valor;
    }
  }
  const versionCambia = !anterior?.interrogatorioId || anterior.version !== interrogatorio.fase1.version;
  if (!versionCambia && !Object.keys(cambios).length) return registro;
  const filtro: Record<string, any> = { _id: registro._id, pacienteId: interrogatorio.pacienteId,
    estado: 'borrador', activo: { $ne: false }, updatedAt: registro.updatedAt };
  for (const campo of ['fuenteFase1', 'fuenteRespuestasFase1', 'seccionInterrogatorioInicial', 'generacionPruebasFase2']) {
    filtro[campo] = registro[campo] === undefined ? { $exists: false } : registro[campo];
  }
  const guardado = await RegistroRDA.findOneAndUpdate(filtro, { $set: { ...cambios,
    fuenteFase1: { interrogatorioId: interrogatorio._id, version: interrogatorio.fase1.version,
      incorporadoEn: anterior?.incorporadoEn || new Date() }, fuenteRespuestasFase1: fuente,
    generacionPruebasFase2: interrogatorio.fase2Generacion || 0,
  } }, { new: true, runValidators: true }).lean();
  if (guardado) return guardado;
  const vigente = await RegistroRDA.findOne({ _id: registro._id, pacienteId: interrogatorio.pacienteId }).lean();
  if (vigente && (vigente.estado !== 'borrador' || vigente.activo === false ||
    String(vigente.fuenteFase1?.interrogatorioId) === String(interrogatorio._id) && (vigente.fuenteFase1?.version ?? -1) >= interrogatorio.fase1.version)) return vigente;
  // La entrevista ya está persistida: un reintento repite solo la sincronización pendiente.
  throw new AppError('La entrevista está guardada, pero el RDA cambió mientras se actualizaba. Reintenta la misma respuesta.', 503);
}
