import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import { 
  obtenerConfiguracion, 
  guardarConfiguracion,
  obtenerCitas,
  obtenerCitasHoy,
  confirmarCita,
  cancelarCita,
  completarCita,
  generarResumenPdfCita
} from '../../../controllers/medico/agendamientoController';

const router = Router();

// Obtener configuración de agenda del médico autenticado
router.get('/configuracion', authenticate, authorize(UserRole.MEDICO), obtenerConfiguracion);

// Guardar o actualizar configuración de agenda
router.post('/configuracion', authenticate, authorize(UserRole.MEDICO), guardarConfiguracion);
router.put('/configuracion', authenticate, authorize(UserRole.MEDICO), guardarConfiguracion);

// Obtener citas del médico
router.get('/citas', authenticate, authorize(UserRole.MEDICO), obtenerCitas);
router.get('/citas/hoy', authenticate, authorize(UserRole.MEDICO), obtenerCitasHoy);

// Confirmar, cancelar o completar citas
router.put('/citas/:citaId/confirmar', authenticate, authorize(UserRole.MEDICO), confirmarCita);
router.put('/citas/:citaId/cancelar', authenticate, authorize(UserRole.MEDICO), cancelarCita);
router.put('/citas/:citaId/completar', authenticate, authorize(UserRole.MEDICO), completarCita);

// Generar PDF resumen de la cita (historia + fórmula + incapacidad + interconsulta)
router.post('/citas/:citaId/resumen-pdf', authenticate, authorize(UserRole.MEDICO), generarResumenPdfCita);

export default router;
