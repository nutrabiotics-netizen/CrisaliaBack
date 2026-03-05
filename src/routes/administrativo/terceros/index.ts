import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  eliminar
} from '../../../controllers/administrativo/terceros/tercerosController';

const router = Router();

router.get('/', authenticate, authorize(UserRole.ADMINISTRATIVO), listar);
router.get('/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), obtenerPorId);
router.post('/', authenticate, authorize(UserRole.ADMINISTRATIVO), crear);
router.put('/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), actualizar);
router.delete('/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), eliminar);

export default router;
