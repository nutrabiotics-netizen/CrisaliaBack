import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { misReferidos } from '../../../controllers/medico/referidosController';

const router = Router();

router.use(authenticate, authorize(UserRole.MEDICO));

router.get('/', misReferidos);

export default router;
