/**
 * Carga masiva del catálogo CIE-10 desde un CSV.
 *
 * Uso:
 *   npm run load-cie10 -- <ruta-csv> [--truncate]
 *
 * Ejemplo:
 *   npm run load-cie10 -- ./assets/cie10_colombia.csv
 *   npm run load-cie10 -- ./assets/cie10_colombia.csv --truncate
 *
 * El parser detecta automáticamente columnas con nombres comunes:
 *   - codigo / cod / code / icd10code / cie10
 *   - descripcion / description / nombre / icd10title / descripcion_4_caracteres
 *   - capitulo / chapter
 *   - grupo / group
 *   - genero / sexo
 *   - edad_min / edadMin / age_min
 *   - edad_max / edadMax / age_max
 *
 * Separadores soportados: coma, punto y coma, tabulación.
 * Codificación: UTF-8 o latin-1 (auto-detección básica).
 *
 * Fuente recomendada del CSV (Colombia):
 *   - SISPRO / Ministerio de Salud — Resolución 2358 de 2014
 *   - https://www.datos.gov.co (buscar "CIE-10")
 *   - Backup en assets/cie10_colombia.csv
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import Cie10 from '../models/Cie10';
import { connectDB } from '../config/database';

dotenv.config();

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const truncate = args.includes('--truncate');

if (!csvPath) {
  console.error('❌ Falta la ruta del CSV. Uso: npm run load-cie10 -- <ruta-csv> [--truncate]');
  process.exit(1);
}

const absPath = path.resolve(csvPath);
if (!fs.existsSync(absPath)) {
  console.error(`❌ Archivo no encontrado: ${absPath}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────
// Parser CSV manual (sin dependencias) — soporta separadores y comillas
// ─────────────────────────────────────────────────────────────────────

function detectSeparator(headerLine: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = headerLine.split(c).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Mapeo de aliases comunes a campos del modelo
const FIELD_ALIASES: Record<string, string> = {
  // codigo
  codigo: 'codigo',
  cod: 'codigo',
  code: 'codigo',
  icd10code: 'codigo',
  icd_10_code: 'codigo',
  cie10: 'codigo',
  cie_10: 'codigo',
  // descripcion
  descripcion: 'descripcion',
  description: 'descripcion',
  nombre: 'descripcion',
  icd10title: 'descripcion',
  icd_10_title: 'descripcion',
  descripcion_4_caracteres: 'descripcion',
  descripcion_3_caracteres: 'descripcion',
  // capitulo
  capitulo: 'capitulo',
  chapter: 'capitulo',
  capitulo_descripcion: 'capitulo',
  // grupo
  grupo: 'grupo',
  group: 'grupo',
  // genero
  genero: 'genero',
  sexo: 'genero',
  gender: 'genero',
  // edad
  edad_min: 'edadMin',
  edadmin: 'edadMin',
  age_min: 'edadMin',
  edad_max: 'edadMax',
  edadmax: 'edadMax',
  age_max: 'edadMax'
};

/**
 * Convierte el código del formato DANE/SISPRO (sin punto, 4 chars: A009)
 * al formato estándar CIE-10 con punto (A00.9).
 *
 * Reglas:
 *  - Si ya trae punto: lo deja como está.
 *  - Si son 4 chars [A-Z][0-9]{3}: inserta punto después del tercer char → A00.9
 *  - Si son 3 chars [A-Z][0-9]{2}: lo deja como está → A09
 *  - Si termina en X (padding SISPRO): lo recorta → I10X → I10
 *  - Cualquier otra cosa: lo deja como llegó.
 */
function normalizarCodigoCie10(raw: string): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9.]/g, '').trim();
  if (!s) return s;
  if (s.includes('.')) return s;
  // Padding SISPRO: I10X → I10
  if (s.length === 4 && s.endsWith('X') && /^[A-Z]\d{2}X$/.test(s)) {
    return s.slice(0, 3);
  }
  // Formato 4 caracteres SISPRO: A009 → A00.9
  if (s.length === 4 && /^[A-Z]\d{3}$/.test(s)) {
    return `${s.slice(0, 3)}.${s.slice(3)}`;
  }
  // Formato 5 caracteres (códigos extendidos raros): E1190 → E11.90
  if (s.length === 5 && /^[A-Z]\d{4}$/.test(s)) {
    return `${s.slice(0, 3)}.${s.slice(3)}`;
  }
  return s;
}

