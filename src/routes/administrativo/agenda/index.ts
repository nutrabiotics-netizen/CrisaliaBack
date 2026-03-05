import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as agenda from '../../../controllers/administrativo/agenda/agendaController';

const router = Router();

router.get('/citas', authenticate, authorize(UserRole.ADMINISTRATIVO), agenda.listarCitas);

export default router;
