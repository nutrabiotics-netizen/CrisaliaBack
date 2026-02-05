/**
 * Script CLI para importar materiales regulatorios desde un archivo Excel.
 *
 * Uso:
 *   npx ts-node src/scripts/importMaterialesRegulatorios.ts <ruta-al-excel> [codigo-pais]
 *
 * Ejemplos:
 *   npx ts-node src/scripts/importMaterialesRegulatorios.ts ./documentos/materiales.xlsx
 *   npx ts-node src/scripts/importMaterialesRegulatorios.ts ./documentos/materiales.xlsx CO
 *
 * Si se pasa código de país (CO, EC, MX, PE, CR), solo se procesan hojas de ese país.
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
    console.error('Uso: npx ts-node src/scripts/importMaterialesRegulatorios.ts <ruta-al-excel> [codigo-pais]');
    process.exit(1);
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI no está definida en .env');
    }

    await mongoose.connect(mongoURI);
    console.log('✅ Conectado a MongoDB');

    console.log(`📄 Importando desde: ${absolutePath}`);
    if (countryCode) {
      console.log(`🌍 Filtro de país: ${countryCode}`);
    }

    const result = await materialImportService.importFromExcel(absolutePath, countryCode);

    console.log('\n📊 Resultado:');
    console.log(`   Hojas procesadas: ${result.totalSheets}`);
    console.log(`   Filas totales: ${result.totalRows}`);
    console.log(`   Materiales creados: ${result.createdMaterials}`);
    console.log(`   Materiales actualizados: ${result.updatedMaterials}`);
    console.log(`   Errores: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errores por fila:');
      result.errors.forEach((e) => {
        console.log(`   [${e.sheet}] Fila ${e.row}: ${e.message}`);
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
