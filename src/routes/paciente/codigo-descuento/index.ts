import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { validarCodigoDescuento } from '../../../controllers/paciente/codigoDescuentoController';

const router = Router();

router.use(authenticate, authorize(UserRole.PACIENTE));

router.post('/validar', validarCodigoDescuento);

export default router;
