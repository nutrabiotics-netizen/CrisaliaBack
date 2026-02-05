import Material from '../../models/Material';
import MaterialPais from '../../models/MaterialPais';
import { readWorkbookSheets } from '../../utils/excelReader';
import { COUNTRY_HEADER_MAP, type CountryHeaderMap } from '../../mappers/countryHeaderMap';
import {
  type PaisCode,
  type MaterialImportResult,
  type MappedMaterialRow,
  type MaterialImportFieldKey,
  type EstadoRegulatorio,
  type MaterialImportJson,
  type IPresentacionItem,
  type PresentacionImportJson,
  SHEET_NAME_TO_PAIS,
} from '../../interfaces/material.interface';

const ESTADOS_VALIDOS: EstadoRegulatorio[] = ['aprobado', 'no_aprobado', 'en_revision'];

/**
 * Resuelve el código de país a partir del nombre de la hoja (ej: "COL" → "CO").
 * Devuelve null si la hoja no corresponde a un país conocido.
 */
function resolvePaisFromSheetName(sheetName: string): PaisCode | null {
  const normalized = sheetName.trim().toUpperCase();
  return SHEET_NAME_TO_PAIS[normalized] ?? null;
}

/**
 * Indica si debemos procesar esta hoja: cuando no se filtra por país, todas las reconocidas;
 * cuando se pasa countryCode, solo las hojas de ese país.
 */
function shouldProcessSheet(
  sheetName: string,
  countryCode?: string
): { process: boolean; pais: PaisCode | null } {
  const pais = resolvePaisFromSheetName(sheetName);
  if (!pais) return { process: false, pais: null };
  if (countryCode) {
    const wanted = countryCode.trim().toUpperCase() as PaisCode;
    if (COUNTRY_HEADER_MAP[wanted] == null) return { process: false, pais: null };
    return { process: pais === wanted, pais };
  }
  return { process: true, pais };
}

/**
 * Aplica el mapa de encabezados del país a una fila cruda del Excel.
 * Solo se incluyen claves que existan en el mapa; columnas no reconocidas se ignoran.
 */
function mapRowWithHeaders(
  rawRow: Record<string, string>,
  headerMap: CountryHeaderMap
): MappedMaterialRow {
  const mapped: MappedMaterialRow = {};
  for (const [excelHeader, internalKey] of Object.entries(headerMap)) {
    if (internalKey == null) continue;
    const value = rawRow[excelHeader];
    if (value !== undefined) {
      (mapped as Record<string, string>)[internalKey] = value;
    }
  }
  return mapped;
}

/**
 * Normaliza un valor string para guardar en BD: trim.
 */
function normalizeString(value: string | undefined): string {
  return String(value ?? '').trim();
}

/**
 * Normaliza codigo: trim y uppercase para consistencia.
 */
function normalizeCodigo(value: string | undefined): string {
  return normalizeString(value).toUpperCase();
}

/**
 * Normaliza estado regulatorio a uno de los valores permitidos; si no es válido, devuelve undefined.
 */
function normalizeEstadoRegulatorio(value: string | undefined): EstadoRegulatorio | undefined {
  const v = normalizeString(value).toLowerCase();
  if (ESTADOS_VALIDOS.includes(v as EstadoRegulatorio)) return v as EstadoRegulatorio;
  return undefined;
}

/**
 * Convierte string o array de strings a array de strings (mockups, linksRotulos).
 * String se divide por "; " o se guarda como único elemento. Valores "nan" o vacíos se filtran.
 */
function normalizeToArray(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? '').trim())
      .filter((v) => v !== '' && v.toLowerCase() !== 'nan');
  }
  const s = normalizeString(value);
  if (s === '' || s.toLowerCase() === 'nan') return [];
  return s.split(';').map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * Normaliza presentaciones a array de { nombre, mockup }.
 * Acepta: string (se divide por ";"), string[], o array de { nombre, mockup? }.
 */
function normalizePresentaciones(
  value: string | string[] | PresentacionImportJson[] | undefined
): IPresentacionItem[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const first = value[0];
    if (typeof first === 'object' && first !== null && 'nombre' in first) {
      return (value as PresentacionImportJson[])
        .map((p) => ({
          nombre: normalizeString(p.nombre),
          mockup: normalizeString(p.mockup),
        }))
        .filter((p) => p.nombre !== '');
    }
    return (value as string[])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v !== '' && v.toLowerCase() !== 'nan')
      .map((nombre) => ({ nombre, mockup: '' }));
  }
  const s = normalizeString(value);
  if (s === '' || s.toLowerCase() === 'nan') return [];
  return s
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((nombre) => ({ nombre, mockup: '' }));
}

/**
 * Genera un código único a partir del nombre del producto (slug).
 * Mismo nombre en distintas hojas → mismo código → mismo Material.
 * Quita acentos, reemplaza espacios y caracteres no alfanuméricos por guión bajo, mayúsculas.
 */
