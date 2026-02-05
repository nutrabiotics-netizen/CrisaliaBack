import { PaisCode } from '../interfaces/material.interface';
import type { MaterialImportFieldKey } from '../interfaces/material.interface';

/**
 * Para cada país: mapeo de encabezado tal como aparece en el Excel → campo interno.
 * Múltiples encabezados pueden apuntar al mismo campo (ej. "Código" y "Cod" → "codigo").
 * Solo se incluyen columnas que el Excel de ese país pueda tener; el resto se ignora.
 * Añadir o modificar entradas aquí no requiere tocar la lógica del servicio de importación.
 */
export type CountryHeaderMap = Partial<Record<string, MaterialImportFieldKey>>;

export const COUNTRY_HEADER_MAP: Record<PaisCode, CountryHeaderMap> = {
  CO: {
    // Colombia: encabezados reales del Excel (hoja MOCKUPS COL)
    'PRODUCTO': 'nombre',
    'PRESENTACION': 'presentaciones',
    'MOCKUP': 'mockups',
    'LINKS MOCKUPS': 'mockups',
    'MARCAS': 'marca',
    'LINKS RÓTULOS': 'linksRotulos',
    'REGISTRO SANITARIO COLOMBIA': 'registroSanitario',
    'CATEGORIA': 'categoriaLocal',
    'TEXTOS OBLIGATORIOS': 'textosObligatorios',
    'CLAIM LOGO': 'claimLogo',
    'DESCRIPCION': 'descripcionLocal',
    'COMPOSICION': 'composicion',
    // Variantes por si el Excel tiene espacios, acentos o texto en dos líneas
    'Descripción': 'descripcionLocal',
    'Composición': 'composicion',
    'Composicion': 'composicion',
    'COMPOSICION (Por capsula, tableta, cucharada, gota o dosis)': 'composicion',
  },
  EC: {
    // Ecuador: encabezados reales del Excel (hoja MOCKUPS ECU)
    'PRODUCTO': 'nombre',
    'PRESENTACION': 'presentaciones',
    'MOCKUP': 'mockups',
    'LINKS MOCKUPS [REPO. ECU]': 'mockups',
    'RÓTULOS': 'linksRotulos',
    'REGISTRO SANITARIO ECUADOR': 'registroSanitario',
    'CATEGORIA': 'categoriaLocal',
    'TEXTOS OBLIGATORIOS': 'textosObligatorios',
    'DESCRIPCION': 'descripcionLocal',
    // LINKS MARCAS no tiene campo equivalente; se ignora
    // Variantes
    'Descripción': 'descripcionLocal',
    'Descripcion': 'descripcionLocal',
  },
  MX: {
    // México: encabezados reales del Excel (hoja MOCKUPS MX)
    'PRODUCTO': 'nombre',
    'PRESENTACION': 'presentaciones',
    'MOCKUP': 'mockups',
    'LINKS MOCKUPS[REPO.MX]': 'mockups',
    'LINKS MOCKUPS [REPO.MX]': 'mockups',
    'LINKS RÓTULOS PAG.WEB': 'linksRotulos',
    'RÓTULOS FICHAS COMERCIALES': 'textoRegulatorio',
    'Clasificación COFEPRIS': 'categoriaLocal',
    'CATEGORIA': 'categoriaLocal',
    'TEXTOS OBLIGATORIOS': 'textosObligatorios',
    'DESCRIPCION': 'descripcionLocal',
    'COMPOSICION': 'composicion',
    'COMPOSICION (Por cápsula, tableta, cucharada, gota o dosis)': 'composicion',
    // LINKS MARCAS no tiene campo equivalente; se ignora
    // Variantes
    'Descripción': 'descripcionLocal',
    'Descripcion': 'descripcionLocal',
    'Composición': 'composicion',
    'Composicion': 'composicion',
  },
  PE: {
    // Perú: encabezados reales del Excel (hoja MOCKUPS PERU)
    'PRODUCTO': 'nombre',
    'PRESENTACION': 'presentaciones',
    'MOCKUP': 'mockups',
    'LINKS MOCKUP (REP. PERÚ)': 'mockups',
    'LINKS MOCKUP (REP. PERU)': 'mockups',
    'RÓTULOS': 'linksRotulos',
    'REGISTRO SANITARIO PERÚ': 'registroSanitario',
    'REGISTRO SANITARIO PERU': 'registroSanitario',
    'CATEGORIA': 'categoriaLocal',
    'ADVERTENCIAS': 'advertencias',
    'PRECAUCIONES': 'precauciones',
    'DESCRIPCION': 'descripcionLocal',
    // LINKS MARCAS no tiene campo equivalente; se ignora
    // Variantes
    'Descripción': 'descripcionLocal',
    'Descripcion': 'descripcionLocal',
  },
  CR: {
    // Costa Rica: encabezados reales del Excel (hoja MOCKUPS CR)
    'PRODUCTO': 'nombre',
    'PRESENTACION': 'presentaciones',
    'MOCKUP': 'mockups',
    'LINKS MOCKUP (REP. COSTA RICA)': 'mockups',
    'RÓTULOS': 'linksRotulos',
    'REGISTRO SANITARIO COSTA RICA': 'registroSanitario',
    'CATEGORIA': 'categoriaLocal',
    'TEXTO REGULATORIO': 'textoRegulatorio',
    'USO/POSOLOGIA Y CONTRAINDICACIONES': 'usoPosologia',
    'COMPOSICION': 'composicion',
    // LINKS MARCAS no tiene campo equivalente; se ignora
    // Variantes
    'Descripción': 'descripcionLocal',
    'Descripcion': 'descripcionLocal',
    'Composición': 'composicion',
    'Composicion': 'composicion',
  },
} as const;
