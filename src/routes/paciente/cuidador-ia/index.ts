import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  enviarMensaje,
  obtenerHistorial,
  borrarHistorial,
  alertarMedico
} from '../../../controllers/paciente/cuidadorIAController';

const router = Router();

router.use(authenticate, authorize(UserRole.PACIENTE));

router.get('/historial', obtenerHistorial);
router.post('/mensaje', enviarMensaje);
router.post('/alertar-medico', alertarMedico);
router.delete('/historial', borrarHistorial);

export default router;
