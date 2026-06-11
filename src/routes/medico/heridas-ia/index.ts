import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { proponer, autoAplicar, infoCita } from '../../../controllers/medico/heridasIa/heridasIaController';

/**
 * Rutas paralelas IA Heridas — aisladas del flujo IA-guiada general.
 *  POST /cita/:citaId/propose     → Bedrock propone secciones
 *  POST /cita/:citaId/auto-apply  → aplica propuestas al HC Heridas (upsert)
 */
const router = Router();

router.get('/cita/:citaId/info',        authenticate, authorize(UserRole.MEDICO), infoCita);
router.post('/cita/:citaId/propose',    authenticate, authorize(UserRole.MEDICO), proponer);
router.post('/cita/:citaId/auto-apply', authenticate, authorize(UserRole.MEDICO), autoAplicar);

export default router;
