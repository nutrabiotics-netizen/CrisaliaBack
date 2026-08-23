import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerParaclinicosPaciente,
  obtenerAnalisisEvolutivoPaciente,
  actualizarSemaforoParaclinico,
  marcarParaclinicoRevisado,
  quitarRevisadoParaclinico,
  agregarNotaParaclinico,
  editarNotaParaclinico,
  eliminarNotaParaclinico,
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

// PUT /api/medico/paraclinicos/:paraclinicoId/quitar-revisado
router.put(
  '/:paraclinicoId/quitar-revisado',
  authenticate,
  authorize(UserRole.MEDICO),
  quitarRevisadoParaclinico
);

// Notas del médico
router.put('/:paraclinicoId/notas',            authenticate, authorize(UserRole.MEDICO), agregarNotaParaclinico);
router.put('/:paraclinicoId/notas/:notaId',    authenticate, authorize(UserRole.MEDICO), editarNotaParaclinico);
router.delete('/:paraclinicoId/notas/:notaId', authenticate, authorize(UserRole.MEDICO), eliminarNotaParaclinico);

export default router;
