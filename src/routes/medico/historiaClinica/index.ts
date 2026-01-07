import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearHistoriaClinica,
  obtenerHistoriaClinica,
  obtenerHistoriaClinicaPorCita,
  obtenerHistoriasClinicasPorPaciente,
  actualizarHistoriaClinica,
  eliminarHistoriaClinica
} from '../../../controllers/medico/historiaClinica/historiaClinicaController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearHistoriaClinica);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerHistoriaClinicaPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerHistoriasClinicasPorPaciente);
router.get('/:historiaId', authenticate, authorize(UserRole.MEDICO), obtenerHistoriaClinica);
router.put('/:historiaId', authenticate, authorize(UserRole.MEDICO), actualizarHistoriaClinica);
router.delete('/:historiaId', authenticate, authorize(UserRole.MEDICO), eliminarHistoriaClinica);

export default router;

