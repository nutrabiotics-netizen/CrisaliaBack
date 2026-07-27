import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  subirImagenEvaluacionAlimento,
  analizarEvaluacionAlimento,
  listarHistorialEvaluaciones,
  obtenerEvaluacionPorId,
  extraerAlimentosImagen,
  generarReportePlatoHandler,
  guardarReportePlato,
} from '../../../controllers/paciente/alimentoEvaluacionController';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Solo JPG, PNG o WebP'));
  }
});

function uploadImagenMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('imagen')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ mensaje: 'La imagen supera el máximo de 8MB' });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
      res.status(400).json({ mensaje: msg });
      return;
    }
    next();
  });
}

router.use(authenticate, authorize(UserRole.PACIENTE));

router.get('/historial', listarHistorialEvaluaciones);
router.post('/subir', uploadImagenMiddleware, subirImagenEvaluacionAlimento);
router.post('/extraer', extraerAlimentosImagen);
router.post('/reporte', generarReportePlatoHandler);
router.post('/guardar', guardarReportePlato);
router.post('/analizar', analizarEvaluacionAlimento);
router.get('/:id', obtenerEvaluacionPorId);

export default router;