function mapGenero(raw: string): 'M' | 'F' | 'AMBOS' {
  if (!raw) return 'AMBOS';
  const v = raw.toUpperCase().trim();
  if (v === 'M' || v === 'MASCULINO' || v === 'H' || v === '1') return 'M';
  if (v === 'F' || v === 'FEMENINO' || v === 'MUJER' || v === '2') return 'F';
  return 'AMBOS';
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

function leerArchivoComoLineas(absPath: string): { lines: string[]; sep: string } {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    console.log(`📊 Detectado archivo Excel (${ext})`);
    const wb = XLSX.readFile(absPath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    // Convertir a array de filas (cada fila es un array de celdas)
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false
    });
    // Convertir a "líneas CSV" usando '' como separador interno seguro
    const SEP = '';
    const lines = rows
      .filter((r) => r.some((c) => String(c).trim().length > 0))
      .map((r) => r.map((c) => String(c).trim()).join(SEP));
    return { lines, sep: SEP };
  }
  // CSV / TSV
  const raw = fs.readFileSync(absPath, 'utf-8');
  const content = raw.replace(/^﻿/, '');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sep = detectSeparator(lines[0]);
  return { lines, sep };
}

async function main(): Promise<void> {
  console.log(`📄 Leyendo ${absPath}…`);
  const { lines, sep } = leerArchivoComoLineas(absPath);
  if (lines.length < 2) {
    console.error('❌ Archivo vacío o sin filas de datos');
    process.exit(1);
  }
  console.log(`🔎 Separador: "${sep === '\t' ? '\\t' : sep === '' ? 'xlsx-internal' : sep}"`);

  const rawHeaders = parseCsvLine(lines[0], sep).map(normalizeHeader);
  const colMap: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    const field = FIELD_ALIASES[h];
    if (field && colMap[field] === undefined) colMap[field] = i;
  });

  if (colMap.codigo === undefined || colMap.descripcion === undefined) {
    console.error('❌ El CSV debe tener al menos columnas "codigo" y "descripcion".');
    console.error('   Headers detectados:', rawHeaders.join(' | '));
    process.exit(1);
  }

  console.log('🗺  Columnas mapeadas:', colMap);

  await connectDB();
  console.log('✅ Conectado a MongoDB');

  if (truncate) {
    console.log('🗑  --truncate: borrando catálogo CIE-10 existente…');
    await Cie10.deleteMany({});
  }

  let processed = 0;
  let upserted = 0;
  let errors = 0;
  const batch: any[] = [];
  const BATCH_SIZE = 500;

  async function flushBatch(): Promise<void> {
    if (batch.length === 0) return;
    try {
      const result = await Cie10.bulkWrite(
        batch.map((doc) => ({
          updateOne: {
            filter: { codigo: doc.codigo },
            update: { $set: doc },
            upsert: true
          }
        })),
        { ordered: false }
      );
      upserted += (result.upsertedCount || 0) + (result.modifiedCount || 0);
    } catch (err) {
      console.error('⚠ Error en bulkWrite:', (err as Error).message);
      errors += batch.length;
    }
    batch.length = 0;
  }

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i], sep);
    if (parts.length === 0) continue;
    const codigo = normalizarCodigoCie10(parts[colMap.codigo] ?? '');
    const descripcion = (parts[colMap.descripcion] ?? '').trim();
    if (!codigo || !descripcion) continue;

    const doc: any = {
      codigo,
      descripcion,
      activo: true,
      // Cabecera: códigos de 3 chars (letra + 2 dígitos) sin punto
      esCabecera: !codigo.includes('.') && codigo.length === 3
    };
    if (colMap.capitulo !== undefined) doc.capitulo = (parts[colMap.capitulo] ?? '').trim() || undefined;
    if (colMap.grupo !== undefined) doc.grupo = (parts[colMap.grupo] ?? '').trim() || undefined;
    if (colMap.genero !== undefined) doc.genero = mapGenero(parts[colMap.genero] ?? '');
    if (colMap.edadMin !== undefined) {
      const v = parseInt(parts[colMap.edadMin] ?? '', 10);
      if (!isNaN(v) && v >= 0 && v <= 120) doc.edadMin = v;
    }
    if (colMap.edadMax !== undefined) {
      const v = parseInt(parts[colMap.edadMax] ?? '', 10);
      if (!isNaN(v) && v >= 0 && v <= 120) doc.edadMax = v;
    }

    batch.push(doc);
    processed++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
      if (processed % 2000 === 0) {
        console.log(`   … procesados ${processed}, upserted ${upserted}`);
      }
    }
  }
  await flushBatch();

  console.log('\n📊 Resultado:');
  console.log(`   filas procesadas: ${processed}`);
  console.log(`   upserts exitosos: ${upserted}`);
  console.log(`   errores:          ${errors}`);

  const total = await Cie10.countDocuments({ activo: true });
  console.log(`   total en DB:      ${total}`);

  await mongoose.connection.close();
  console.log('\n✅ Carga completada.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fallo cargando CIE-10:', err);
  process.exit(1);
});
