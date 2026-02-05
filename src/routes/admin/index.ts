import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { buscarCups2026 } from '../../controllers/admin/cups2026Controller';
import {
  importMaterialesFromExcel,
  importMaterialesFromJson,
} from '../../controllers/admin/materialImportController';

const router = Router();

// Ruta para buscar CUPS2026 (accesible para usuarios autenticados)
router.get('/cups2026/search', authenticate, buscarCups2026);

// Importación de materiales desde Excel (body: { filePath, countryCode? })
router.post('/materials/import', authenticate, importMaterialesFromExcel);

// Importación de materiales desde JSON (body: { filePath? } o { datos: { materiales } }, countryCode?)
router.post('/materials/import/json', authenticate, importMaterialesFromJson);

export default router;
