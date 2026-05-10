import { Router } from 'express';
import {
  listarAnamnesisDelPaciente,
  obtenerAnamnesisDetalle,
  guardarNotasMedico
} from '../../../controllers/medico/anamnesis/anamnesisController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

// Listar interrogatorios de un paciente
router.get(
  '/paciente/:pacienteId',
  authenticate,
  authorize(UserRole.MEDICO),
  listarAnamnesisDelPaciente
);

// Detalle completo de un interrogatorio
router.get(
  '/:interrogatorioId',
  authenticate,
  authorize(UserRole.MEDICO),
  obtenerAnamnesisDetalle
);

// Guardar/actualizar notas médico sobre un interrogatorio
router.put(
  '/:interrogatorioId/notas',
  authenticate,
  authorize(UserRole.MEDICO),
  guardarNotasMedico
);

export default router;
