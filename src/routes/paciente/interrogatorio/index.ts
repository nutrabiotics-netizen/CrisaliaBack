import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearInterrogatorio,
  obtenerInterrogatorios,
  obtenerInterrogatorio,
  actualizarRespuestas,
  completarInterrogatorio,
  generarAnalisisIA
} from '../../../controllers/paciente/interrogatorio/interrogatorioController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.PACIENTE), crearInterrogatorio);
router.get('/', authenticate, authorize(UserRole.PACIENTE), obtenerInterrogatorios);
router.get('/:interrogatorioId', authenticate, authorize(UserRole.PACIENTE), obtenerInterrogatorio);
router.put('/:interrogatorioId/respuestas', authenticate, authorize(UserRole.PACIENTE), actualizarRespuestas);
router.put('/:interrogatorioId/completar', authenticate, authorize(UserRole.PACIENTE), completarInterrogatorio);
router.post('/:interrogatorioId/analizar', authenticate, authorize(UserRole.PACIENTE), generarAnalisisIA);

export default router;

