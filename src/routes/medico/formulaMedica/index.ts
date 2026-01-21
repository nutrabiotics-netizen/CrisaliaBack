import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  verificarYCrearFormulaMedica,
  obtenerFormulaMedicaPorCita,
  obtenerFormulasMedicasPorPaciente,
  obtenerFormulaMedicaPorId,
  eliminarFormulaMedica
} from '../../../controllers/medico/formulaMedica/formulaMedicaController';

const router = Router();

router.post('/verificar-y-crear', authenticate, authorize(UserRole.MEDICO), verificarYCrearFormulaMedica);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerFormulaMedicaPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerFormulasMedicasPorPaciente);
router.get('/:formulaId', authenticate, authorize(UserRole.MEDICO), obtenerFormulaMedicaPorId);
router.delete('/:formulaId', authenticate, authorize(UserRole.MEDICO), eliminarFormulaMedica);

export default router;
