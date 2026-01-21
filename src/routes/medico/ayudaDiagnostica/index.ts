import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearAyudaDiagnostica,
  obtenerAyudaDiagnosticaPorCita,
  obtenerAyudasDiagnosticasPorPaciente,
  obtenerAyudaDiagnosticaPorId,
  actualizarAyudaDiagnostica,
  eliminarAyudaDiagnostica
} from '../../../controllers/medico/ayudaDiagnostica/ayudaDiagnosticaController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearAyudaDiagnostica);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerAyudaDiagnosticaPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerAyudasDiagnosticasPorPaciente);
router.get('/:ayudaDiagnosticaId', authenticate, authorize(UserRole.MEDICO), obtenerAyudaDiagnosticaPorId);
router.put('/:ayudaDiagnosticaId', authenticate, authorize(UserRole.MEDICO), actualizarAyudaDiagnostica);
router.delete('/:ayudaDiagnosticaId', authenticate, authorize(UserRole.MEDICO), eliminarAyudaDiagnostica);

export default router;
