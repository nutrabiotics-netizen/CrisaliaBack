import { Router } from 'express';
import { obtenerPacientesDelDia, registrarLlegadaPaciente } from '../../../controllers/administrativo/visitaPacienteController';

const router = Router();

router.get('/citas-hoy', obtenerPacientesDelDia);
router.put('/citas/:id/llegada', registrarLlegadaPaciente);

export default router;
