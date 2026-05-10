import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { checkSuscripcion } from '../../../middleware/checkSuscripcion';
import { UserRole } from '../../../types';
import {
  crearHistoriaClinica,
  obtenerHistoriaClinica,
  obtenerHistoriaClinicaPorCita,
  obtenerHistoriasClinicasPorPaciente,
  actualizarHistoriaClinica,
  eliminarHistoriaClinica,
  obtenerResumenUltimaHistoria
} from '../../../controllers/medico/historiaClinica/historiaClinicaController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, crearHistoriaClinica);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, obtenerHistoriaClinicaPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, obtenerHistoriasClinicasPorPaciente);
router.get('/paciente/:pacienteId/last-summary', authenticate, authorize(UserRole.MEDICO), obtenerResumenUltimaHistoria);
router.get('/:historiaId', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, obtenerHistoriaClinica);
router.put('/:historiaId', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, actualizarHistoriaClinica);
router.delete('/:historiaId', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, eliminarHistoriaClinica);

export default router;

