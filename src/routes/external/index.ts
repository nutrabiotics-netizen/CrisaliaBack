import { Router } from 'express';
import { authenticateExternal } from '../../middleware/externalAuth';
import { aliviaWebhook } from '../../controllers/external/aliviaWebhookController';
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

// Todas las rutas requieren autenticación externa
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
