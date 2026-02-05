/**
 * Lee el Excel co.xlsx (Colombia), agrupa por producto y actualiza/completa
 * el objeto paises.CO en materiales_MULTI_PAIS.json.
 *
 * Uso: npx ts-node src/scripts/mergeCoExcelToMultiPaisJson.ts
 *
 * Rutas por defecto:
 *   Excel:  ../../documentos/co.xlsx
 *   JSON:   C:\Users\Mnuel\Downloads\materiales_MULTI_PAIS.json (o argumento)
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const EXCEL_PATH = path.resolve(__dirname, '../../../documentos/co.xlsx');
const JSON_PATH = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'materiales_MULTI_PAIS.json');

function normalizeHeader(h: string): string {
  return String(h ?? '').replace(/\r\n/g, ' ').trim();
}

function normalizeForMatch(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\u00AE/g, '') // ®
    .trim()
    .toUpperCase();
}

/** Versión más agresiva: sin acentos, sin guiones/puntos, para match flexible */
function normalizeStrict(s: string): string {
  return normalizeForMatch(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\s\-._]/g, '')
    .trim();
}

interface ExcelRow {
  PRODUCTO?: string;
  PRESENTACION?: string;
  'LINKS MOCKUPS'?: string;
  MARCAS?: string;
  'LINKS RÓTULOS'?: string;
  'REGISTRO SANITARIO COLOMBIA'?: string;
  'RÓTULO'?: string;
  CATEGORIA?: string;
  'TEXTOS OBLIGATORIOS'?: string;
  'CLAIM LOGO'?: string;
  DESCRIPCION?: string;
  [key: string]: string | undefined;
}

interface CoData {
  registroSanitario: string;
  categoriaLocal: string;
  textosObligatorios: string;
  advertencias: string;
  precauciones: string;
  usoPosologia: string;
  textoRegulatorio: string;
  claimLogo: string;
  descripcionLocal: string;
  composicion: string;
  presentaciones: Array<{ nombre: string; mockup: string }>;
  mockups: string[];
  linksRotulos: string[];
  estadoRegulatorio: string;
}

function trimVal(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function readExcelCo(filePath: string): Map<string, CoData> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath, { type: 'file', raw: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('No hay hoja en el Excel');

  const rawRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '', raw: false }) as string[][];
  if (rawRows.length < 2) return new Map();

  const rawHeaders = (rawRows[0] ?? []).map((h) => normalizeHeader(h));
  const rows: ExcelRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const cells = rawRows[i] ?? [];
    const obj: ExcelRow = {};
    rawHeaders.forEach((h, j) => {
      obj[h] = trimVal(cells[j]);
    });
    const hasAnyData = rawHeaders.some((h) => trimVal(obj[h]) !== '');
    if (hasAnyData) rows.push(obj);
  }

  // Propagar celdas vacías desde fila anterior (merged cells): mismo producto en varias filas
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    for (const key of Object.keys(curr)) {
      const v = trimVal(curr[key]);
      if (v === '' && prev[key]) {
        const p = trimVal(prev[key]);
        if (p !== '') (curr as Record<string, string>)[key] = p;
      }
    }
  }
  for (let i = rows.length - 2; i >= 0; i--) {
    const next = rows[i + 1];
    const curr = rows[i];
    for (const key of Object.keys(curr)) {
      const v = trimVal(curr[key]);
      if (v === '' && next[key]) {
        const n = trimVal(next[key]);
        if (n !== '') (curr as Record<string, string>)[key] = n;
      }
    }
  }

  // Agrupar por PRODUCTO: todas las filas con el mismo producto (incl. las que solo difieren en PRESENTACION)
  const byProduct = new Map<string, ExcelRow[]>();
  for (const row of rows) {
    const product = trimVal(row.PRODUCTO);
    if (!product) continue;
    const key = normalizeForMatch(product);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(row);
  }

  const result = new Map<string, CoData>();
  for (const [key, group] of byProduct) {
    const first = group[0]!;
    const presentaciones: Array<{ nombre: string; mockup: string }> = [];
    const linksRotulosSet = new Set<string>();
    const mockupsSet = new Set<string>();

    for (const row of group) {
      const pres = trimVal(row.PRESENTACION);
      const mockup = trimVal(row['LINKS MOCKUPS']);
      if (pres && pres.toLowerCase() !== 'nan') {
        presentaciones.push({ nombre: pres, mockup: mockup && mockup.toLowerCase() !== 'nan' ? mockup : '' });
      }
      const linkRot = trimVal(row['LINKS RÓTULOS']);
      if (linkRot && linkRot.toLowerCase() !== 'nan') linksRotulosSet.add(linkRot);
      const rotulo = trimVal(row['RÓTULO']);
      if (rotulo && rotulo.toLowerCase() !== 'nan') linksRotulosSet.add(rotulo);
      if (mockup && mockup.toLowerCase() !== 'nan') mockupsSet.add(mockup);
    }

    const registroSanitario = trimVal(first['REGISTRO SANITARIO COLOMBIA']);
    const categoriaLocal = trimVal(first.CATEGORIA);
    const textosObligatorios = trimVal(first['TEXTOS OBLIGATORIOS']);
    const claimLogo = trimVal(first['CLAIM LOGO']);
    const descripcionLocal = trimVal(first.DESCRIPCION);
    const composicionKey = Object.keys(first).find((k) => k.trim().toUpperCase().startsWith('COMPOSICION'));
    const composicion = composicionKey ? trimVal(first[composicionKey]) : '';

    const coData: CoData = {
      registroSanitario,
      categoriaLocal,
      textosObligatorios,
      advertencias: '',
      precauciones: '',
      usoPosologia: '',
      textoRegulatorio: '',
      claimLogo: claimLogo === '0' ? '' : claimLogo,
      descripcionLocal,
      composicion,
      presentaciones: presentaciones.length > 0 ? presentaciones : [{ nombre: '', mockup: '' }].filter((p) => p.nombre),
      mockups: Array.from(mockupsSet),
      linksRotulos: Array.from(linksRotulosSet),
      estadoRegulatorio: 'aprobado',
    };
    result.set(key, coData);
  }
  return result;
}

