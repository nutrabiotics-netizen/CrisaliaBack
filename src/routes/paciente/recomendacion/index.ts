import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { generarRecomendacionAutomatica } from '../../../controllers/paciente/recomendacionController';

const router = Router();

router.use(authenticate, authorize(UserRole.PACIENTE));

router.post('/automatica', generarRecomendacionAutomatica);

export default router;