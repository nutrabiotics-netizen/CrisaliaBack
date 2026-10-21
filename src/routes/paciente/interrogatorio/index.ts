import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { obtenerPreguntasRDA, responderPreguntaRDA } from '../../../controllers/paciente/preguntasRDAController';
import { reiniciarFase2 } from '../../../controllers/paciente/reiniciarFase2Controller';
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
  generarPerfilRadarInterrogatorio,
  agregarParaclinicosOcr,
} from '../../../controllers/paciente/interrogatorio/interrogatorioController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.PACIENTE), crearInterrogatorio);
router.get('/', authenticate, authorize(UserRole.PACIENTE), obtenerInterrogatorios);
router.get('/:interrogatorioId', authenticate, authorize(UserRole.PACIENTE), obtenerInterrogatorioPorId);
router.get('/:interrogatorioId/preguntas-rda', authenticate, authorize(UserRole.PACIENTE), obtenerPreguntasRDA);
router.post('/:interrogatorioId/preguntas-rda', authenticate, authorize(UserRole.PACIENTE), responderPreguntaRDA);
router.post('/:interrogatorioId/reiniciar-fase2', authenticate, authorize(UserRole.PACIENTE), reiniciarFase2);
router.post('/:interrogatorioId/verificar-incoherencias', authenticate, authorize(UserRole.PACIENTE), verificarIncoherencias);
router.put('/:interrogatorioId/respuestas', authenticate, authorize(UserRole.PACIENTE), actualizarRespuestas);
router.put('/:interrogatorioId/completar', authenticate, authorize(UserRole.PACIENTE), completarInterrogatorio);
router.post('/:interrogatorioId/analizar', authenticate, authorize(UserRole.PACIENTE), generarAnalisisIA);

// ── Flujo orquestado por Bedrock Agent ───────────────────────────────────────
// POST /:id/siguiente-seccion → consulta al Agent qué secciones hacer a continuación
//                               y devuelve su estructura JSON lista para el entrevistador
// POST /:id/generar-sintesis  → genera la sección 37 (síntesis funcional completa)
router.post('/:interrogatorioId/siguiente-seccion', authenticate, authorize(UserRole.PACIENTE), siguienteSeccion);
router.post('/:interrogatorioId/generar-sintesis', authenticate, authorize(UserRole.PACIENTE), generarSintesis);
router.post('/:interrogatorioId/perfil-radar', authenticate, authorize(UserRole.PACIENTE), generarPerfilRadarInterrogatorio);
router.post('/:interrogatorioId/paraclinicos-ocr', authenticate, authorize(UserRole.PACIENTE), agregarParaclinicosOcr);

export default router;

