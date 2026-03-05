import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import * as personal from '../../../controllers/administrativo/ingreso/personalController';
import * as medicos from '../../../controllers/administrativo/ingreso/medicosController';
import * as registro from '../../../controllers/administrativo/ingreso/registroController';

const router = Router();

// Médicos (ya registrados en la plataforma)
router.get('/medicos', authenticate, authorize(UserRole.ADMINISTRATIVO), medicos.listar);

// Personal institucional
router.get('/personal', authenticate, authorize(UserRole.ADMINISTRATIVO), personal.listar);
router.get('/personal/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), personal.obtenerPorId);
router.post('/personal', authenticate, authorize(UserRole.ADMINISTRATIVO), personal.crear);
router.put('/personal/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), personal.actualizar);
router.delete('/personal/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), personal.eliminar);

// Registro ingreso/salida
router.get('/registro', authenticate, authorize(UserRole.ADMINISTRATIVO), registro.listarPorFecha);
router.post('/registro/ingreso', authenticate, authorize(UserRole.ADMINISTRATIVO), registro.registrarIngreso);
router.put('/registro/:id/salida', authenticate, authorize(UserRole.ADMINISTRATIVO), registro.registrarSalida);

export default router;
