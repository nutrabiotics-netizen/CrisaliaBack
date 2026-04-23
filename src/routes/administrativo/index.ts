import { Router } from 'express';
import tercerosRoutes from './terceros';
import ingresoRoutes from './ingreso';
import agendaRoutes from './agenda';
import visionEstadisticasRoutes from './vision-estadisticas';
import ripsRoutes from './rips';
// import contingenciaRoutes from './contingencia';
import experienciaUsuariosRoutes from './experiencia-usuarios';
import visitaPacienteRoutes from './visita-paciente';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';
import { demorasActivas, registrarDemora, reporteDemoras } from '../../controllers/administrativo/demorasController';

const router = Router();

router.use('/terceros', tercerosRoutes);
router.use('/ingreso', ingresoRoutes);
router.use('/agenda', agendaRoutes);
router.use('/vision-estadisticas', visionEstadisticasRoutes);
router.use('/rips', ripsRoutes);
// router.use('/contingencia', contingenciaRoutes);
router.use('/experiencia-usuarios', experienciaUsuariosRoutes);
router.use('/visita-paciente', visitaPacienteRoutes);

// Fase 6 — Demoras
router.get('/demoras/activas', authenticate, authorize(UserRole.ADMINISTRATIVO), demorasActivas);
router.post('/demoras/:citaId/registrar', authenticate, authorize(UserRole.ADMINISTRATIVO), registrarDemora);
router.get('/demoras/reporte', authenticate, authorize(UserRole.ADMINISTRATIVO), reporteDemoras);

export default router;
