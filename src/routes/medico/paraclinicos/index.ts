import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerParaclinicosPaciente,
  obtenerAnalisisEvolutivoPaciente,
  actualizarSemaforoParaclinico,
  marcarParaclinicoRevisado,
} from '../../../controllers/medico/paraclinicosController';

const router = Router();

// GET /api/medico/paraclinicos/:pacienteId — listar paraclínicos del paciente
router.get(
  '/:pacienteId',
  authenticate,
  authorize(UserRole.MEDICO),
  obtenerParaclinicosPaciente
);

// GET /api/medico/paraclinicos/:pacienteId/analisis-evolutivo — análisis IA
router.get(
  '/:pacienteId/analisis-evolutivo',
  authenticate,
  authorize(UserRole.MEDICO),
  obtenerAnalisisEvolutivoPaciente
);

// PUT /api/medico/paraclinicos/:paraclinicoId/semaforo — override semáforo
router.put(
  '/:paraclinicoId/semaforo',
  authenticate,
  authorize(UserRole.MEDICO),
  actualizarSemaforoParaclinico
);

// PUT /api/medico/paraclinicos/:paraclinicoId/marcar-revisado
router.put(
  '/:paraclinicoId/marcar-revisado',
  authenticate,
  authorize(UserRole.MEDICO),
  marcarParaclinicoRevisado
);

export default router;
