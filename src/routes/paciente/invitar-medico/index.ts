import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { invitarMedico } from '../../../controllers/paciente/invitarMedicoController';

const router = Router();

router.use(authenticate, authorize(UserRole.PACIENTE));

router.post('/', invitarMedico);

export default router;
