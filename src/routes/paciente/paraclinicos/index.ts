import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { requireCuota1 } from '../../../middleware/requirePago';
import {
  obtenerParaclinicos,
  subirParaclinico,
  subirParaclinicoArchivo,
  eliminarParaclinico,
  obtenerAnalisisEvolutivo
} from '../../../controllers/paciente/paraclinicosController';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Solo se permiten PDF, JPG, PNG o WebP'));
  }
});

function uploadParaclinicoMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('archivo')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ mensaje: 'El archivo supera el máximo de 10MB' });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Error al subir el archivo';
      res.status(400).json({ mensaje: msg });
      return;
    }
    next();
  });
}

// Todas las rutas requieren autenticación y rol de paciente
router.use(authenticate, authorize(UserRole.PACIENTE));

// GET listado: libre para que el paciente siempre vea sus paraclínicos existentes
router.get('/', obtenerParaclinicos);

// GET análisis evolutivo con IA (Fase 3) — debe ir antes de /:id
router.get('/analisis-evolutivo', obtenerAnalisisEvolutivo);

// POST/DELETE: requieren Cuota 1 pagada (el pago desbloquea la carga de paraclínicos)
router.post('/upload', requireCuota1, uploadParaclinicoMiddleware, subirParaclinicoArchivo);
router.post('/', requireCuota1, subirParaclinico);
router.delete('/:id', requireCuota1, eliminarParaclinico);

export default router;
