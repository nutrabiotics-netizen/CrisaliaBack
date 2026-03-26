import { Router } from 'express';
import perfilRoutes from './perfil';
import agendamientoRoutes from './agendamiento';
import interrogatorioRoutes from './interrogatorio';
import documentosRoutes from './documentos';
import asesoriasRoutes from './asesorias';
import paraclinicosRoutes from './paraclinicos';
import formulaMedicaRoutes from './formula-medica';
import pagoRoutes from './pago';
import ordenExamenesRoutes from './orden-examenes';

const router = Router();


// Montar todas las rutas del módulo paciente
router.use('/perfil', perfilRoutes);
router.use('/agendamiento', agendamientoRoutes);
router.use('/interrogatorio', interrogatorioRoutes);
router.use('/documentos', documentosRoutes);
router.use('/asesorias', asesoriasRoutes);
router.use('/paraclinicos', paraclinicosRoutes);
router.use('/formula-medica', formulaMedicaRoutes);
router.use('/pago', pagoRoutes);
router.use('/orden-examenes', ordenExamenesRoutes);

export default router;

