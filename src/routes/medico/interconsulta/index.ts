import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearInterconsulta,
  obtenerInterconsultaPorCita,
  obtenerInterconsultasPorPaciente,
  obtenerInterconsultaPorId,
  actualizarInterconsulta,
  eliminarInterconsulta
} from '../../../controllers/medico/interconsulta/interconsultaController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearInterconsulta);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerInterconsultaPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerInterconsultasPorPaciente);
router.get('/:interconsultaId', authenticate, authorize(UserRole.MEDICO), obtenerInterconsultaPorId);
router.put('/:interconsultaId', authenticate, authorize(UserRole.MEDICO), actualizarInterconsulta);
router.delete('/:interconsultaId', authenticate, authorize(UserRole.MEDICO), eliminarInterconsulta);

export default router;
