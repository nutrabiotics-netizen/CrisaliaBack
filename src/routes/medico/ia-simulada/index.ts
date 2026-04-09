import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  getDemoAnamnesisLista,
  getDemoMetricasImpacto,
  getDemoVersiculos,
  getRepositorioMF,
  postAnamnesisMedico,
  postContrato,
  postDiagnosticos,
  postEstrategiasTerapeuticas,
  postOptimizarAgenda,
  postParaclinicos,
  postResumenControl,
  postTranscripcion
} from '../../../controllers/medico/iaSimulada/iaSimuladaController';

const router = Router();
const medicoOnly = [authenticate, authorize(UserRole.MEDICO)] as const;

/** Respuestas simuladas de IA para el perfil médico (sin persistencia ni LLM). */
router.post('/contrato', ...medicoOnly, postContrato);
router.post('/anamnesis-medico', ...medicoOnly, postAnamnesisMedico);
router.post('/diagnosticos', ...medicoOnly, postDiagnosticos);
router.post('/estrategias-terapeuticas', ...medicoOnly, postEstrategiasTerapeuticas);
router.post('/transcripcion', ...medicoOnly, postTranscripcion);
router.post('/paraclinicos', ...medicoOnly, postParaclinicos);
router.post('/resumen-control', ...medicoOnly, postResumenControl);
router.get('/repositorio-mf', ...medicoOnly, getRepositorioMF);
router.post('/optimizar-agenda', ...medicoOnly, postOptimizarAgenda);

router.get('/demo/anamnesis-lista', ...medicoOnly, getDemoAnamnesisLista);
router.get('/demo/metricas-impacto', ...medicoOnly, getDemoMetricasImpacto);
router.get('/demo/versiculos', ...medicoOnly, getDemoVersiculos);

export default router;
