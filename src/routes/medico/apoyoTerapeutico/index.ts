import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearApoyoTerapeutico,
  obtenerApoyoTerapeuticoPorCita,
  obtenerApoyosTerapeuticosPorPaciente,
  obtenerApoyoTerapeuticoPorId,
  actualizarApoyoTerapeutico,
  eliminarApoyoTerapeutico
} from '../../../controllers/medico/apoyoTerapeutico/apoyoTerapeuticoController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearApoyoTerapeutico);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerApoyoTerapeuticoPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerApoyosTerapeuticosPorPaciente);
router.get('/:apoyoTerapeuticoId', authenticate, authorize(UserRole.MEDICO), obtenerApoyoTerapeuticoPorId);
router.put('/:apoyoTerapeuticoId', authenticate, authorize(UserRole.MEDICO), actualizarApoyoTerapeutico);
router.delete('/:apoyoTerapeuticoId', authenticate, authorize(UserRole.MEDICO), eliminarApoyoTerapeutico);

export default router;
