import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { getTranscriptionByCita } from '../../../controllers/medico/transcription/transcriptionController';

const router = Router();

router.get(
  '/cita/:citaId',
  authenticate,
  authorize(UserRole.MEDICO),
  getTranscriptionByCita
);

export default router;
