import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { buscarCups2026 } from '../../controllers/admin/cups2026Controller';
import { buscarParametrosNutrabiotics } from '../../controllers/admin/parametrosNutrabioticsController';

const router = Router();

// Ruta para buscar CUPS2026 (accesible para usuarios autenticados)
router.get('/cups2026/search', authenticate, buscarCups2026);

// Ruta para buscar parámetros Nutrabiotics (reemplazo de CUPS en interconsulta, exámenes, apoyo, imagenología)
router.get('/parametros-nutrabiotics/search', authenticate, buscarParametrosNutrabiotics);

export default router;
