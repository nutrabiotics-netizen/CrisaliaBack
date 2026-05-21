import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  getMessagesByCita,
  postMarkRead,
  postMessage
} from '../../../controllers/shared/chat/chatController';

const router = Router();

router.get('/cita/:citaId', authenticate, authorize(UserRole.PACIENTE), getMessagesByCita);
router.post('/cita/:citaId', authenticate, authorize(UserRole.PACIENTE), postMessage);
router.post('/cita/:citaId/leido', authenticate, authorize(UserRole.PACIENTE), postMarkRead);

export default router;
