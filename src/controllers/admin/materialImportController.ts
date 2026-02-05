import { Request, Response } from 'express';
import { materialImportService } from '../../services/materialImport/materialImport.service';
import type { MaterialImportJson } from '../../interfaces/material.interface';

/**
 * Importa materiales regulatorios desde un archivo Excel.
 *
 * Cuerpo esperado (JSON):
 * - filePath: string (ruta al .xlsx en el servidor)
 * - countryCode?: string (opcional, ej: "CO" para procesar solo hojas de ese país)
 */
export async function importMaterialesFromExcel(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { filePath, countryCode } = req.body as {
      filePath?: string;
      countryCode?: string;
    };

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Se requiere "filePath" (string) en el cuerpo de la petición.',
      });
      return;
    }

    const result = await materialImportService.importFromExcel(
      filePath.trim(),
      typeof countryCode === 'string' ? countryCode : undefined
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      message: `Error al importar: ${message}`,
    });
  }
}

/**
 * Importa materiales desde JSON.
 *
 * Cuerpo esperado:
 * - filePath?: string — ruta a un .json en el servidor, o
 * - datos?: MaterialImportJson — objeto con { materiales: [...] }
 * - countryCode?: string — opcional, filtrar por país (CO, EC, MX, PE, CR)
 */
export async function importMaterialesFromJson(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { filePath, datos, countryCode } = req.body as {
      filePath?: string;
      datos?: MaterialImportJson;
      countryCode?: string;
    };

    const code = typeof countryCode === 'string' ? countryCode : undefined;

    if (filePath && typeof filePath === 'string') {
      const result = await materialImportService.importFromJsonFile(
        filePath.trim(),
        code
      );
      res.status(200).json({ success: true, data: result });
      return;
    }

    if (datos && typeof datos === 'object' && Array.isArray(datos.materiales)) {
      const result = await materialImportService.importFromJson(datos, code);
      res.status(200).json({ success: true, data: result });
      return;
    }

    res.status(400).json({
      success: false,
      message:
        'Se requiere "filePath" (ruta a .json) o "datos" (objeto con propiedad materiales[]).',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      message: `Error al importar: ${message}`,
    });
  }
}
