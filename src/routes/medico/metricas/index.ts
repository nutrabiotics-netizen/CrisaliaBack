import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  getDashboard,
  getTendencia,
  getMotivoConsulta,
  generarReporte
} from '../../../controllers/medico/metricas/metricasController';

const router = Router();

router.get('/dashboard', authenticate, authorize(UserRole.MEDICO), getDashboard);
router.get('/tendencia', authenticate, authorize(UserRole.MEDICO), getTendencia);
router.get('/motivos-consulta', authenticate, authorize(UserRole.MEDICO), getMotivoConsulta);
router.post('/reporte', authenticate, authorize(UserRole.MEDICO), generarReporte);

export default router;
