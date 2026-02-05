/**
 * Script CLI para importar materiales regulatorios desde un archivo JSON.
 *
 * Uso:
 *   npm run import-materiales-json -- <ruta-al-json> [codigo-pais]
 *
 * Ejemplos:
 *   npm run import-materiales-json -- ./documentos/materiales.json
 *   npm run import-materiales-json -- ./src/data/materiales-import-ejemplo.json CO
 *
 * Estructura del JSON: ver src/data/materiales-import-ejemplo.json o README en services/materialImport.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { materialImportService } from '../services/materialImport/materialImport.service';

dotenv.config();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const countryCode = args[1];

  if (!filePath) {
    console.error(
      'Uso: npm run import-materiales-json -- <ruta-al-json> [codigo-pais]'
    );
    process.exit(1);
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI no está definida en .env');
    }

    await mongoose.connect(mongoURI);
    console.log('✅ Conectado a MongoDB');

    console.log(`📄 Importando desde JSON: ${absolutePath}`);
    if (countryCode) {
      console.log(`🌍 Filtro de país: ${countryCode}`);
    }

    const result = await materialImportService.importFromJsonFile(
      absolutePath,
      countryCode
    );

    console.log('\n📊 Resultado:');
    console.log(`   Ítems procesados: ${result.totalRows}`);
    console.log(`   Materiales creados: ${result.createdMaterials}`);
    console.log(`   Materiales actualizados: ${result.updatedMaterials}`);
    console.log(`   Errores: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errores:');
      result.errors.forEach((e) => {
        console.log(`   [${e.sheet}] Ítem ${e.row}: ${e.message}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
