import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { obtenerFormulaVigente } from '../../../controllers/paciente/formulaMedicaController';

const router = Router();

// Rutas protegidas para Pacientes
router.use(authenticate, authorize(UserRole.PACIENTE));

// Obtener la Estrategia Terapéutica (Fórmula Médica) más reciente
router.get('/vigente', obtenerFormulaVigente);

export default router;
