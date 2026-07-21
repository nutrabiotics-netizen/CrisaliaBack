import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';
import { obtenerConfiguracion, guardarConfiguracion } from '../../controllers/medico/recordatoriosController';

const router = Router();

router.get('/', authenticate, authorize(UserRole.MEDICO), obtenerConfiguracion);
router.put('/', authenticate, authorize(UserRole.MEDICO), guardarConfiguracion);

export default router;
