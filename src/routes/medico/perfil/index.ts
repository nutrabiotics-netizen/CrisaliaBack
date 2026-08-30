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
import Medico from '../../../models/Medico';
import { enviarDocumentoPaciente } from '../../../services/notifications/emailService';

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
router.get('/firma/proxy', authenticate, authorize(UserRole.MEDICO), async (req: Request, res: Response) => {
  try {
    const medicoId = (req as any).userId;
    if (!medicoId) { res.status(401).json({ message: 'No autenticado' }); return; }
    const medico = await Medico.findById(medicoId).select('firmaUrl').lean();
    const firmaUrl: string | undefined = (medico as any)?.firmaUrl;
    if (!firmaUrl) { res.status(404).json({ message: 'Sin firma registrada' }); return; }
    const r = await fetch(firmaUrl);
    if (!r.ok) { res.status(404).json({ message: 'No se pudo obtener la firma' }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set('Content-Type', r.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  } catch {
    res.status(500).json({ message: 'Error al obtener firma' });
  }
});

router.post('/enviar-documento', authenticate, authorize(UserRole.MEDICO), async (req: Request, res: Response) => {
  try {
    const { emailPaciente, nombrePaciente, nombreMedico, tipoDocumento, pdfBase64, nombreArchivo } = req.body;
    if (!emailPaciente || !pdfBase64) {
      res.status(400).json({ success: false, message: 'emailPaciente y pdfBase64 son requeridos' });
      return;
    }
    await enviarDocumentoPaciente({ emailPaciente, nombrePaciente, nombreMedico, tipoDocumento, pdfBase64, nombreArchivo });
    res.json({ success: true, message: 'Documento enviado correctamente' });
  } catch (err: any) {
    console.error('[enviar-documento]', err);
    res.status(500).json({ success: false, message: err?.message || 'Error al enviar el documento' });
  }
});

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

