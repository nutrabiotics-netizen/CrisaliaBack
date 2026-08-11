import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearInterrogatorio,
  obtenerInterrogatorios,
  obtenerInterrogatorioPorId,
  actualizarRespuestas,
  verificarIncoherencias,
  completarInterrogatorio,
  generarAnalisisIA,
  siguienteSeccion,
  generarSintesis,
} from '../../../controllers/paciente/interrogatorio/interrogatorioController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.PACIENTE), crearInterrogatorio);
router.get('/', authenticate, authorize(UserRole.PACIENTE), obtenerInterrogatorios);
router.get('/:interrogatorioId', authenticate, authorize(UserRole.PACIENTE), obtenerInterrogatorioPorId);
router.post('/:interrogatorioId/verificar-incoherencias', authenticate, authorize(UserRole.PACIENTE), verificarIncoherencias);
router.put('/:interrogatorioId/respuestas', authenticate, authorize(UserRole.PACIENTE), actualizarRespuestas);
router.put('/:interrogatorioId/completar', authenticate, authorize(UserRole.PACIENTE), completarInterrogatorio);
router.post('/:interrogatorioId/analizar', authenticate, authorize(UserRole.PACIENTE), generarAnalisisIA);

// ── Flujo orquestado por Bedrock Agent ───────────────────────────────────────
// POST /:id/siguiente-seccion → consulta al Agent qué secciones hacer a continuación
//                               y devuelve su estructura JSON lista para el entrevistador
// POST /:id/generar-sintesis  → genera la sección 37 (síntesis funcional completa)
router.post('/:interrogatorioId/siguiente-seccion', authenticate, authorize(UserRole.PACIENTE), siguienteSeccion);
router.post('/:interrogatorioId/generar-sintesis',  authenticate, authorize(UserRole.PACIENTE), generarSintesis);

export default router;

