import { Router } from 'express';
import {
  getPerfilMedico,
  updatePerfilMedico,
  getPreajustes,
  updatePreajustes,
  getAliados,
  updateAliado,
  getSuscripcion
} from '../../../controllers/medico/perfil/perfilController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

router.get('/', authenticate, authorize(UserRole.MEDICO), getPerfilMedico);
router.put('/', authenticate, authorize(UserRole.MEDICO), updatePerfilMedico);

// Preajustes clínicos
router.get('/preajustes', authenticate, authorize(UserRole.MEDICO), getPreajustes);
router.put('/preajustes', authenticate, authorize(UserRole.MEDICO), updatePreajustes);

// Aliados
router.get('/aliados', authenticate, authorize(UserRole.MEDICO), getAliados);
router.put('/aliados/:aliado', authenticate, authorize(UserRole.MEDICO), updateAliado);

// Suscripción y plan de prueba
router.get('/suscripcion', authenticate, authorize(UserRole.MEDICO), getSuscripcion);

export default router;

