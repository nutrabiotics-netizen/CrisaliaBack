import { Router } from 'express';
import tercerosRoutes from './terceros';
import ingresoRoutes from './ingreso';
import agendaRoutes from './agenda';
// import visionEstadisticasRoutes from './vision-estadisticas';
// import contingenciaRoutes from './contingencia';
// import experienciaUsuariosRoutes from './experiencia-usuarios';

const router = Router();

router.use('/terceros', tercerosRoutes);
router.use('/ingreso', ingresoRoutes);
router.use('/agenda', agendaRoutes);
// router.use('/vision-estadisticas', visionEstadisticasRoutes);
// router.use('/contingencia', contingenciaRoutes);
// router.use('/experiencia-usuarios', experienciaUsuariosRoutes);

export default router;