function getCoData(
  coByProduct: Map<string, CoData>,
  coByProductStrict: Map<string, CoData>,
  nombre: string,
  codigo: string
): CoData | undefined {
  const keyByNombre = normalizeForMatch(nombre);
  const keyByCodigo = normalizeForMatch(codigo);
  const baseNombre = keyByNombre.split(/\s*[(\n]/)[0]?.trim() || keyByNombre;
  const baseCodigo = keyByCodigo.split(/\s*[(\n]/)[0]?.trim() || keyByCodigo;
  const co = coByProduct.get(keyByNombre) ?? coByProduct.get(keyByCodigo) ?? coByProduct.get(baseNombre) ?? coByProduct.get(baseCodigo);
  if (co) return co;
  const excelKey = Array.from(coByProduct.keys()).find((k) => {
    const baseExcel = k.split(/\s*[(\n]/)[0]?.trim() || k;
    return baseExcel === baseNombre || baseExcel === baseCodigo || baseNombre.startsWith(baseExcel) || baseExcel.startsWith(baseNombre);
  });
  if (excelKey) return coByProduct.get(excelKey);
  const strictNombre = normalizeStrict(nombre);
  const strictCodigo = normalizeStrict(codigo);
  return coByProductStrict.get(strictNombre) ?? coByProductStrict.get(strictCodigo);
}

/** Une presentaciones del Excel con las que ya tenía el JSON; cada presentación del Excel se añade (por nombre se evitan duplicados). */
function mergePresentaciones(
  existing: unknown,
  fromExcel: Array<{ nombre: string; mockup: string }>
): Array<{ nombre: string; mockup: string }> {
  const list: Array<{ nombre: string; mockup: string }> = [];
  const namesSeen = new Set<string>();
  const add = (p: { nombre: string; mockup?: string }) => {
    const n = trimVal(p.nombre);
    if (!n) return;
    const key = n.toUpperCase();
    if (namesSeen.has(key)) return;
    namesSeen.add(key);
    list.push({ nombre: n, mockup: trimVal(p.mockup) || '' });
  };
  if (Array.isArray(existing)) {
    for (const p of existing) {
      if (p && typeof p === 'object' && 'nombre' in p) add(p as { nombre: string; mockup?: string });
    }
  }
  for (const p of fromExcel) add(p);
  return list;
}

interface MaterialItem {
  codigo?: string;
  nombre?: string;
  marca?: string;
  categoriaGeneral?: string;
  descripcionBase?: string;
  paises?: Record<string, unknown>;
}

interface MultiPaisJson {
  materiales: MaterialItem[];
}

function main(): void {
  console.log('Leyendo Excel:', EXCEL_PATH);
  const coByProduct = readExcelCo(EXCEL_PATH);
  const coByProductStrict = new Map<string, CoData>();
  for (const [k, v] of coByProduct) coByProductStrict.set(normalizeStrict(k), v);
  console.log('Productos en Excel CO:', coByProduct.size);

  console.log('Leyendo JSON:', JSON_PATH);
  const jsonContent = fs.readFileSync(JSON_PATH, 'utf-8');
  const data: MultiPaisJson = JSON.parse(jsonContent);
  const materiales = data.materiales || [];
  console.log('Materiales en JSON:', materiales.length);

  let updated = 0;
  let created = 0;
  const notMatched: string[] = [];

  for (const mat of materiales) {
    const nombre = trimVal(mat.nombre);
    const codigo = trimVal(mat.codigo);
    const coData = getCoData(coByProduct, coByProductStrict, nombre, codigo);
    if (!coData) {
      notMatched.push(nombre || codigo || 'sin nombre');
      continue;
    }

    if (!mat.paises) mat.paises = {};
    const existingCo = mat.paises['CO'] as Record<string, unknown> | undefined;
    if (existingCo) {
      updated++;
      Object.assign(existingCo, {
        registroSanitario: coData.registroSanitario || (existingCo.registroSanitario as string),
        categoriaLocal: coData.categoriaLocal || (existingCo.categoriaLocal as string),
        textosObligatorios: coData.textosObligatorios || (existingCo.textosObligatorios as string),
        advertencias: coData.advertencias || (existingCo.advertencias as string),
        precauciones: coData.precauciones || (existingCo.precauciones as string),
        usoPosologia: coData.usoPosologia || (existingCo.usoPosologia as string),
        textoRegulatorio: coData.textoRegulatorio || (existingCo.textoRegulatorio as string),
        claimLogo: coData.claimLogo !== undefined ? coData.claimLogo : (existingCo.claimLogo as string),
        descripcionLocal: coData.descripcionLocal || (existingCo.descripcionLocal as string),
        composicion: coData.composicion || (existingCo.composicion as string),
        presentaciones: mergePresentaciones(existingCo.presentaciones, coData.presentaciones),
        mockups: [...new Set([...(Array.isArray(existingCo.mockups) ? existingCo.mockups : []), ...coData.mockups])].filter(Boolean),
        linksRotulos: [...new Set([...(Array.isArray(existingCo.linksRotulos) ? existingCo.linksRotulos : []), ...coData.linksRotulos])].filter(Boolean),
        estadoRegulatorio: coData.estadoRegulatorio || (existingCo.estadoRegulatorio as string),
      });
    } else {
      created++;
      mat.paises['CO'] = {
        registroSanitario: coData.registroSanitario,
        categoriaLocal: coData.categoriaLocal,
        textosObligatorios: coData.textosObligatorios,
        advertencias: coData.advertencias,
        precauciones: coData.precauciones,
        usoPosologia: coData.usoPosologia,
        textoRegulatorio: coData.textoRegulatorio,
        claimLogo: coData.claimLogo,
        descripcionLocal: coData.descripcionLocal,
        composicion: coData.composicion,
        presentaciones: coData.presentaciones,
        mockups: coData.mockups,
        linksRotulos: coData.linksRotulos,
        estadoRegulatorio: coData.estadoRegulatorio,
      };
    }
  }

  console.log('CO actualizados:', updated);
  console.log('CO creados (no existían):', created);
  if (notMatched.length > 0) {
    console.log('Sin match en Excel (primeros 15):', notMatched.slice(0, 15));
  }

  const outPath = JSON_PATH;
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Guardado:', outPath);
}

main();
