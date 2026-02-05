/**
 * Actualiza/completa el objeto paises[PAIS] en materiales_MULTI_PAIS.json
 * a partir del Excel del país. Solo modifica datos del país indicado;
 * el mismo material puede tener CO, EC, etc. y no se tocan los demás.
 *
 * Uso:
 *   npx ts-node src/scripts/mergeCountryExcelToMultiPaisJson.ts CO [rutaJSON]
 *   npx ts-node src/scripts/mergeCountryExcelToMultiPaisJson.ts EC [rutaJSON]
 *   npx ts-node src/scripts/mergeCountryExcelToMultiPaisJson.ts MX [rutaJSON]
 *   npx ts-node src/scripts/mergeCountryExcelToMultiPaisJson.ts PE [rutaJSON]
 *   npx ts-node src/scripts/mergeCountryExcelToMultiPaisJson.ts CR [rutaJSON]
 *
 * Excel por defecto: documentos/co.xlsx, ecu.xlsx, mx.xlsx, PERU.xlsx, COSTA RICA - CR.xlsx.
 * Costa Rica: si COMPOSICION dice "igual a la de colombia" / "misma formula de colombia", se usa la de paises.CO.
 * JSON por defecto: %USERPROFILE%\Downloads\materiales_MULTI_PAIS.json
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

type PaisCode = 'CO' | 'EC' | 'MX' | 'PE' | 'CR';

interface PaisData {
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

/** Configuración de columnas del Excel por país (encabezados pueden variar). */
interface CountryExcelConfig {
  productCol: string;
  presentationCol: string;
  mockupCols: string[];
  linksRotulosCols: string[];
  registroCol: string;
  categoriaCol: string;
  textosCol: string;
  descripcionCol: string;
  composicionCol?: string;
  claimLogoCol?: string;
  /** MX: RÓTULOS FICHAS COMERCIALES → textoRegulatorio */
  textoRegulatorioCol?: string;
  /** PE: ADVERTENCIAS, PRECAUCIONES */
  advertenciasCol?: string;
  precaucionesCol?: string;
  /** CR: USO/POSOLOGIA Y CONTRAINDICACIONES */
  usoPosologiaCol?: string;
}

const COUNTRY_CONFIG: Record<PaisCode, CountryExcelConfig> = {
  CO: {
    productCol: 'PRODUCTO',
    presentationCol: 'PRESENTACION',
    mockupCols: ['LINKS MOCKUPS'],
    linksRotulosCols: ['LINKS RÓTULOS', 'RÓTULO'],
    registroCol: 'REGISTRO SANITARIO COLOMBIA',
    categoriaCol: 'CATEGORIA',
    textosCol: 'TEXTOS OBLIGATORIOS',
    descripcionCol: 'DESCRIPCION',
    claimLogoCol: 'CLAIM LOGO',
    composicionCol: undefined, // se detecta por nombre que empiece con COMPOSICION
  },
  EC: {
    productCol: 'PRODUCTO',
    presentationCol: 'PRESENTACION',
    mockupCols: ['MOCKUP', 'LINKS MOCKUPS [REPO. ECU]'],
    linksRotulosCols: ['RÓTULOS'],
    registroCol: 'REGISTRO SANITARIO ECUADOR',
    categoriaCol: 'CATEGORIA',
    textosCol: 'TEXTOS OBLIGATORIOS',
    descripcionCol: 'DESCRIPCION',
  },
  MX: {
    productCol: 'PRODUCTO',
    presentationCol: 'PRESENTACION',
    mockupCols: ['MOCKUP', 'LINKS MOCKUPS [REPO. MX]'],
    linksRotulosCols: ['LINKS RÓTULOS PAG.WEB'],
    registroCol: 'Clasificación COFEPRIS', // número de registro COFEPRIS
    categoriaCol: 'CATEGORIA',
    textosCol: 'TEXTOS OBLIGATORIOS',
    descripcionCol: 'DESCRIPCION',
    textoRegulatorioCol: 'RÓTULOS FICHAS COMERCIALES',
    composicionCol: undefined, // se detecta por nombre que empiece con COMPOSICION
  },
  PE: {
    productCol: 'PRODUCTO',
    presentationCol: 'PRESENTACION',
    mockupCols: ['MOCKUP', 'LINKS MOCKUP (REP. PERÚ)', 'LINKS MOCKUP (REP. PERU)'],
    linksRotulosCols: ['RÓTULOS'],
    registroCol: 'REGISTRO SANITARIO PERÚ',
    categoriaCol: 'CATEGORIA',
    textosCol: '', // PE no tiene columna TEXTOS OBLIGATORIOS en el Excel
    descripcionCol: 'DESCRIPCION',
    advertenciasCol: 'ADVERTENCIAS',
    precaucionesCol: 'PRECAUCIONES',
  },
  CR: {
    productCol: 'PRODUCTO',
    presentationCol: 'PRESENTACION',
    mockupCols: ['MOCKUP', 'LINKS MOCKUP (REP. COSTA RICA)'],
    linksRotulosCols: ['RÓTULOS'],
    registroCol: 'REGISTRO SANITARIO COSTA RICA',
    categoriaCol: 'CATEGORIA',
    textosCol: '',
    descripcionCol: 'DESCRIPCION',
    composicionCol: 'COMPOSICION',
    textoRegulatorioCol: 'TEXTO REGULATORIO',
    usoPosologiaCol: 'USO/POSOLOGIA Y CONTRAINDICACIONES',
  },
};

