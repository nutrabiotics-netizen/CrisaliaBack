import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerActivo,
  obtenerIndicaciones,
  marcarToma,
  obtenerRecomendaciones,
  obtenerHabitos
} from '../../../controllers/paciente/tratamiento/pacienteTratamientoController';

const router = Router();

router.get('/activo', authenticate, authorize(UserRole.PACIENTE), obtenerActivo);
router.get('/indicaciones', authenticate, authorize(UserRole.PACIENTE), obtenerIndicaciones);
router.post('/marcar-toma', authenticate, authorize(UserRole.PACIENTE), marcarToma);
router.get('/recomendaciones', authenticate, authorize(UserRole.PACIENTE), obtenerRecomendaciones);
router.get('/habitos', authenticate, authorize(UserRole.PACIENTE), obtenerHabitos);

export default router;
