import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  crearRegistroRDA,
  obtenerRegistroRDAPorCita,
  obtenerRegistrosRDAPorPaciente,
  obtenerRegistroRDAPorId,
  actualizarRegistroRDA,
  cambiarEstadoRegistroRDA,
  eliminarRegistroRDA,
} from '../../../controllers/medico/registroRDA/registroRDAController';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), crearRegistroRDA);
router.get('/cita/:citaId', authenticate, authorize(UserRole.MEDICO), obtenerRegistroRDAPorCita);
router.get('/paciente/:pacienteId', authenticate, authorize(UserRole.MEDICO), obtenerRegistrosRDAPorPaciente);
router.get('/:registroId', authenticate, authorize(UserRole.MEDICO), obtenerRegistroRDAPorId);
router.put('/:registroId', authenticate, authorize(UserRole.MEDICO), actualizarRegistroRDA);
router.patch('/:registroId/estado', authenticate, authorize(UserRole.MEDICO), cambiarEstadoRegistroRDA);
router.delete('/:registroId', authenticate, authorize(UserRole.MEDICO), eliminarRegistroRDA);

export default router;
