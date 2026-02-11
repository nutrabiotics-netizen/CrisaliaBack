import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { getTranscriptionByCita } from '../../../controllers/paciente/transcription/transcriptionController';

const router = Router();

router.get(
  '/cita/:citaId',
  authenticate,
  authorize(UserRole.PACIENTE),
  getTranscriptionByCita
);

export default router;
