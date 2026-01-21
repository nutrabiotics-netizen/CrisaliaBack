import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearExamenMedico,
  obtenerExamenMedicoPorCita,
  obtenerExamenesMedicosPorPaciente,
  obtenerExamenMedicoPorId,
  actualizarExamenMedico,
  eliminarExamenMedico
} from '../../../controllers/medico/examenMedico/examenMedicoController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearExamenMedico);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerExamenMedicoPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerExamenesMedicosPorPaciente);
router.get('/:examenMedicoId', authenticate, authorize(UserRole.MEDICO), obtenerExamenMedicoPorId);
router.put('/:examenMedicoId', authenticate, authorize(UserRole.MEDICO), actualizarExamenMedico);
router.delete('/:examenMedicoId', authenticate, authorize(UserRole.MEDICO), eliminarExamenMedico);

export default router;
