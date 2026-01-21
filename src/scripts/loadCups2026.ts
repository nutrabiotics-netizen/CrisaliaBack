import mongoose from 'mongoose';

import Cups2026 from '../models/Cups2026';
import dotenv from 'dotenv';

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para cargar códigos CUPS 2026 desde Excel
 * Ruta del archivo: C:\laragon\www\crisalia\documentos\cups2026.xlsx
 * Estructura: dos columnas (codigo, nombre)
 * Filtra solo filas con códigos válidos (números)
 */

dotenv.config();
const mongoURI = process.env.MONGODB_URI;

const loadCups2026 = async () => {
  try {
    console.log('🚀 Iniciando carga de CUPS 2026...');

    // Conectar a la base de datos principal
    await mongoose.connect(mongoURI!);
    console.log('✅ Conectado a la base de datos principal');

    // Ruta del archivo Excel
    const excelPath = path.join('C:', 'laragon', 'www', 'crisalia', 'documentos', 'cups2026.xlsx');
    
    // Verificar que el archivo existe
    if (!fs.existsSync(excelPath)) {
      console.error(`❌ El archivo no existe en: ${excelPath}`);
      process.exit(1);
    }

    console.log(`📄 Leyendo archivo Excel: ${excelPath}`);

    // Leer el archivo Excel
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, {
      header: ['codigo', 'nombre'],
      defval: '',
      raw: false
    });

    console.log(`📊 Total de filas en Excel: ${data.length}`);

    // Filtrar solo filas con códigos válidos (números)
    // Un código válido es un número (puede tener puntos o ser string numérico)
    const validRows = data.filter((row: any) => {
      const codigo = String(row.codigo || '').trim();
      const nombre = String(row.nombre || '').trim();
      
      // Omitir filas vacías
      if (!codigo && !nombre) {
        return false;
      }
      
      // Omitir filas donde codigo no sea un número válido
      // Verificar que el código sea un número (puede tener puntos como 0101.01)
      // Omitir palabras como "simultaneo:", "incluye:", etc.
      if (!codigo || codigo === '') {
        return false;
      }
      
      // Verificar que el código sea numérico (puede tener puntos)
      // Eliminar puntos para verificar si es numérico
      const codigoSinPuntos = codigo.replace(/\./g, '');
      const esNumerico = /^\d+$/.test(codigoSinPuntos);
      
      // También omitir si contiene letras (excepto si es un código con formato especial)
      if (!esNumerico) {
        // Si contiene letras, no es válido
        return false;
      }
      
      // Debe tener nombre
      if (!nombre || nombre === '') {
        return false;
      }
      
      return true;
    });

    console.log(`✅ Filas válidas encontradas: ${validRows.length}`);
    console.log(`⏭️  Filas omitidas: ${data.length - validRows.length}`);

    if (validRows.length === 0) {
      console.log('❌ No se encontraron filas válidas para procesar');
      process.exit(1);
    }

    // Limpiar colección existente (opcional - comentar si quieres mantener datos anteriores)
    const deletedCount = await Cups2026.deleteMany({});
    console.log(`🗑️  Registros eliminados: ${deletedCount.deletedCount}`);

    // Preparar datos para insertar
    const cupsToInsert = validRows.map((row: any) => ({
      codigo: String(row.codigo).trim(),
      nombre: String(row.nombre).trim()
    }));

    // Eliminar duplicados por código
    const uniqueCups = Array.from(
      new Map(cupsToInsert.map(item => [item.codigo, item])).values()
    );

    console.log(`📝 Registros únicos a insertar: ${uniqueCups.length}`);

    // Insertar en lotes para mejor performance
    const batchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < uniqueCups.length; i += batchSize) {
      const batch = uniqueCups.slice(i, i + batchSize);
      await Cups2026.insertMany(batch, { ordered: false });
      inserted += batch.length;
      console.log(`💾 Progreso: ${inserted}/${uniqueCups.length} registros insertados`);
    }

    console.log(`\n✅ ¡Carga completada exitosamente!`);
    console.log(`📊 Total de registros insertados: ${inserted}`);
    
    // Verificar total en BD
    const totalInDb = await Cups2026.countDocuments();
    console.log(`📚 Total de registros en BD: ${totalInDb}`);

    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error al cargar CUPS 2026:', error);
    
    if (error.code === 11000) {
      console.error('⚠️  Error de duplicados. Algunos códigos ya existen en la base de datos.');
    }
    
    process.exit(1);
  }
};

// Ejecutar el script
loadCups2026();