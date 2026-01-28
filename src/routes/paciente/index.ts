import { Router } from 'express';
import perfilRoutes from './perfil';
import agendamientoRoutes from './agendamiento';
import interrogatorioRoutes from './interrogatorio';
import documentosRoutes from './documentos';
// import pagoRoutes from './pago';
// import consultaRoutes from './consulta';
// import iaEntrenadaRoutes from './ia-entrenada';
// import seguimientoRoutes from './seguimiento';

const router = Router();

// Montar todas las rutas del módulo paciente
router.use('/perfil', perfilRoutes);
router.use('/agendamiento', agendamientoRoutes);
router.use('/interrogatorio', interrogatorioRoutes);
router.use('/documentos', documentosRoutes);
// router.use('/pago', pagoRoutes);
// router.use('/consulta', consultaRoutes);
// router.use('/ia-entrenada', iaEntrenadaRoutes);
// router.use('/seguimiento', seguimientoRoutes);

export default router;

