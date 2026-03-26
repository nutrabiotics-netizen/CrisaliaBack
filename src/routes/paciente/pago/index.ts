import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { obtenerEstadoPago, simularPago } from '../../../controllers/paciente/pagoController';

const router = Router();

router.use(authenticate, authorize(UserRole.PACIENTE));

router.get('/estado', obtenerEstadoPago);
router.post('/simular', simularPago);

export default router;
