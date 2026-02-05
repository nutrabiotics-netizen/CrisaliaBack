import * as XLSX from 'xlsx';
import * as fs from 'fs';

/**
 * Resultado por hoja: nombre de la hoja y filas como objetos clave-valor.
 * Las claves son los encabezados tal como aparecen en la primera fila del Excel.
 */
export interface SheetData {
  sheetName: string;
  rows: Array<Record<string, string>>;
}

/**
 * Lee un archivo Excel y devuelve todas las hojas con sus filas en formato
 * lista de objetos (clave = encabezado, valor = celda como string).
 * La primera fila de cada hoja se usa como encabezados.
 * Filas completamente vacías se excluyen.
 *
 * @param filePath - Ruta absoluta o relativa al archivo .xlsx
 * @returns Array de { sheetName, rows } por cada hoja
 */
export function readWorkbookSheets(filePath: string): SheetData[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`El archivo no existe: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { type: 'file', raw: false });
  const result: SheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    // sheet_to_json con header: 1 devuelve array de arrays; primera fila = encabezados
    const rawRows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    if (rawRows.length === 0) {
      result.push({ sheetName, rows: [] });
      continue;
    }

    const headers = (rawRows[0] ?? []).map((h) => String(h ?? '').trim());
    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < rawRows.length; i++) {
      const rowCells = rawRows[i] ?? [];
      const obj: Record<string, string> = {};
      let isEmpty = true;

      for (let j = 0; j < headers.length; j++) {
        const key = headers[j] || `__col_${j}`;
        const value = String(rowCells[j] ?? '').trim();
        obj[key] = value;
        if (value !== '') isEmpty = false;
      }

      if (!isEmpty) {
        rows.push(obj);
      }
    }

    // Rellenar celdas vacías por celdas fusionadas: propagar valor de la fila anterior.
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      for (const key of Object.keys(curr)) {
        const v = (curr[key] ?? '').trim();
        if (v === '' && prev[key] !== undefined) {
          const prevVal = String(prev[key] ?? '').trim();
          if (prevVal !== '') curr[key] = prevVal;
        }
      }
    }
    // Propagar también hacia arriba por si el valor está en una fila inferior (merge raro).
    for (let i = rows.length - 2; i >= 0; i--) {
      const next = rows[i + 1];
      const curr = rows[i];
      for (const key of Object.keys(curr)) {
        const v = (curr[key] ?? '').trim();
        if (v === '' && next[key] !== undefined) {
          const nextVal = String(next[key] ?? '').trim();
          if (nextVal !== '') curr[key] = nextVal;
        }
      }
    }

    result.push({ sheetName, rows });
  }

  return result;
}
