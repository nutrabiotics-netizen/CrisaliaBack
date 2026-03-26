import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { 
  obtenerParaclinicos, 
  subirParaclinico, 
  eliminarParaclinico 
} from '../../../controllers/paciente/paraclinicosController';

const router = Router();

// Todas las rutas requieren autenticación y rol de paciente
router.use(authenticate, authorize(UserRole.PACIENTE));

// Rutas de paraclínicos
router.get('/', obtenerParaclinicos);
router.post('/', subirParaclinico);
router.delete('/:id', eliminarParaclinico);

export default router;
