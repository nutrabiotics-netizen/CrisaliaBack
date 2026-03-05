import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearAsesoria,
  listarMisAsesorias,
  obtenerAsesoria
} from '../../../controllers/paciente/asesorias/asesoriasController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.PACIENTE), crearAsesoria);
router.get('/', authenticate, authorize(UserRole.PACIENTE), listarMisAsesorias);
router.get('/:asesoriaId', authenticate, authorize(UserRole.PACIENTE), obtenerAsesoria);

export default router;
