import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  listarPagos,
  registrarPago,
  getEstadisticas,
  actualizarEstado
} from '../../../controllers/medico/pago/pagoController';

const router = Router();

router.get('/estadisticas', authenticate, authorize(UserRole.MEDICO), getEstadisticas);
router.get('/', authenticate, authorize(UserRole.MEDICO), listarPagos);
router.post('/', authenticate, authorize(UserRole.MEDICO), registrarPago);
router.put('/:pagoId/estado', authenticate, authorize(UserRole.MEDICO), actualizarEstado);

export default router;
