import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Material from '../models/Material';

dotenv.config();

const ETIQUETAS_PATH = path.resolve(__dirname, '../../../documentos/etiquetas_mockups.xlsx');
const HORMONAS_PATH = path.resolve(__dirname, '../../../documentos/hormonas.xlsx');

function normalizeString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function generateCodigoFromNombre(nombre: string): string {
  const n = normalizeString(nombre);
  if (!n) return '';
  const sinAcentos = n
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = sinAcentos
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
  return slug || '';
}

function normalizeHeader(h: string): string {
  return String(h ?? '').replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim().toUpperCase();
}

function getHeaderKey(headers: string[], possibleNames: string[]): string | undefined {
  return headers.find(h => possibleNames.some(p => h.includes(p)));
}

async function processExcel(filePath: string, fileType: 'etiquetas' | 'hormonas') {
  if (!fs.existsSync(filePath)) {
    console.warn(`Archivo no encontrado: ${filePath}`);
    return;
  }

  const workbook = XLSX.readFile(filePath, { type: 'file', raw: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.warn(`No hay hojas en: ${filePath}`);
    return;
  }

  const rawRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '', raw: false }) as string[][];
  if (rawRows.length < 2) return;

  const rawHeaders = (rawRows[0] ?? []).map(normalizeHeader);
  
  const headers = {
    producto: getHeaderKey(rawHeaders, ['PRODUCTO']),
    formaFarmaceutica: getHeaderKey(rawHeaders, ['FORMA FARMACEUTICA', 'FORMULA FARMACEUTICA']),
    concentracion: getHeaderKey(rawHeaders, ['CONCENTRACIÓN', 'CONCENTRACION']),
    unidadMedida: getHeaderKey(rawHeaders, ['UNIDAD DE MEDIDA']),
    viaAdministracion: getHeaderKey(rawHeaders, ['VIA DE ADMINISTRACIÓN', 'VIA DE ADMINISTRACION']),
    presentacion: getHeaderKey(rawHeaders, ['PRESENTACION', 'PRESENTACIÓN']),
    recomendacionesUso: getHeaderKey(rawHeaders, ['RECOMENDACIONES DE USO']),
    marcas: getHeaderKey(rawHeaders, ['MARCAS', 'MARCA']),
    registroSanitario: getHeaderKey(rawHeaders, ['REGISTRO SANITARIO COLOMBIA', 'REGISTRO SANITARIO']),
    categoria: getHeaderKey(rawHeaders, ['CATEGORIA', 'CATEGORÍA']),
    descripcion: getHeaderKey(rawHeaders, ['DESCRIPCION', 'DESCRIPCIÓN']),
    composicion: getHeaderKey(rawHeaders, ['COMPOSICION', 'COMPOSICIÓN']),
  };

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const cells = rawRows[i] ?? [];
    const obj: Record<string, string> = {};
    rawHeaders.forEach((h, j) => {
      obj[h] = normalizeString(cells[j]);
    });
    const hasAnyData = rawHeaders.some(h => obj[h] !== '');
    if (hasAnyData) rows.push(obj);
  }

  // Handle merged cells missing PRODUCTO
  let currentProducto = '';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prodCol = headers.producto;
    if (prodCol && row[prodCol]) {
      currentProducto = row[prodCol];
    } else if (prodCol && !row[prodCol] && currentProducto) {
      row[prodCol] = currentProducto;
    }
  }

  let upsertedCount = 0;

  for (const row of rows) {
    const nombre = headers.producto ? row[headers.producto] : '';
    if (!nombre) continue;

    const codigo = generateCodigoFromNombre(nombre);
    if (!codigo) continue;

    const presentacionText = headers.presentacion ? row[headers.presentacion] : '';

    const payload = {
      codigo,
      nombre,
      marca: headers.marcas ? row[headers.marcas] : '',
      formaFarmaceutica: headers.formaFarmaceutica ? row[headers.formaFarmaceutica] : '',
      concentracion: headers.concentracion ? row[headers.concentracion] : '',
      unidadMedida: headers.unidadMedida ? row[headers.unidadMedida] : '',
      viaAdministracion: headers.viaAdministracion ? row[headers.viaAdministracion] : '',
      presentacion: presentacionText,
      recomendacionesUso: headers.recomendacionesUso ? row[headers.recomendacionesUso] : '',
      registroSanitario: headers.registroSanitario ? row[headers.registroSanitario] : '',
      categoria: headers.categoria ? row[headers.categoria] : '',
      descripcion: headers.descripcion ? row[headers.descripcion] : '',
      composicion: headers.composicion ? row[headers.composicion] : '',
    };
    
    // Legacy support logic
    const basePresentaciones = [];
    if (presentacionText) {
      basePresentaciones.push({ nombre: presentacionText, mockup: '' });
    }

    try {
      const existing = await Material.findOne({ codigo });
      if (existing) {
        Object.assign(existing, payload);
        if (presentacionText && !existing.presentaciones?.some((p: any) => p.nombre === presentacionText)) {
            existing.presentaciones = existing.presentaciones || [];
            existing.presentaciones.push({ nombre: presentacionText, mockup: '' });
        }
        await existing.save();
      } else {
        await Material.create({
          ...payload,
          presentaciones: basePresentaciones
        });
      }
      upsertedCount++;
    } catch (e: any) {
      console.error(`Error guardando ${nombre}:`, e.message);
    }
  }

  console.log(`Procesados ${upsertedCount} registros de ${fileType}`);
}

async function main() {
  console.log('Iniciando importacion...');
  
  if (!process.env.MONGODB_URI) {
    console.error('No MONGODB_URI in environment!');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB conectado');

    console.log('Eliminando materiales anteriores...');
    await Material.deleteMany({});
    console.log('Base de datos limpia.');

    console.log('Processing Etiquetas y Mockups...');
    await processExcel(ETIQUETAS_PATH, 'etiquetas');

    console.log('Processing Hormonas...');
    await processExcel(HORMONAS_PATH, 'hormonas');

    console.log('Proceso completado.');
  } catch (error) {
    console.error('Error general:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB desconectado');
  }
}

main();
