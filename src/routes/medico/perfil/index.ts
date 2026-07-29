import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  getPerfilMedico,
  updatePerfilMedico,
  getPreajustes,
  updatePreajustes,
  getAliados,
  updateAliado,
  getSuscripcion,
  subirFotoMedico,
  subirFirmaMedico
} from '../../../controllers/medico/perfil/perfilController';
import {
  listarDocumentos,
  subirDocumento,
  eliminarDocumento,
} from '../../../controllers/medico/perfil/documentosController';
import {
  getFacturacion,
  updateFacturacion,
} from '../../../controllers/medico/perfil/facturacionController';
import {
  getConsentimientos,
  aceptarConsentimiento,
} from '../../../controllers/medico/perfil/consentimientosController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) { cb(null, true); return; }
    cb(new Error('Solo se permiten JPG, PNG o WebP'));
  }
});

function uploadFotoMiddleware(req: Request, res: Response, next: NextFunction): void {
  uploadFoto.single('foto')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}

router.get('/', authenticate, authorize(UserRole.MEDICO), getPerfilMedico);
router.put('/', authenticate, authorize(UserRole.MEDICO), updatePerfilMedico);
router.post('/foto', authenticate, authorize(UserRole.MEDICO), uploadFotoMiddleware, subirFotoMedico);
router.post('/firma', authenticate, authorize(UserRole.MEDICO), uploadFotoMiddleware, subirFirmaMedico);

// Preajustes clínicos
router.get('/preajustes', authenticate, authorize(UserRole.MEDICO), getPreajustes);
router.put('/preajustes', authenticate, authorize(UserRole.MEDICO), updatePreajustes);

// Aliados
router.get('/aliados', authenticate, authorize(UserRole.MEDICO), getAliados);
router.put('/aliados/:aliado', authenticate, authorize(UserRole.MEDICO), updateAliado);

// Suscripción y plan de prueba
router.get('/suscripcion', authenticate, authorize(UserRole.MEDICO), getSuscripcion);

// Documentos profesionales
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) { cb(null, true); return; }
    cb(new Error('Solo se permiten PDF, JPG, PNG o WebP'));
  }
});
function uploadDocMiddleware(req: Request, res: Response, next: NextFunction): void {
  uploadDoc.single('archivo')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Error al subir' }); return; }
    next();
  });
}
// Consentimientos
router.get('/consentimientos', authenticate, authorize(UserRole.MEDICO), getConsentimientos);
router.post('/consentimientos/aceptar', authenticate, authorize(UserRole.MEDICO), aceptarConsentimiento);

// Facturación
router.get('/facturacion', authenticate, authorize(UserRole.MEDICO), getFacturacion);
router.put('/facturacion', authenticate, authorize(UserRole.MEDICO), updateFacturacion);

router.get('/documentos', authenticate, authorize(UserRole.MEDICO), listarDocumentos);
router.post('/documentos', authenticate, authorize(UserRole.MEDICO), uploadDocMiddleware, subirDocumento);
router.delete('/documentos/:tipo', authenticate, authorize(UserRole.MEDICO), eliminarDocumento);

export default router;

