import { Router } from 'express';
import perfilRoutes from './perfil';
import agendamientoRoutes from './agendamiento';
import historiaClinicaRoutes from './historiaClinica';
import formulaMedicaRoutes from './formulaMedica';
import incapacidadRoutes from './incapacidad';
import interconsultaRoutes from './interconsulta';
import examenMedicoRoutes from './examenMedico';
import apoyoTerapeuticoRoutes from './apoyoTerapeutico';
import ayudaDiagnosticaRoutes from './ayudaDiagnostica';
import videocallRoutes from './videocall';
import transcriptionRoutes from './transcription';
import materialesRoutes from './materiales';
import asesoriasRoutes from './asesorias';
import iaSimuladaRoutes from './ia-simulada';
import copilotoVozRoutes from './copiloto-voz';
// import anamnesisRoutes from './anamnesis';
// import pagoRoutes from './pago';
// import consultaRoutes from './consulta';
// import iaEntrenadaRoutes from './ia-entrenada';
// import seguimientoRoutes from './seguimiento';

const router = Router();

// Montar todas las rutas del módulo médico
router.use('/perfil', perfilRoutes);
router.use('/agendamiento', agendamientoRoutes);
router.use('/historia-clinica', historiaClinicaRoutes);
router.use('/formula-medica', formulaMedicaRoutes);
router.use('/incapacidad', incapacidadRoutes);
router.use('/interconsulta', interconsultaRoutes);
router.use('/examen-medico', examenMedicoRoutes);
router.use('/apoyo-terapeutico', apoyoTerapeuticoRoutes);
router.use('/ayuda-diagnostica', ayudaDiagnosticaRoutes);
router.use('/videocall', videocallRoutes);
router.use('/transcription', transcriptionRoutes);
router.use('/materiales', materialesRoutes);
router.use('/asesorias', asesoriasRoutes);
router.use('/ia-simulada', iaSimuladaRoutes);
router.use('/copiloto-voz', copilotoVozRoutes);
// router.use('/anamnesis', anamnesisRoutes);
// router.use('/pago', pagoRoutes);
// router.use('/consulta', consultaRoutes);
// router.use('/ia-entrenada', iaEntrenadaRoutes);
// router.use('/seguimiento', seguimientoRoutes);

export default router;

