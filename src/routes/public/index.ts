import { Router } from 'express';
import * as documentosLegalesController from '../../controllers/public/documentosLegalesController';
import { validarCodigo, registrarMedicoConCodigo, obtenerMedicoPorColegiatura } from '../../controllers/public/registroMedicoController';
import { obtenerHCPublica } from '../../controllers/medico/historiaClinica/historiaClinicaController';
import { enviarEncuestaPostPago } from '../../controllers/public/encuestaController';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/documentos-legales', documentosLegalesController.obtenerDocumentosActivos);
router.post('/documentos-legales/aceptar', authenticate, documentosLegalesController.aceptarDocumento);

// Registro médico con código de captación (endpoints públicos)
router.get('/registro-medico/:codigo', validarCodigo);
router.post('/registro-medico', registrarMedicoConCodigo);

// Búsqueda de médico por número de colegiatura (para flujo paciente onboarding)
router.get('/medico-por-colegiatura/:numero', obtenerMedicoPorColegiatura);

// Historia clínica pública (QR del PDF — token de 48h)
router.get('/hc/:token', obtenerHCPublica);

// Encuesta post-pago (sin auth)
router.post('/encuesta-post-pago', enviarEncuestaPostPago);

export default router;