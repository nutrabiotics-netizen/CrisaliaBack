import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  compartirConMedico,
  listarCompartidos,
  actualizarSecciones,
  revocarAcceso,
} from '../../../controllers/paciente/compartirHistorialController';

const router = Router();
router.use(authenticate, authorize(UserRole.PACIENTE));

router.post('/',           compartirConMedico);
router.get('/',            listarCompartidos);
router.put('/:id',         actualizarSecciones);
router.delete('/:id',      revocarAcceso);

export default router;