import { Router } from 'express';
import { getPerfilMedico, updatePerfilMedico } from '../../../controllers/medico/perfil/perfilController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

router.get('/', authenticate, authorize(UserRole.MEDICO), getPerfilMedico);
router.put('/', authenticate, authorize(UserRole.MEDICO), updatePerfilMedico);

export default router;

