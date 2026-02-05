/**
 * Lee hormonas.xlsx (encabezados propios, no mapeados por país) y aplica
 * los mismos datos a todos los países (CO, EC, MX, PE, CR) para cada producto.
 * Si el material ya existe, se hace merge (se conservan registroSanitario y
 * linksRotulos existentes por país). Si no existe, se crea con los 5 países.
 *
 * Uso: npx ts-node src/scripts/mergeHormonasExcelToMultiPaisJson.ts [rutaJSON]
 *
 * Excel: documentos/hormonas.xlsx
 * Headers: PRODUCTO, PRESENTACION, FORMULA FARMACEUTICA (→ composicion),
 *          MOCKUP, LINKS MOCKUPS, CATEGORIA, TEXTOS OBLIGATORIOS, CLAIM LOGO, DESCRIPCION
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

type PaisCode = 'CO' | 'EC' | 'MX' | 'PE' | 'CR';
const TODOS_LOS_PAISES: PaisCode[] = ['CO', 'EC', 'MX', 'PE', 'CR'];

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

const HORMONAS_EXCEL = path.resolve(__dirname, '../../../documentos/hormonas.xlsx');

/** Config de columnas de hormonas.xlsx (no coincide con los Excels por país). */
const HORMONAS_CONFIG = {
  productCol: 'PRODUCTO',
  presentationCol: 'PRESENTACION',
  composicionCol: 'FORMULA FARMACEUTICA',
  mockupCols: ['MOCKUP', 'LINKS MOCKUPS'],
  linksRotulosCols: [] as string[], // no hay en hormonas
  categoriaCol: 'CATEGORIA',
  textosCol: 'TEXTOS OBLIGATORIOS',
  descripcionCol: 'DESCRIPCION',
  claimLogoCol: 'CLAIM LOGO',
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

function readHormonasExcel(filePath: string): Map<string, { data: PaisData; nombreOriginal: string }> {
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
    const product = trimVal(row[HORMONAS_CONFIG.productCol]);
    if (!product) continue;
    const key = normalizeForMatch(product);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(row);
  }

  const result = new Map<string, { data: PaisData; nombreOriginal: string }>();
  for (const [key, group] of byProduct) {
    const first = group[0]!;
    const presentaciones: Array<{ nombre: string; mockup: string }> = [];
    const mockupsSet = new Set<string>();

    for (const row of group) {
      const pres = trimVal(row[HORMONAS_CONFIG.presentationCol]);
      let mockup = '';
      for (const col of HORMONAS_CONFIG.mockupCols) {
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
      if (mockup) mockupsSet.add(mockup);
    }

    const categoriaLocal = trimVal(first[HORMONAS_CONFIG.categoriaCol]);
    const textosObligatorios = trimVal(first[HORMONAS_CONFIG.textosCol]);
    const descripcionLocal = trimVal(first[HORMONAS_CONFIG.descripcionCol]);
    const composicion = trimVal(first[HORMONAS_CONFIG.composicionCol]);
    let claimLogo = trimVal(first[HORMONAS_CONFIG.claimLogoCol]);
    if (claimLogo === '0') claimLogo = '';

    result.set(key, {
      nombreOriginal: trimVal(first[HORMONAS_CONFIG.productCol]),
      data: {
        registroSanitario: '',
        categoriaLocal,
        textosObligatorios,
        advertencias: '',
        precauciones: '',
        usoPosologia: '',
        textoRegulatorio: '',
        claimLogo,
        descripcionLocal,
        composicion,
        presentaciones:
          presentaciones.length > 0 ? presentaciones : [{ nombre: '', mockup: '' }].filter((p) => p.nombre),
        mockups: Array.from(mockupsSet),
        linksRotulos: [],
        estadoRegulatorio: 'aprobado',
      },
    });
  }
  return result;
}

function getHormonasData(
  dataByProduct: Map<string, { data: PaisData; nombreOriginal: string }>,
  dataByProductStrict: Map<string, { data: PaisData; nombreOriginal: string }>,
  nombre: string,
  codigo: string
): { data: PaisData; nombreOriginal: string } | undefined {
  const keyByNombre = normalizeForMatch(nombre);
  const keyByCodigo = normalizeForMatch(codigo);
  const baseNombre = keyByNombre.split(/\s*[(\n]/)[0]?.trim() || keyByNombre;
  const baseCodigo = keyByCodigo.split(/\s*[(\n]/)[0]?.trim() || keyByCodigo;
  let entry =
    dataByProduct.get(keyByNombre) ??
    dataByProduct.get(keyByCodigo) ??
    dataByProduct.get(baseNombre) ??
    dataByProduct.get(baseCodigo);
  if (entry) return entry;
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
  entry = dataByProductStrict.get(strictNombre) ?? dataByProductStrict.get(strictCodigo);
  return entry;
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
  const jsonPath =
    process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'materiales_MULTI_PAIS.json');

  console.log('Leyendo Excel hormonas:', HORMONAS_EXCEL);
  const dataByProduct = readHormonasExcel(HORMONAS_EXCEL);
  const dataByProductStrict = new Map<string, { data: PaisData; nombreOriginal: string }>();
  for (const [k, v] of dataByProduct) dataByProductStrict.set(normalizeStrict(k), v);
  console.log('Productos en hormonas.xlsx:', dataByProduct.size);

  console.log('Leyendo JSON:', jsonPath);
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data: MultiPaisJson = JSON.parse(jsonContent);
  const materiales = data.materiales || [];
  console.log('Materiales en JSON:', materiales.length);

  let paisesActualizados = 0;
  let paisesCreados = 0;
  const notMatched: string[] = [];
  const matchedExcelKeys = new Set<string>();

  for (const mat of materiales) {
    const nombre = trimVal(mat.nombre);
    const codigo = trimVal(mat.codigo);
    const entry = getHormonasData(dataByProduct, dataByProductStrict, nombre, codigo);
    if (!entry) {
      notMatched.push(nombre || codigo || 'sin nombre');
      continue;
    }
    matchedExcelKeys.add(normalizeForMatch(entry.nombreOriginal));

    const hormData = entry.data;
    if (!mat.paises) mat.paises = {};

    for (const pais of TODOS_LOS_PAISES) {
      const existingPais = mat.paises[pais] as Record<string, unknown> | undefined;

      if (existingPais) {
        paisesActualizados++;
        Object.assign(existingPais, {
          registroSanitario: hormData.registroSanitario || (existingPais.registroSanitario as string),
          categoriaLocal: hormData.categoriaLocal || (existingPais.categoriaLocal as string),
          textosObligatorios: hormData.textosObligatorios || (existingPais.textosObligatorios as string),
          advertencias: hormData.advertencias || (existingPais.advertencias as string),
          precauciones: hormData.precauciones || (existingPais.precauciones as string),
          usoPosologia: hormData.usoPosologia || (existingPais.usoPosologia as string),
          textoRegulatorio: hormData.textoRegulatorio || (existingPais.textoRegulatorio as string),
          claimLogo: hormData.claimLogo !== undefined ? hormData.claimLogo : (existingPais.claimLogo as string),
          descripcionLocal: hormData.descripcionLocal || (existingPais.descripcionLocal as string),
          composicion: hormData.composicion || (existingPais.composicion as string),
          presentaciones: mergePresentaciones(existingPais.presentaciones, hormData.presentaciones),
          mockups: [
            ...new Set([
              ...(Array.isArray(existingPais.mockups) ? existingPais.mockups : []),
              ...hormData.mockups,
            ]),
          ].filter(Boolean),
          linksRotulos:
            (Array.isArray(existingPais.linksRotulos) && existingPais.linksRotulos.length > 0)
              ? existingPais.linksRotulos
              : hormData.linksRotulos,
          estadoRegulatorio: hormData.estadoRegulatorio || (existingPais.estadoRegulatorio as string),
        });
      } else {
        paisesCreados++;
        mat.paises[pais] = {
          registroSanitario: hormData.registroSanitario,
          categoriaLocal: hormData.categoriaLocal,
          textosObligatorios: hormData.textosObligatorios,
          advertencias: hormData.advertencias,
          precauciones: hormData.precauciones,
          usoPosologia: hormData.usoPosologia,
          textoRegulatorio: hormData.textoRegulatorio,
          claimLogo: hormData.claimLogo,
          descripcionLocal: hormData.descripcionLocal,
          composicion: hormData.composicion,
          presentaciones: hormData.presentaciones,
          mockups: hormData.mockups,
          linksRotulos: hormData.linksRotulos,
          estadoRegulatorio: hormData.estadoRegulatorio,
        };
      }
    }
  }

  // Productos en hormonas que no coincidieron con ningún material del JSON: añadir como nuevos materiales
  let nuevosMateriales = 0;
  for (const [key, entry] of dataByProduct) {
    if (matchedExcelKeys.has(key)) continue;
    const baseKey = key.split(/\s*[(\n]/)[0]?.trim() || key;
    if (matchedExcelKeys.has(baseKey)) continue;
    if (Array.from(matchedExcelKeys).some((k) => k.startsWith(baseKey) || baseKey.startsWith(k))) continue;

    const hormData = entry.data;
    const nuevoMaterial: MaterialItem = {
      codigo: entry.nombreOriginal,
      nombre: entry.nombreOriginal,
      marca: '',
      categoriaGeneral: hormData.categoriaLocal,
      descripcionBase: hormData.descripcionLocal,
      paises: {},
    };
    for (const pais of TODOS_LOS_PAISES) {
      (nuevoMaterial.paises as Record<string, unknown>)[pais] = {
        registroSanitario: hormData.registroSanitario,
        categoriaLocal: hormData.categoriaLocal,
        textosObligatorios: hormData.textosObligatorios,
        advertencias: hormData.advertencias,
        precauciones: hormData.precauciones,
        usoPosologia: hormData.usoPosologia,
        textoRegulatorio: hormData.textoRegulatorio,
        claimLogo: hormData.claimLogo,
        descripcionLocal: hormData.descripcionLocal,
        composicion: hormData.composicion,
        presentaciones: hormData.presentaciones,
        mockups: hormData.mockups,
        linksRotulos: hormData.linksRotulos,
        estadoRegulatorio: hormData.estadoRegulatorio,
      };
    }
    data.materiales.push(nuevoMaterial);
    nuevosMateriales++;
    console.log('Nuevo material añadido (hormonas):', entry.nombreOriginal);
  }

  console.log('Entradas por país actualizadas:', paisesActualizados);
  console.log('Entradas por país creadas:', paisesCreados);
  console.log('Materiales nuevos añadidos:', nuevosMateriales);
  if (notMatched.length > 0) {
    console.log('Sin match en hormonas (primeros 15):', notMatched.slice(0, 15));
  }

  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Guardado:', jsonPath);
}

main();
