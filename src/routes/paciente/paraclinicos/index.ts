import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerParaclinicos,
  subirParaclinico,
  subirParaclinicoArchivo,
  eliminarParaclinico
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

// Rutas de paraclínicos
router.get('/', obtenerParaclinicos);
router.post('/upload', uploadParaclinicoMiddleware, subirParaclinicoArchivo);
router.post('/', subirParaclinico);
router.delete('/:id', eliminarParaclinico);

export default router;
