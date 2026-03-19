import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as estadisticas from '../../../controllers/administrativo/estadisticasController';

const router = Router();

router.get('/boxes', authenticate, authorize(UserRole.ADMINISTRATIVO), estadisticas.rendimientoBoxes);
router.get('/profesionales', authenticate, authorize(UserRole.ADMINISTRATIVO), estadisticas.rendimientoProfesionales);
router.get('/personal', authenticate, authorize(UserRole.ADMINISTRATIVO), estadisticas.estadisticasPersonal);

export default router;
