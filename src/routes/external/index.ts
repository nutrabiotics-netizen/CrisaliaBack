import { Router } from 'express';
import { authenticateExternal } from '../../middleware/externalAuth';
import { requirePhoneToken } from '../../middleware/externalPhoneAuth';
import { aliviaWebhook } from '../../controllers/external/aliviaWebhookController';
import {
  postRequestOtp,
  postVerifyOtp,
  postRevoke
} from '../../controllers/external/toolsAuthController';
import {
  getMe,
  getMisCitas,
  getProximaCita,
  getMiTratamiento,
  getMiHistoria,
  postAgendar,
  postCancelar,
  getAgendaMedico,
  getPacienteFicha,
  getMedicosDisponibles,
  getMiResumen,
  postRefreshResumen
} from '../../controllers/external/toolsController';
import {
  // Pacientes
  obtenerTodosLosPacientes,
  obtenerPacientePorId,
  // Médicos
  obtenerTodosLosMedicos,
  obtenerMedicoPorId,
  // Citas
  obtenerTodasLasCitas,
  obtenerCitaPorId,
  obtenerCitasPorMedico,
  obtenerCitasPorPaciente,
  // Historias Clínicas
  obtenerTodasLasHistoriasClinicas,
  obtenerHistoriaClinicaPorId,
  obtenerHistoriasClinicasPorPaciente,
  obtenerUltimaHistoriaClinicaPorPaciente,
  obtenerHistoriasClinicasPorMedico,
  obtenerHistoriaClinicaPorCita,
  // Fórmulas Médicas
  obtenerTodasLasFormulasMedicas,
  obtenerFormulaMedicaPorId,
  obtenerFormulasMedicasPorPaciente,
  obtenerFormulasMedicasPorCita,
  // Interrogatorios
  obtenerInterrogatoriosPorPaciente,
  obtenerInterrogatorioPorId,
 
  // Disponibilidad y Estadísticas
  obtenerDisponibilidadMedico,
  obtenerEstadisticasCitasPorMedico,
  obtenerCantidadCitasPorMedico,
  // Materiales
  buscarMateriales,
  obtenerTodosLosMateriales,
  obtenerMaterialPorId
} from '../../controllers/external/externalController';

const router = Router();

// ─── TOOLS API (Auth por teléfono OTP) ────────────────────────────
// Estas rutas usan phoneToken (Bearer) en lugar del EXTERNAL_API_TOKEN global.
// Se registran ANTES del router.use(authenticateExternal) para evitar el middleware.

// Auth flow
router.post('/auth/request-otp', postRequestOtp);
router.post('/auth/verify-otp', postVerifyOtp);
router.post('/auth/revoke', requirePhoneToken, postRevoke);

// Tools — actúan en nombre del paciente o médico autenticado
router.get('/tools/me', requirePhoneToken, getMe);
router.get('/tools/me/citas', requirePhoneToken, getMisCitas);
router.get('/tools/me/citas/proxima', requirePhoneToken, getProximaCita);
router.get('/tools/me/tratamiento', requirePhoneToken, getMiTratamiento);
router.get('/tools/me/historia', requirePhoneToken, getMiHistoria);
router.post('/tools/me/agendar', requirePhoneToken, postAgendar);
router.post('/tools/me/cancelar', requirePhoneToken, postCancelar);
router.get('/tools/me/agenda', requirePhoneToken, getAgendaMedico);
router.get('/tools/medico/:pacienteId/ficha', requirePhoneToken, getPacienteFicha);
router.get('/tools/medicos', requirePhoneToken, getMedicosDisponibles);

// Resumen integral del paciente (generado por Crisal·IA Agent)
router.get('/tools/me/resumen', requirePhoneToken, getMiResumen);
router.post('/tools/me/resumen/refresh', requirePhoneToken, postRefreshResumen);

// ─── RUTAS ADMIN (Bearer EXTERNAL_API_TOKEN, sin contexto de usuario) ───
// Todas las rutas siguientes requieren el token estático de servidor
router.use(authenticateExternal);

// ==================== PACIENTES ====================
router.get('/pacientes', obtenerTodosLosPacientes);
router.get('/pacientes/:id', obtenerPacientePorId);

// ==================== MÉDICOS ====================
router.get('/medicos', obtenerTodosLosMedicos);
router.get('/medicos/:id', obtenerMedicoPorId);
router.get('/medicos/:medicoId/disponibilidad', obtenerDisponibilidadMedico);
router.get('/medicos/:medicoId/estadisticas-citas', obtenerEstadisticasCitasPorMedico);
router.get('/medicos/:medicoId/cantidad-citas', obtenerCantidadCitasPorMedico);

// ==================== CITAS ====================
router.get('/citas', obtenerTodasLasCitas);
router.get('/citas/:id', obtenerCitaPorId);
router.get('/citas/medico/:medicoId', obtenerCitasPorMedico);
router.get('/citas/paciente/:pacienteId', obtenerCitasPorPaciente);

// ==================== HISTORIAS CLÍNICAS ====================
router.get('/historias-clinicas', obtenerTodasLasHistoriasClinicas);
router.get('/historias-clinicas/:id', obtenerHistoriaClinicaPorId);
router.get('/historias-clinicas/paciente/:pacienteId/ultima', obtenerUltimaHistoriaClinicaPorPaciente);
router.get('/historias-clinicas/paciente/:pacienteId', obtenerHistoriasClinicasPorPaciente);
router.get('/historias-clinicas/medico/:medicoId', obtenerHistoriasClinicasPorMedico);
router.get('/historias-clinicas/cita/:citaId', obtenerHistoriaClinicaPorCita);

// ==================== FÓRMULAS MÉDICAS ====================
router.get('/formulas-medicas', obtenerTodasLasFormulasMedicas);
router.get('/formulas-medicas/:id', obtenerFormulaMedicaPorId);
router.get('/formulas-medicas/paciente/:pacienteId', obtenerFormulasMedicasPorPaciente);
router.get('/formulas-medicas/cita/:citaId', obtenerFormulasMedicasPorCita);

// ==================== INTERROGATORIOS ====================
router.get('/interrogatorios/paciente/:pacienteId', obtenerInterrogatoriosPorPaciente);
router.get('/interrogatorios/:id', obtenerInterrogatorioPorId);

// ==================== MEDICAMENTOS NUTRABIOTICS ====================
router.get('/medicamentos-nutrabiotic', buscarMateriales);           // ?q=texto  → búsqueda
router.get('/medicamentos-nutrabiotic/all', obtenerTodosLosMateriales); // ?limit=100&skip=0 → listado paginado
router.get('/medicamentos-nutrabiotic/:id', obtenerMaterialPorId);  // por ID de MongoDB

// ==================== ALIVIA — Webhook de confirmación de compra ====================
router.post('/alivia/webhook', aliviaWebhook);


export default router;
