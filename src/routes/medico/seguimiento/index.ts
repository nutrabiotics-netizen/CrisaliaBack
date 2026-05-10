import { Router } from 'express';
import {
  listarSeguimiento,
  obtenerSeguimientoPaciente
} from '../../../controllers/medico/seguimiento/seguimientoController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

// Lista todos los pacientes con resumen de seguimiento
router.get('/', authenticate, authorize(UserRole.MEDICO), listarSeguimiento);

// Línea de tiempo clínica de un paciente específico
router.get(
  '/paciente/:pacienteId',
  authenticate,
  authorize(UserRole.MEDICO),
  obtenerSeguimientoPaciente
);

export default router;
