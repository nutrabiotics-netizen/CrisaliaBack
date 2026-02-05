import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { buscarMateriales } from '../../../controllers/medico/materialesController';

const router = Router();

router.get('/search', authenticate, authorize(UserRole.MEDICO), buscarMateriales);

export default router;
