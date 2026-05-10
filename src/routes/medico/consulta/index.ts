import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { obtenerConsulta, iniciarConsulta } from '../../../controllers/medico/consulta/consultaController';

const router = Router();

router.get('/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerConsulta);
router.put('/:citaId/iniciar', authenticate, authorize(UserRole.MEDICO), iniciarConsulta);

export default router;
