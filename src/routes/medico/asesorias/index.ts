import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  listarPendientes,
  listarAsignadasAMi,
  asignarAsesoria,
  responderAsesoria
} from '../../../controllers/medico/asesorias/asesoriasController';

const router = Router();

router.get('/pendientes', authenticate, authorize(UserRole.MEDICO), listarPendientes);
router.get('/asignadas', authenticate, authorize(UserRole.MEDICO), listarAsignadasAMi);
router.put('/:asesoriaId/asignar', authenticate, authorize(UserRole.MEDICO), asignarAsesoria);
router.put('/:asesoriaId/responder', authenticate, authorize(UserRole.MEDICO), responderAsesoria);

export default router;
