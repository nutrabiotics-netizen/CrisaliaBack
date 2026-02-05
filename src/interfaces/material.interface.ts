import { Types } from 'mongoose';

/**
 * Códigos de país soportados para variantes regulatorias.
 * Coinciden con las hojas típicas del Excel (COL→CO, ECU→EC, etc.).
 */
export type PaisCode = 'CO' | 'EC' | 'MX' | 'PE' | 'CR';

/**
 * Estado regulatorio del material en un país.
 */
export type EstadoRegulatorio = 'aprobado' | 'no_aprobado' | 'en_revision';

/**
 * Una presentación del material en un país: nombre y opcionalmente link de imagen (mockup).
 */
export interface IPresentacionItem {
  nombre: string;
  mockup?: string;
}

/**
 * Material: producto base, independiente del país.
 * No incluye _id en la interfaz de dominio para creación; Mongoose lo añade en el Document.
 */
export interface IMaterial {
  codigo: string;
  nombre?: string;
  marca?: string;
  categoriaGeneral?: string;
  descripcionBase?: string;
  activo?: boolean;
}

/**
 * Variante regulatoria del material en un país.
 * material es referencia al Material (ObjectId).
 * presentaciones: cada ítem tiene nombre y opcionalmente link de imagen (mockup).
 * mockups: lista de links/imágenes adicionales. linksRotulos: array de strings.
 */
export interface IMaterialPais {
  material: Types.ObjectId;
  pais: PaisCode;
  registroSanitario?: string;
  categoriaLocal?: string;
  textosObligatorios?: string;
  advertencias?: string;
  precauciones?: string;
  usoPosologia?: string;
  textoRegulatorio?: string;
  claimLogo?: string;
  descripcionLocal?: string;
  composicion?: string;
  presentaciones?: IPresentacionItem[];
  mockups?: string[];
  linksRotulos?: string[];
  estadoRegulatorio?: EstadoRegulatorio;
}

/**
 * Claves internas que pueden venir del Excel (Material + MaterialPais).
 * Usadas en el mapper de encabezados por país.
 */
export type MaterialImportFieldKey =
  | keyof Pick<IMaterial, 'codigo' | 'nombre' | 'marca' | 'categoriaGeneral' | 'descripcionBase'>
  | keyof Omit<IMaterialPais, 'material' | 'pais'>;

/**
 * Fila ya mapeada desde Excel: encabezados traducidos a campos internos.
 * Todos los valores son string tal como vienen del Excel; el servicio normaliza después.
 */
export type MappedMaterialRow = Partial<Record<MaterialImportFieldKey, string>>;

/**
 * Resultado de la importación: resumen y errores por fila/hoja (o por ítem en JSON).
 */
export interface MaterialImportResult {
  totalSheets: number;
  totalRows: number;
  createdMaterials: number;
  updatedMaterials: number;
  errors: Array<{
    sheet: string;
    row: number;
    message: string;
  }>;
}

/**
 * Presentación en JSON de importación: nombre y opcionalmente link de imagen (mockup).
 */
export interface PresentacionImportJson {
  nombre: string;
  mockup?: string;
}

/**
 * Datos por país para importación JSON.
 * presentaciones: array de { nombre, mockup? } o legacy string/string[] (se convierte a objetos).
 * mockups y linksRotulos: string o array de strings.
 */
export interface MaterialPaisImportJson {
  registroSanitario?: string;
  categoriaLocal?: string;
  textosObligatorios?: string;
  advertencias?: string;
  precauciones?: string;
  usoPosologia?: string;
  textoRegulatorio?: string;
  claimLogo?: string;
  descripcionLocal?: string;
  composicion?: string;
  presentaciones?: string | string[] | PresentacionImportJson[];
  mockups?: string | string[];
  linksRotulos?: string | string[];
  estadoRegulatorio?: EstadoRegulatorio;
}

/**
 * Un material en el JSON de importación.
 * codigo es opcional: si no viene, se genera a partir de nombre.
 * paises: objeto con clave CO | EC | MX | PE | CR y datos regulatorios por país.
 */
export interface MaterialImportItemJson {
  codigo?: string;
  nombre?: string;
  marca?: string;
  categoriaGeneral?: string;
  descripcionBase?: string;
  paises: Partial<Record<PaisCode, MaterialPaisImportJson>>;
}

/**
 * Estructura raíz del JSON para importar materiales.
 */
export interface MaterialImportJson {
  materiales: MaterialImportItemJson[];
}

/**
 * Mapeo de nombre de hoja Excel → código de país.
 * Soporta tanto nombres cortos (COL, ECU, MX, PERU, CR) como con prefijo "MOCKUPS ".
 * Las hojas sin entrada aquí (ej. "Control de cambios", "Textos Regulatorios_Base")
 * se ignoran sin error.
 */
export const SHEET_NAME_TO_PAIS: Record<string, PaisCode> = {
  // Colombia
  COL: 'CO',
  CO: 'CO',
  'MOCKUPS COL': 'CO',
  // Ecuador
  ECU: 'EC',
  EC: 'EC',
  'MOCKUPS ECU': 'EC',
  // México
  MEX: 'MX',
  MX: 'MX',
  'MOCKUPS MX': 'MX',
  // Perú (hoja real suele llamarse "PERU" o "MOCKUPS PERU")
  PER: 'PE',
  PERU: 'PE',
  PE: 'PE',
  'MOCKUPS PERU': 'PE',
  // Costa Rica
  CRI: 'CR',
  CR: 'CR',
  'MOCKUPS CR': 'CR',
} as const;
