import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearIncapacidad,
  obtenerIncapacidadPorCita,
  obtenerIncapacidadesPorPaciente,
  obtenerIncapacidadPorId,
  actualizarIncapacidad,
  eliminarIncapacidad
} from '../../../controllers/medico/incapacidad/incapacidadController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearIncapacidad);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerIncapacidadPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerIncapacidadesPorPaciente);
router.get('/:incapacidadId', authenticate, authorize(UserRole.MEDICO), obtenerIncapacidadPorId);
router.put('/:incapacidadId', authenticate, authorize(UserRole.MEDICO), actualizarIncapacidad);
router.delete('/:incapacidadId', authenticate, authorize(UserRole.MEDICO), eliminarIncapacidad);

export default router;
