import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
// `requireCuota1` (esquema legacy de 2 cuotas) ya NO aplica para crear citas:
// la cita se crea en estado `pendiente` y el pago se gestiona después. Lo dejamos
// importado solo para la sala de espera (donde sí tiene sentido validar pago).
import { requireCuota1 } from '../../../middleware/requirePago';
import {
  obtenerMedicosDisponibles,
  obtenerMedicosRecomendados,
  obtenerMedicoPorId,
  obtenerSedesMedico,
  obtenerHorariosDisponibles,
  obtenerConfiguracionFlujoMedico,
  crearCita,
  obtenerCitasPaciente,
  cancelarCita,
  confirmarPagoCita,
  obtenerRecordingUrl
} from '../../../controllers/paciente/agendamiento/agendamientoController';
import {
  getContenidoSalaEspera,
  getEstadoSalaEspera
} from '../../../controllers/paciente/agendamiento/salaEsperaController';

const router = Router();

router.get('/sala-espera/contenido', authenticate, authorize(UserRole.PACIENTE), getContenidoSalaEspera);

router.get('/medicos', authenticate, authorize(UserRole.PACIENTE), obtenerMedicosDisponibles);
router.get('/medicos-recomendados', authenticate, authorize(UserRole.PACIENTE), obtenerMedicosRecomendados);
router.get('/medicos/:medicoId', authenticate, authorize(UserRole.PACIENTE), obtenerMedicoPorId);
router.get('/medicos/:medicoId/sedes', authenticate, authorize(UserRole.PACIENTE), obtenerSedesMedico);
router.get('/medicos/:medicoId/horarios', authenticate, authorize(UserRole.PACIENTE, UserRole.MEDICO), obtenerHorariosDisponibles);
router.get('/medicos/:medicoId/configuracion-flujo', authenticate, authorize(UserRole.PACIENTE), obtenerConfiguracionFlujoMedico);
router.get('/citas', authenticate, authorize(UserRole.PACIENTE), obtenerCitasPaciente);
router.post('/citas', authenticate, authorize(UserRole.PACIENTE), crearCita);
router.put('/citas/:citaId/cancelar', authenticate, authorize(UserRole.PACIENTE), cancelarCita);
router.put('/citas/:citaId/confirmar', authenticate, authorize(UserRole.PACIENTE), confirmarPagoCita);
router.get('/citas/:citaId/sala-espera', authenticate, authorize(UserRole.PACIENTE), requireCuota1, getEstadoSalaEspera);
router.get('/citas/:citaId/recording-url', authenticate, authorize(UserRole.PACIENTE), obtenerRecordingUrl);

export default router;
