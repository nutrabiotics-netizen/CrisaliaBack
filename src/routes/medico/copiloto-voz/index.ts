import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  getCopilotoVozConfig,
  getCopilotoVozHealth,
  putCopilotoVozConfig
} from '../../../controllers/medico/copiloto-voz/copilotoVozController';

const router = Router();

router.get('/health', authenticate, authorize(UserRole.MEDICO), getCopilotoVozHealth);
router.get('/config', authenticate, authorize(UserRole.MEDICO), getCopilotoVozConfig);
router.put('/config', authenticate, authorize(UserRole.MEDICO), putCopilotoVozConfig);

export default router;