function generateCodigoFromNombre(nombre: string): string {
  const n = normalizeString(nombre);
  if (!n) return '';
  const sinAcentos = n
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  const slug = sinAcentos
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
  return slug || '';
}

/**
 * Servicio de importación de materiales regulatorios desde Excel.
 * Soporta múltiples hojas (una por país), encabezados distintos por país vía configuración,
 * y upsert de Material + MaterialPais sin detener el proceso por errores de fila.
 */
export class MaterialImportService {
  /**
   * Importa materiales desde un archivo Excel.
   *
   * @param filePath - Ruta al archivo .xlsx
   * @param countryCode - Opcional. Si se indica, solo se procesan hojas que correspondan a este país (p. ej. "CO").
   * @returns Resumen con totales y lista de errores por hoja/fila
   */
  async importFromExcel(
    filePath: string,
    countryCode?: string
  ): Promise<MaterialImportResult> {
    const result: MaterialImportResult = {
      totalSheets: 0,
      totalRows: 0,
      createdMaterials: 0,
      updatedMaterials: 0,
      errors: [],
    };

    const sheets = readWorkbookSheets(filePath);
    result.totalSheets = sheets.length;

    for (const { sheetName, rows } of sheets) {
      const { process, pais } = shouldProcessSheet(sheetName, countryCode);
      if (!process) {
        // Hojas sin país reconocido (ej. "Control de cambios", "Textos Regulatorios_Base")
        // se ignoran sin añadir error.
        continue;
      }

      const headerMap = COUNTRY_HEADER_MAP[pais as PaisCode];
      if (!headerMap || Object.keys(headerMap).length === 0) {
        result.errors.push({
          sheet: sheetName,
          row: 0,
          message: `No hay mapeo de encabezados para el país ${pais}.`,
        });
        continue;
      }

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const excelRow = rows[rowIndex];
        const oneBasedRow = rowIndex + 2; // Fila 1 = encabezados, primera fila de datos = 2
        result.totalRows += 1;

        try {
          const mapped = mapRowWithHeaders(excelRow, headerMap);
          // Código: usar el que venga en Excel o generarlo desde el nombre del producto
          let codigo = normalizeCodigo(mapped.codigo);
          if (!codigo) {
            const nombre = normalizeString(mapped.nombre);
            codigo = generateCodigoFromNombre(nombre);
          }
          if (!codigo) {
            result.errors.push({
              sheet: sheetName,
              row: oneBasedRow,
              message: 'Falta código y nombre: no se puede generar un identificador para el material.',
            });
            continue;
          }

          // Fallbacks: en muchos Excel solo hay descripcionLocal/categoriaLocal (ej. Colombia)
          const descripcionBase = normalizeString(mapped.descripcionBase || mapped.descripcionLocal);
          const categoriaGeneral = normalizeString(mapped.categoriaGeneral || mapped.categoriaLocal);

          // Buscar o crear Material (producto base)
          let material = await Material.findOne({ codigo });
          if (!material) {
            material = await Material.create({
              codigo,
              nombre: normalizeString(mapped.nombre),
              marca: normalizeString(mapped.marca),
              categoriaGeneral,
              descripcionBase,
              activo: true,
            });
            result.createdMaterials += 1;
          } else {
            result.updatedMaterials += 1;
            const updates: Partial<Record<MaterialImportFieldKey, string>> = {};
            if (mapped.nombre !== undefined) updates.nombre = normalizeString(mapped.nombre);
            if (mapped.marca !== undefined) updates.marca = normalizeString(mapped.marca);
            if (categoriaGeneral) updates.categoriaGeneral = categoriaGeneral;
            if (descripcionBase) updates.descripcionBase = descripcionBase;
            if (Object.keys(updates).length > 0) {
              await Material.updateOne({ _id: material._id }, { $set: updates });
            }
          }

          // Upsert MaterialPais (variante por país)
          const paisPayload = {
            registroSanitario: normalizeString(mapped.registroSanitario),
            categoriaLocal: normalizeString(mapped.categoriaLocal),
            textosObligatorios: normalizeString(mapped.textosObligatorios),
            advertencias: normalizeString(mapped.advertencias),
            precauciones: normalizeString(mapped.precauciones),
            usoPosologia: normalizeString(mapped.usoPosologia),
            textoRegulatorio: normalizeString(mapped.textoRegulatorio),
            claimLogo: normalizeString(mapped.claimLogo),
            descripcionLocal: normalizeString(mapped.descripcionLocal),
            composicion: normalizeString(mapped.composicion),
            presentaciones: normalizePresentaciones(mapped.presentaciones),
            mockups: normalizeToArray(mapped.mockups),
            linksRotulos: normalizeToArray(mapped.linksRotulos),
            estadoRegulatorio: normalizeEstadoRegulatorio(mapped.estadoRegulatorio),
          };

          await MaterialPais.findOneAndUpdate(
            { material: material._id, pais },
            { $set: paisPayload },
            { upsert: true, runValidators: true }
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push({
            sheet: sheetName,
            row: oneBasedRow,
            message: `Error al procesar fila: ${message}`,
          });
        }
      }
    }

    return result;
  }

