import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  listarContenido,
  buscarContenido,
  getCategorias
} from '../../../controllers/medico/iaEntrenada/iaEntrenadaController';

const router = Router();

router.get('/categorias', authenticate, authorize(UserRole.MEDICO), getCategorias);
router.get('/', authenticate, authorize(UserRole.MEDICO), listarContenido);
router.post('/buscar', authenticate, authorize(UserRole.MEDICO), buscarContenido);

export default router;
