import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as rx from '../../../controllers/administrativo/experienciaController';

const router = Router();

router.get('/metricas', authenticate, authorize(UserRole.ADMINISTRATIVO), rx.obtenerMetricasGlobales);
router.get('/sugerencias', authenticate, authorize(UserRole.ADMINISTRATIVO), rx.listarSugerencias);
router.post('/seed', authenticate, authorize(UserRole.ADMINISTRATIVO), rx.generarSemillaPruebas);

export default router;
