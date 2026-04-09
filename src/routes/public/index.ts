import { Router } from 'express';
import * as documentosLegalesController from '../../controllers/public/documentosLegalesController';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/documentos-legales', documentosLegalesController.obtenerDocumentosActivos);
router.post('/documentos-legales/aceptar', authenticate, documentosLegalesController.aceptarDocumento);

export default router;
