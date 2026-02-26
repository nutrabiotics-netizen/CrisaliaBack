import mongoose from 'mongoose';
import ParametroNutrabiotics from '../models/ParametroNutrabiotics';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para cargar parámetros Nutrabiotics desde Excel
 * Archivo: documentos/INFO PARAMETROS _Nutrabiotics (1).xlsx
 * Columnas: CODIGOPARAMETRO, NOMBRE, PARA_QUE_SIRVE, CUPS, ACTIVO
 */

dotenv.config();
const mongoURI = process.env.MONGODB_URI;

const loadParametrosNutrabiotics = async () => {
  try {
    console.log('🚀 Iniciando carga de Parámetros Nutrabiotics...');

    await mongoose.connect(mongoURI!);
    console.log('✅ Conectado a la base de datos');

    const fileName = 'INFO PARAMETROS _Nutrabiotics (1).xlsx';
    const excelPath =
      fs.existsSync(path.join(process.cwd(), 'documentos', fileName))
        ? path.join(process.cwd(), 'documentos', fileName)
        : path.join(process.cwd(), '..', 'documentos', fileName);

    if (!fs.existsSync(excelPath)) {
      console.error(`❌ El archivo no existe: ${excelPath}`);
      process.exit(1);
    }

    console.log(`📄 Leyendo: ${excelPath}`);

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data: any[] = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false
    });

    console.log(`📊 Total filas en Excel: ${data.length}`);

    const validRows = data.filter((row: any) => {
      const codigo = String(row.CODIGOPARAMETRO ?? row.codigoparametro ?? '').trim();
      const nombre = String(row.NOMBRE ?? row.nombre ?? '').trim();
      if (!codigo || !nombre || codigo === 'CODIGOPARAMETRO') return false;
      return true;
    });

    console.log(`✅ Filas válidas: ${validRows.length}`);

    const get = (row: any, ...keys: string[]) => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null) return String(v).trim();
      }
      return '';
    };
    const toInsert = validRows.map((row: any) => ({
      codigoParametro: get(row, 'CODIGOPARAMETRO', 'codigoparametro'),
      nombre: get(row, 'NOMBRE', 'nombre'),
      paraQueSirve: get(row, 'PARA_QUE_SIRVE', 'para_que_sirve') || '',
      codigoCups: get(row, 'CUPS', 'cups') || '',
      activo: /true/i.test(String(row.ACTIVO ?? row.activo ?? ''))
    }));

    const uniqueByCodigo = Array.from(
      new Map(toInsert.map((item: any) => [item.codigoParametro, item])).values()
    );

    console.log(`📝 Registros únicos a insertar: ${uniqueByCodigo.length}`);

    await ParametroNutrabiotics.deleteMany({});
    console.log('🗑️  Colección limpiada');

    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < uniqueByCodigo.length; i += batchSize) {
      const batch = (uniqueByCodigo as any[]).slice(i, i + batchSize);
      await ParametroNutrabiotics.insertMany(batch, { ordered: false });
      inserted += batch.length;
      console.log(`💾 Progreso: ${inserted}/${uniqueByCodigo.length}`);
    }

    const totalInDb = await ParametroNutrabiotics.countDocuments();
    console.log(`\n✅ Carga completada. Total en BD: ${totalInDb}`);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

loadParametrosNutrabiotics();