const EXCEL_BY_PAIS: Record<PaisCode, string> = {
  CO: 'co.xlsx',
  EC: 'ecu.xlsx',
  MX: 'mx.xlsx',
  PE: 'PERU.xlsx',
  CR: 'COSTA RICA - CR.xlsx',
};

function normalizeHeader(h: string): string {
  return String(h ?? '').replace(/\r\n/g, ' ').trim();
}

function normalizeForMatch(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\u00AE/g, '')
    .trim()
    .toUpperCase();
}

function normalizeStrict(s: string): string {
  return normalizeForMatch(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\s\-._]/g, '')
    .trim();
}

function trimVal(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function readExcelByCountry(filePath: string, config: CountryExcelConfig): Map<string, PaisData> {
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
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const cells = rawRows[i] ?? [];
    const obj: Record<string, string> = {};
    rawHeaders.forEach((h, j) => {
      obj[h] = trimVal(cells[j]);
    });
    const hasAnyData = rawHeaders.some((h) => trimVal(obj[h]) !== '');
    if (hasAnyData) rows.push(obj);
  }

  // Propagar celdas vacías (merged cells)
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    for (const key of Object.keys(curr)) {
      const v = trimVal(curr[key]);
      if (v === '' && prev[key]) {
        const p = trimVal(prev[key]);
        if (p !== '') curr[key] = p;
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
        if (n !== '') curr[key] = n;
      }
    }
  }

  const byProduct = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const product = trimVal(row[config.productCol]);
    if (!product) continue;
    const key = normalizeForMatch(product);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(row);
  }

  const result = new Map<string, PaisData>();
  for (const [key, group] of byProduct) {
    const first = group[0]!;
    const presentaciones: Array<{ nombre: string; mockup: string }> = [];
    const linksRotulosSet = new Set<string>();
    const mockupsSet = new Set<string>();

    for (const row of group) {
      const pres = trimVal(row[config.presentationCol]);
      let mockup = '';
      for (const col of config.mockupCols) {
        const v = trimVal(row[col]);
        if (v && v.toLowerCase() !== 'nan') {
          mockup = v;
          mockupsSet.add(v);
          break;
        }
      }
      if (pres && pres.toLowerCase() !== 'nan') {
        presentaciones.push({ nombre: pres, mockup: mockup || '' });
      }
      for (const col of config.linksRotulosCols) {
        const v = trimVal(row[col]);
        if (v && v.toLowerCase() !== 'nan') linksRotulosSet.add(v);
      }
      if (mockup) mockupsSet.add(mockup);
    }

    const registroSanitario = trimVal(first[config.registroCol]);
    const categoriaLocal = trimVal(first[config.categoriaCol]);
    const textosObligatorios = trimVal(first[config.textosCol]);
    const descripcionLocal = trimVal(first[config.descripcionCol]);
    let composicion = '';
    if (config.composicionCol) {
      composicion = trimVal(first[config.composicionCol]);
    } else {
      const composicionKey = Object.keys(first).find((k) => k.trim().toUpperCase().startsWith('COMPOSICION'));
      if (composicionKey) composicion = trimVal(first[composicionKey]);
    }
    let claimLogo = '';
    if (config.claimLogoCol) {
      const v = trimVal(first[config.claimLogoCol]);
      claimLogo = v === '0' ? '' : v;
    }
    let textoRegulatorio = '';
    if (config.textoRegulatorioCol) {
      textoRegulatorio = trimVal(first[config.textoRegulatorioCol]);
    }

    const advertencias = config.advertenciasCol ? trimVal(first[config.advertenciasCol]) : '';
    const precauciones = config.precaucionesCol ? trimVal(first[config.precaucionesCol]) : '';
    const usoPosologia = config.usoPosologiaCol ? trimVal(first[config.usoPosologiaCol]) : '';

    result.set(key, {
      registroSanitario,
      categoriaLocal,
      textosObligatorios,
      advertencias,
      precauciones,
      usoPosologia,
      textoRegulatorio,
      claimLogo,
      descripcionLocal,
      composicion,
      presentaciones:
        presentaciones.length > 0 ? presentaciones : [{ nombre: '', mockup: '' }].filter((p) => p.nombre),
      mockups: Array.from(mockupsSet),
      linksRotulos: Array.from(linksRotulosSet),
      estadoRegulatorio: 'aprobado',
    });
  }
  return result;
}

