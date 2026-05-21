import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerHistoriaPorCita,
  listarHistoriasDelPaciente,
  obtenerDetalleCompleto,
  obtenerRecomendacionesIA
} from '../../../controllers/paciente/historiaClinica/pacienteHistoriaClinicaController';

const router = Router();

router.get('/', authenticate, authorize(UserRole.PACIENTE), listarHistoriasDelPaciente);
router.get('/cita/:citaId', authenticate, authorize(UserRole.PACIENTE), obtenerHistoriaPorCita);
router.get('/cita/:citaId/detalle', authenticate, authorize(UserRole.PACIENTE), obtenerDetalleCompleto);
router.get('/cita/:citaId/recomendaciones-ia', authenticate, authorize(UserRole.PACIENTE), obtenerRecomendacionesIA);

export default router;
