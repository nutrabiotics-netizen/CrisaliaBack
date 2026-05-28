import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerHistoriaPorCita,
  listarHistoriasDelPaciente,
  obtenerDetalleCompleto,
  obtenerRecomendacionesIA,
  obtenerResumenCitaIA,
  preguntarAsistenteCitaIA
} from '../../../controllers/paciente/historiaClinica/pacienteHistoriaClinicaController';

const router = Router();

router.get('/', authenticate, authorize(UserRole.PACIENTE), listarHistoriasDelPaciente);
router.get('/cita/:citaId', authenticate, authorize(UserRole.PACIENTE), obtenerHistoriaPorCita);
router.get('/cita/:citaId/detalle', authenticate, authorize(UserRole.PACIENTE), obtenerDetalleCompleto);
router.get('/cita/:citaId/recomendaciones-ia', authenticate, authorize(UserRole.PACIENTE), obtenerRecomendacionesIA);
router.get('/cita/:citaId/resumen-ia', authenticate, authorize(UserRole.PACIENTE), obtenerResumenCitaIA);
router.post('/cita/:citaId/preguntar', authenticate, authorize(UserRole.PACIENTE), preguntarAsistenteCitaIA);

export default router;
