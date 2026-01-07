import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { obtenerPerfil, actualizarPerfil } from '../../../controllers/paciente/perfilController';

const router = Router();

router.get('/', authenticate, authorize(UserRole.PACIENTE), obtenerPerfil);
router.put('/', authenticate, authorize(UserRole.PACIENTE), actualizarPerfil);

export default router;

