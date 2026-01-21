import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { buscarCups2026 } from '../../controllers/admin/cups2026Controller';

const router = Router();

// Ruta para buscar CUPS2026 (accesible para usuarios autenticados)
router.get('/cups2026/search', authenticate, buscarCups2026);

export default router;
