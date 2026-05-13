import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerHistoriaPorCita,
  listarHistoriasDelPaciente
} from '../../../controllers/paciente/historiaClinica/pacienteHistoriaClinicaController';

const router = Router();

router.get('/', authenticate, authorize(UserRole.PACIENTE), listarHistoriasDelPaciente);
router.get('/cita/:citaId', authenticate, authorize(UserRole.PACIENTE), obtenerHistoriaPorCita);

export default router;
