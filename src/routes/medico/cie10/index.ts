import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  buscarCie10,
  obtenerCie10,
  statsCie10
} from '../../../controllers/shared/cie10/cie10Controller';

const router = Router();

router.get('/search', authenticate, authorize(UserRole.MEDICO), buscarCie10);
router.get('/stats', authenticate, authorize(UserRole.MEDICO), statsCie10);
router.get('/:codigo', authenticate, authorize(UserRole.MEDICO), obtenerCie10);

export default router;
