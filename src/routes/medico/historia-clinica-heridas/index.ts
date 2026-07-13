import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerPorCita,
  crearOActualizar,
  listarPorPaciente,
  finalizarConsulta
} from '../../../controllers/medico/historiaClinicaHeridas/historiaClinicaHeridasController';

const router = Router();

router.get('/cita/:citaId',              authenticate, authorize(UserRole.MEDICO), obtenerPorCita);
router.post('/cita/:citaId',             authenticate, authorize(UserRole.MEDICO), crearOActualizar);
router.post('/cita/:citaId/finalizar',   authenticate, authorize(UserRole.MEDICO), finalizarConsulta);
router.get('/paciente/:pacienteId',      authenticate, authorize(UserRole.MEDICO), listarPorPaciente);

export default router;
