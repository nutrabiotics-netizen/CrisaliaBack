import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { obtenerOrdenExamenesVigente } from '../../../controllers/paciente/ordenExamenesController';

const router = Router();
router.use(authenticate, authorize(UserRole.PACIENTE));
router.get('/vigente', obtenerOrdenExamenesVigente);

export default router;