  /**
   * Importa materiales desde un objeto JSON ya parseado.
   *
   * @param data - Objeto con array materiales[]
   * @param countryCode - Opcional. Si se indica, solo se importan los datos de ese país (CO, EC, MX, PE, CR).
   * @returns Mismo formato que importFromExcel (totalRows = cantidad de ítems, sheet en errores = "json").
   */
  async importFromJson(
    data: MaterialImportJson,
    countryCode?: string
  ): Promise<MaterialImportResult> {
    const result: MaterialImportResult = {
      totalSheets: 1,
      totalRows: 0,
      createdMaterials: 0,
      updatedMaterials: 0,
      errors: [],
    };

    const materiales = data.materiales ?? [];
    result.totalRows = materiales.length;

    for (let index = 0; index < materiales.length; index++) {
      const item = materiales[index];
      const oneBased = index + 1;

      try {
        let codigo = normalizeCodigo(item.codigo);
        if (!codigo) {
          codigo = generateCodigoFromNombre(normalizeString(item.nombre));
        }
        if (!codigo) {
          result.errors.push({
            sheet: 'json',
            row: oneBased,
            message: 'Falta codigo y nombre: no se puede generar un identificador para el material.',
          });
          continue;
        }

        const descripcionBase = normalizeString(item.descripcionBase);
        const categoriaGeneral = normalizeString(item.categoriaGeneral);

        let material = await Material.findOne({ codigo });
        if (!material) {
          material = await Material.create({
            codigo,
            nombre: normalizeString(item.nombre),
            marca: normalizeString(item.marca),
            categoriaGeneral,
            descripcionBase,
            activo: true,
          });
          result.createdMaterials += 1;
        } else {
          result.updatedMaterials += 1;
          await Material.updateOne(
            { _id: material._id },
            {
              $set: {
                ...(item.nombre !== undefined && { nombre: normalizeString(item.nombre) }),
                ...(item.marca !== undefined && { marca: normalizeString(item.marca) }),
                ...(categoriaGeneral && { categoriaGeneral }),
                ...(descripcionBase && { descripcionBase }),
              },
            }
          );
        }

        const paises = item.paises ?? {};
        const paisesValidos: PaisCode[] = ['CO', 'EC', 'MX', 'PE', 'CR'];
        for (const [paisKey, payload] of Object.entries(paises)) {
          const pais = paisKey.toUpperCase() as PaisCode;
          if (!paisesValidos.includes(pais)) continue;
          if (countryCode && pais !== countryCode.trim().toUpperCase()) continue;
          if (!payload || typeof payload !== 'object') continue;

          const paisPayload = {
            registroSanitario: normalizeString(payload.registroSanitario),
            categoriaLocal: normalizeString(payload.categoriaLocal),
            textosObligatorios: normalizeString(payload.textosObligatorios),
            advertencias: normalizeString(payload.advertencias),
            precauciones: normalizeString(payload.precauciones),
            usoPosologia: normalizeString(payload.usoPosologia),
            textoRegulatorio: normalizeString(payload.textoRegulatorio),
            claimLogo: normalizeString(payload.claimLogo),
            descripcionLocal: normalizeString(payload.descripcionLocal),
            composicion: normalizeString(payload.composicion),
            presentaciones: normalizePresentaciones(payload.presentaciones),
            mockups: normalizeToArray(payload.mockups),
            linksRotulos: normalizeToArray(payload.linksRotulos),
            estadoRegulatorio: normalizeEstadoRegulatorio(payload.estadoRegulatorio),
          };

          await MaterialPais.findOneAndUpdate(
            { material: material._id, pais },
            { $set: paisPayload },
            { upsert: true, runValidators: true }
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({
          sheet: 'json',
          row: oneBased,
          message: `Error al procesar ítem: ${message}`,
        });
      }
    }

    return result;
  }

  /**
   * Importa materiales desde un archivo .json en disco.
   *
   * @param filePath - Ruta al archivo .json (UTF-8).
   * @param countryCode - Opcional. Solo importar datos de ese país.
   */
  async importFromJsonFile(
    filePath: string,
    countryCode?: string
  ): Promise<MaterialImportResult> {
    const fs = await import('fs').then((m) => m.promises);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as MaterialImportJson;
    return this.importFromJson(data, countryCode);
  }
}

export const materialImportService = new MaterialImportService();
