import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { checkSuscripcion } from '../../../middleware/checkSuscripcion';
import { UserRole } from '../../../types';
import {
  verificarYCrearFormulaMedica,
  obtenerFormulaMedicaPorCita,
  obtenerFormulasMedicasPorPaciente,
  obtenerFormulaMedicaPorId,
  eliminarFormulaMedica,
  generarOrdenAlivia
} from '../../../controllers/medico/formulaMedica/formulaMedicaController';

const router = Router();

router.post('/verificar-y-crear', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, verificarYCrearFormulaMedica);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerFormulaMedicaPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerFormulasMedicasPorPaciente);
router.post('/:formulaId/generar-orden-alivia', authenticate, authorize(UserRole.MEDICO), generarOrdenAlivia);
router.get('/:formulaId', authenticate, authorize(UserRole.MEDICO), obtenerFormulaMedicaPorId);
router.delete('/:formulaId', authenticate, authorize(UserRole.MEDICO), eliminarFormulaMedica);

export default router;
