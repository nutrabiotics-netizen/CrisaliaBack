import RegistroRDA from '../../models/RegistroRDA';
import { guardarRDAInicial } from './registroRDAInicialService';
import { esAntecedentePersonal, esAntecedenteReferido } from '../ai/antecedentesCIE10';
import { AppError } from '../../utils/errors';

export function proyectarAntecedentesPersonales(respuestas: Record<string, unknown>) {
  return Object.entries(respuestas).filter(([id, r]) => esAntecedentePersonal(id) && esAntecedenteReferido(r)).sort(([a], [b]) => a.localeCompare(b))
    .map(([preguntaId, dato]) => {
      if (!esAntecedenteReferido(dato)) throw Error('Antecedente inválido');
      return { preguntaId, estadoDeclaracion: dato.estado, textoOriginal: dato.textoOriginal, aclaraciones: dato.aclaraciones,
        sugerencias: dato.enfermedades.map(e => ({ codigoCIE10: e.codigo, nombreCIE10: e.nombre, textoOriginal: e.textoOriginal,
          estadoCodificacion: e.estadoCodificacion, requiereRevisionMedica: true })) };
    });
}
const normalizar = (v: any): any => Array.isArray(v) ? v.map(normalizar) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).filter(k => k !== '_id').sort().map(k => [k, normalizar(v[k])])) : v;
const igual = (a: any, b: any) => JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));

/** Se guarda como antecedente referido, separado de los diagnósticos confirmados por el médico. */
export async function guardarAntecedentesPersonalesRDA(doc: any) {
  const datos = proyectarAntecedentesPersonales(doc.respuestas || {});
  if (!datos.length || doc.tipo !== 'primera_vez' || !doc.fase1) return;
  const registro = await guardarRDAInicial(doc);
  if (!registro || registro.estado !== 'borrador' || registro.activo === false) return;
  const fuente = registro.fuenteAntecedentesPersonales;
  if (fuente && (String(fuente.interrogatorioId) !== String(doc._id) || fuente.generacion > (doc.fase2Generacion || 0) ||
    fuente.generacion === (doc.fase2Generacion || 0) && fuente.version > doc.fase2.version)) return;
  const actual = registro.seccionInterrogatorioPrincipal?.antecedentesPersonalesReferidos;
  // Conservar cualquier revisión del médico que se aparte de la copia inicial del paciente.
  if (fuente ? !igual(actual, fuente.datos) : !!actual?.length) return;
  if (igual(actual, datos) && fuente?.version === doc.fase2.version && fuente?.generacion === (doc.fase2Generacion || 0)) return;
  const guardado = await RegistroRDA.findOneAndUpdate({ _id: registro._id, pacienteId: doc.pacienteId, estado: 'borrador',
    activo: { $ne: false }, updatedAt: registro.updatedAt }, { $set: { 'seccionInterrogatorioPrincipal.antecedentesPersonalesReferidos': datos,
      fuenteAntecedentesPersonales: { interrogatorioId: doc._id, generacion: doc.fase2Generacion || 0, version: doc.fase2.version, datos } } },
  { new: true, runValidators: true }).lean();
  if (!guardado) throw new AppError('Tu respuesta está guardada; falta actualizar el RDA. Reintenta la misma respuesta.', 503);
}
