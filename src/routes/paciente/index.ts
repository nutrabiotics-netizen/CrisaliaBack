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
import alimentosRoutes from './alimentos';
import recomendacionRoutes from './recomendacion';
import codigoDescuentoRoutes from './codigo-descuento';
import cuidadorIARoutes from './cuidador-ia';
import invitarMedicoRoutes from './invitar-medico';
import historiaClinicaRoutes from './historia-clinica';
import tratamientoRoutes from './tratamiento';
import transcriptionRoutes from './transcription';
import chatRoutes from './chat';
import wearablesRoutes from './wearables';

const router = Router();

router.use('/perfil', perfilRoutes);
router.use('/agendamiento', agendamientoRoutes);
router.use('/interrogatorio', interrogatorioRoutes);
router.use('/documentos', documentosRoutes);
router.use('/asesorias', asesoriasRoutes);
router.use('/paraclinicos', paraclinicosRoutes);
router.use('/formula-medica', formulaMedicaRoutes);
router.use('/pago', pagoRoutes);
router.use('/orden-examenes', ordenExamenesRoutes);
router.use('/alimentos', alimentosRoutes);
router.use('/recomendacion', recomendacionRoutes);
router.use('/codigo-descuento', codigoDescuentoRoutes);
router.use('/cuidador-ia', cuidadorIARoutes);
router.use('/invitar-medico', invitarMedicoRoutes);
router.use('/historia-clinica', historiaClinicaRoutes);
router.use('/tratamiento', tratamientoRoutes);
router.use('/transcription', transcriptionRoutes);
router.use('/chat', chatRoutes);
router.use('/wearables', wearablesRoutes);

export default router;

