import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { listarDocumentos } from '../../../controllers/paciente/documentosController';

const router = Router();

// Listar documentos del paciente (resumen por cita + individuales). Query opcional: ?citaId=xxx
router.get('/', authenticate, authorize(UserRole.PACIENTE), listarDocumentos);

export default router;
