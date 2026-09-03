import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  listarPacientesCompartidos,
  obtenerHistorialCompartido,
} from '../../../controllers/medico/historialCompartidoController';

const router = Router();
router.use(authenticate, authorize(UserRole.MEDICO));

router.get('/',                      listarPacientesCompartidos);
router.get('/:pacienteId',           obtenerHistorialCompartido);

export default router;