function getPaisData(
  dataByProduct: Map<string, PaisData>,
  dataByProductStrict: Map<string, PaisData>,
  nombre: string,
  codigo: string
): PaisData | undefined {
  const keyByNombre = normalizeForMatch(nombre);
  const keyByCodigo = normalizeForMatch(codigo);
  const baseNombre = keyByNombre.split(/\s*[(\n]/)[0]?.trim() || keyByNombre;
  const baseCodigo = keyByCodigo.split(/\s*[(\n]/)[0]?.trim() || keyByCodigo;
  const co =
    dataByProduct.get(keyByNombre) ??
    dataByProduct.get(keyByCodigo) ??
    dataByProduct.get(baseNombre) ??
    dataByProduct.get(baseCodigo);
  if (co) return co;
  const excelKey = Array.from(dataByProduct.keys()).find((k) => {
    const baseExcel = k.split(/\s*[(\n]/)[0]?.trim() || k;
    return (
      baseExcel === baseNombre ||
      baseExcel === baseCodigo ||
      baseNombre.startsWith(baseExcel) ||
      baseExcel.startsWith(baseNombre)
    );
  });
  if (excelKey) return dataByProduct.get(excelKey);
  const strictNombre = normalizeStrict(nombre);
  const strictCodigo = normalizeStrict(codigo);
  return dataByProductStrict.get(strictNombre) ?? dataByProductStrict.get(strictCodigo);
}

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

/** Si el texto indica que la composición es la misma que Colombia (CR). */
function isComposicionIgualColombia(s: string): boolean {
  const t = trimVal(s).toLowerCase();
  if (!t) return false;
  return (
    /igual\s+a\s+(la\s+)?de\s+colombia/i.test(t) ||
    /misma\s+f(o|ó)rmula\s+de\s+colombia/i.test(t) ||
    /misma\s+fomula\s+de\s+colombia/i.test(t)
  );
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
  const paisArg = (process.argv[2] || 'CO').toUpperCase() as PaisCode;
  if (paisArg !== 'CO' && paisArg !== 'EC' && paisArg !== 'MX' && paisArg !== 'PE' && paisArg !== 'CR') {
    console.error('Uso: npx ts-node mergeCountryExcelToMultiPaisJson.ts CO|EC|MX|PE|CR [rutaJSON]');
    process.exit(1);
  }
  const pais: PaisCode = paisArg;
  const jsonPath =
    process.argv[3] || path.join(process.env.USERPROFILE || '', 'Downloads', 'materiales_MULTI_PAIS.json');
  const excelFileName = EXCEL_BY_PAIS[pais];
  const excelPath = path.resolve(__dirname, '../../../documentos', excelFileName);

  const config = COUNTRY_CONFIG[pais];
  console.log(`País: ${pais}. Excel: ${excelPath}`);

  const dataByProduct = readExcelByCountry(excelPath, config);
  const dataByProductStrict = new Map<string, PaisData>();
  for (const [k, v] of dataByProduct) dataByProductStrict.set(normalizeStrict(k), v);
  console.log(`Productos en Excel ${pais}:`, dataByProduct.size);

  console.log('Leyendo JSON:', jsonPath);
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data: MultiPaisJson = JSON.parse(jsonContent);
  const materiales = data.materiales || [];
  console.log('Materiales en JSON:', materiales.length);

  let updated = 0;
  let created = 0;
  const notMatched: string[] = [];

  for (const mat of materiales) {
    const nombre = trimVal(mat.nombre);
    const codigo = trimVal(mat.codigo);
    const paisData = getPaisData(dataByProduct, dataByProductStrict, nombre, codigo);
    if (!paisData) {
      notMatched.push(nombre || codigo || 'sin nombre');
      continue;
    }

    if (!mat.paises) mat.paises = {};
    const existingPais = mat.paises[pais] as Record<string, unknown> | undefined;
    const coPais = mat.paises['CO'] as Record<string, unknown> | undefined;
    const composicionFinal =
      pais === 'CR' && isComposicionIgualColombia(paisData.composicion) && coPais?.composicion
        ? (coPais.composicion as string)
        : paisData.composicion || (existingPais?.composicion as string) || '';

    if (existingPais) {
      updated++;
      Object.assign(existingPais, {
        registroSanitario: paisData.registroSanitario || (existingPais.registroSanitario as string),
        categoriaLocal: paisData.categoriaLocal || (existingPais.categoriaLocal as string),
        textosObligatorios: paisData.textosObligatorios || (existingPais.textosObligatorios as string),
        advertencias: paisData.advertencias || (existingPais.advertencias as string),
        precauciones: paisData.precauciones || (existingPais.precauciones as string),
        usoPosologia: paisData.usoPosologia || (existingPais.usoPosologia as string),
        textoRegulatorio: paisData.textoRegulatorio || (existingPais.textoRegulatorio as string),
        claimLogo: paisData.claimLogo !== undefined ? paisData.claimLogo : (existingPais.claimLogo as string),
        descripcionLocal: paisData.descripcionLocal || (existingPais.descripcionLocal as string),
        composicion: composicionFinal || (existingPais.composicion as string),
        presentaciones: mergePresentaciones(existingPais.presentaciones, paisData.presentaciones),
        mockups: [
          ...new Set([
            ...(Array.isArray(existingPais.mockups) ? existingPais.mockups : []),
            ...paisData.mockups,
          ]),
        ].filter(Boolean),
        linksRotulos: [
          ...new Set([
            ...(Array.isArray(existingPais.linksRotulos) ? existingPais.linksRotulos : []),
            ...paisData.linksRotulos,
          ]),
        ].filter(Boolean),
        estadoRegulatorio: paisData.estadoRegulatorio || (existingPais.estadoRegulatorio as string),
      });
    } else {
      created++;
      const newComposicion =
        pais === 'CR' && isComposicionIgualColombia(paisData.composicion) && coPais?.composicion
          ? (coPais.composicion as string)
          : paisData.composicion;
      mat.paises[pais] = {
        registroSanitario: paisData.registroSanitario,
        categoriaLocal: paisData.categoriaLocal,
        textosObligatorios: paisData.textosObligatorios,
        advertencias: paisData.advertencias,
        precauciones: paisData.precauciones,
        usoPosologia: paisData.usoPosologia,
        textoRegulatorio: paisData.textoRegulatorio,
        claimLogo: paisData.claimLogo,
        descripcionLocal: paisData.descripcionLocal,
        composicion: newComposicion,
        presentaciones: paisData.presentaciones,
        mockups: paisData.mockups,
        linksRotulos: paisData.linksRotulos,
        estadoRegulatorio: paisData.estadoRegulatorio,
      };
    }
  }

  console.log(`${pais} actualizados:`, updated);
  console.log(`${pais} creados (no existían):`, created);
  if (notMatched.length > 0) {
    console.log('Sin match en Excel (primeros 15):', notMatched.slice(0, 15));
  }

  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Guardado:', jsonPath);
}

main();
