import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as rips from '../../../controllers/administrativo/ripsController';

const router = Router();

// Fases 1-2 (existentes)
router.get('/consolidado', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.obtenerConsolidadoMes);
router.post('/validar', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.validarDatosMes);
router.get('/descargar', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.generarZipRips);
router.get('/historial', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.listarHistorial);

// Fases 3-5 (Fase 6)
router.post('/:paqueteId/validar', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.validarRips);
router.post('/:paqueteId/generar-archivo', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.generarArchivoRips);
router.post('/:paqueteId/marcar-enviado', authenticate, authorize(UserRole.ADMINISTRATIVO), rips.marcarEnviado);

export default router;
