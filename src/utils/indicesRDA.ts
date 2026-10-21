import type { mongo } from 'mongoose';

/** Migración acotada: crea primero los reemplazos y solo después retira el índice incompatible. */
export async function prepararIndicesRDA(coleccion: mongo.Collection, aplicar = false): Promise<string[]> {
  const indices = await coleccion.indexes().catch((error: any) => {
    if (error.code === 26) return []; // Base nueva: createIndex creará la colección.
    throw error;
  });
  const antiguo = indices.find(i => i.unique && !i.partialFilterExpression && !i.sparse &&
    Object.keys(i.key).length === 1 && i.key.citaId === 1);
  const plan = ['Crear/verificar rda_cita_unica (único, solo citaId de tipo ObjectId)',
    'Crear/verificar rda_inicial_por_interrogatorio (único, solo borradores iniciales)'];
  if (antiguo) plan.push(`Retirar índice antiguo ${antiguo.name}; conserva la unicidad de las citas mediante rda_cita_unica`);
  if (aplicar) {
    await coleccion.createIndex({ citaId: 1 }, { name: 'rda_cita_unica', unique: true, partialFilterExpression: { citaId: { $type: 'objectId' } } });
    await coleccion.createIndex({ 'fuenteFase1.interrogatorioId': 1 }, { name: 'rda_inicial_por_interrogatorio', unique: true,
      partialFilterExpression: { tipoRegistro: 'inicial', 'fuenteFase1.interrogatorioId': { $type: 'objectId' } } });
    if (antiguo?.name) await coleccion.dropIndex(antiguo.name);
  }
  return plan;
}
