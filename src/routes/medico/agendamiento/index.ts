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
  reagendarCita,
  generarResumenPdfCita,
  obtenerRecordingUrl
} from '../../../controllers/medico/agendamientoController';
import { obtenerPreconsulta } from '../../../controllers/medico/preconsultaController';

const router = Router();

// Obtener configuración de agenda del médico autenticado
router.get('/configuracion', authenticate, authorize(UserRole.MEDICO), obtenerConfiguracion);

// Guardar o actualizar configuración de agenda
router.post('/configuracion', authenticate, authorize(UserRole.MEDICO), guardarConfiguracion);
router.put('/configuracion', authenticate, authorize(UserRole.MEDICO), guardarConfiguracion);

// Obtener citas del médico
router.get('/citas', authenticate, authorize(UserRole.MEDICO), obtenerCitas);
router.get('/citas/hoy', authenticate, authorize(UserRole.MEDICO), obtenerCitasHoy);

// Confirmar, cancelar, completar o reagendar citas
router.put('/citas/:citaId/confirmar', authenticate, authorize(UserRole.MEDICO), confirmarCita);
router.put('/citas/:citaId/cancelar', authenticate, authorize(UserRole.MEDICO), cancelarCita);
router.put('/citas/:citaId/completar', authenticate, authorize(UserRole.MEDICO), completarCita);
router.put('/citas/:citaId/reagendar', authenticate, authorize(UserRole.MEDICO), reagendarCita);

// Generar PDF resumen de la cita (historia + fórmula + incapacidad + interconsulta)
router.post('/citas/:citaId/resumen-pdf', authenticate, authorize(UserRole.MEDICO), generarResumenPdfCita);

// URL firmada para ver grabación de videoconsulta
router.get('/citas/:citaId/recording-url', authenticate, authorize(UserRole.MEDICO), obtenerRecordingUrl);

// A7 — Análisis preconsulta IA: resumen del interrogatorio del paciente para el médico
router.get('/citas/:citaId/preconsulta', authenticate, authorize(UserRole.MEDICO), obtenerPreconsulta);

export default router;
