import { Router } from 'express';
import {
  listarAnamnesisDelPaciente,
  obtenerAnamnesisDetalle,
  guardarNotasMedico,
  editarNotaMedico,
  eliminarNotaMedico,
  marcarPreconsultaRevisada,
  quitarRevisionPreconsulta
} from '../../../controllers/medico/anamnesis/anamnesisController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), listarAnamnesisDelPaciente);
router.get('/:interrogatorioId', authenticate, authorize(UserRole.MEDICO), obtenerAnamnesisDetalle);
router.put('/:interrogatorioId/notas', authenticate, authorize(UserRole.MEDICO), guardarNotasMedico);
router.put('/:interrogatorioId/notas/:notaId', authenticate, authorize(UserRole.MEDICO), editarNotaMedico);
router.delete('/:interrogatorioId/notas/:notaId', authenticate, authorize(UserRole.MEDICO), eliminarNotaMedico);
router.put('/:interrogatorioId/marcar-revisada', authenticate, authorize(UserRole.MEDICO), marcarPreconsultaRevisada);
router.put('/:interrogatorioId/quitar-revision', authenticate, authorize(UserRole.MEDICO), quitarRevisionPreconsulta);

export default router;