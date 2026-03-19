import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as rips from '../../../controllers/administrativo/ripsController';

const router = Router();

router.get('/consolidado', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.obtenerConsolidadoMes);
router.post('/validar', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.validarDatosMes);
router.get('/descargar', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.generarZipRips);
router.get('/historial', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.listarHistorial);

export default router;
