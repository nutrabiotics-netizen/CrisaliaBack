import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { buscarMedicamentos } from '../../../controllers/medico/materialesController';

const router = Router();

router.get('/search', authenticate, authorize(UserRole.MEDICO), buscarMedicamentos);

export default router;
