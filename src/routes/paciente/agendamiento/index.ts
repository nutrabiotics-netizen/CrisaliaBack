import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerMedicosDisponibles,
  obtenerMedicoPorId,
  obtenerHorariosDisponibles,
  crearCita,
  obtenerCitasPaciente,
  cancelarCita
} from '../../../controllers/paciente/agendamiento/agendamientoController';

const router = Router();

router.get('/medicos', authenticate, authorize(UserRole.PACIENTE), obtenerMedicosDisponibles);
router.get('/medicos/:medicoId', authenticate, authorize(UserRole.PACIENTE), obtenerMedicoPorId);
router.get('/medicos/:medicoId/horarios', authenticate, authorize(UserRole.PACIENTE), obtenerHorariosDisponibles);
router.get('/citas', authenticate, authorize(UserRole.PACIENTE), obtenerCitasPaciente);
router.post('/citas', authenticate, authorize(UserRole.PACIENTE), crearCita);
router.put('/citas/:citaId/cancelar', authenticate, authorize(UserRole.PACIENTE), cancelarCita);

export default router;

