import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { prepararIndicesRDA } from '../utils/indicesRDA';

dotenv.config({ quiet: true });
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta MONGODB_URI');
  // No cargar modelos ni reconstruir otros índices. Por defecto solo muestra el plan.
  await mongoose.connect(uri, { autoIndex: false });
  try {
    const coleccion = mongoose.connection.db!.collection('registrordas');
    const aplicar = process.argv.includes('--apply');
    const plan = await prepararIndicesRDA(coleccion, aplicar);
    console.log(JSON.stringify({ aplicado: aplicar, coleccion: coleccion.collectionName, plan }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch((error: any) => {
  console.error('No se pudo completar la migración de índices RDA.', { name: error.name, code: error.code, codeName: error.codeName });
  process.exitCode = 1;
});
