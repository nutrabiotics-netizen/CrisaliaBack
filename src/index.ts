import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/database';

// Cargar variables de entorno
dotenv.config();

const app = express();

// ─── Seguridad ────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' } // permite imágenes S3 desde el frontend
}));

// Rate limiting global: 200 req/15 min por IP
const limiterGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes. Intenta en 15 minutos.' }
});
app.use('/api/', limiterGlobal);

// Rate limiting estricto para auth: 20 req/15 min
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos de autenticación. Intenta en 15 minutos.' }
});
app.use('/api/auth/', limiterAuth);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://nutrabiotics.mozartai.com.co',
    'https://app.nutrabiotics.mozartia.com',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexión a la base de datos
connectDB();

// Importar modelos para asegurar que estén registrados antes de usar populate
import './models/User';
import './models/Medico';
import './models/Paciente';
import './models/Cita';
import './models/Meeting';
import './models/ConfiguracionAgenda';
import './models/Auditoria';
import './models/Interrogatorio';
import './models/HistoriaClinica';
import './models/Cups2026';
import './models/Material';
import './models/ExamenMedico';
import './models/ApoyoTerapeutico';
import './models/AyudaDiagnostica';
import './models/TranscriptionSession';
import './models/TranscriptionSegment';
import './models/Asesoria';
import './models/Tercero';
import './models/PersonalInstitucional';
import './models/RegistroIngresoSalida';
import './models/CodigoDescuento';
import './models/PagoSimulado';
import './models/CuidadorIAConversacion';
import './models/LinkCaptacion';
import './models/ReferidoMedico';
import './models/AdherenciaToma';

// Rutas
import authRoutes from './routes/auth/authRoutes';
import medicoRoutes from './routes/medico';
import pacienteRoutes from './routes/paciente';
import adminRoutes from './routes/admin';
import administrativoRoutes from './routes/administrativo';
import externalRoutes from './routes/external';
import publicRoutes from './routes/public/index';
import cuidadorIARoutes from './routes/paciente/cuidador-ia';
// import { scheduleControlPreCitaJob } from './services/jobs/controlPreCitaJob';
// Fase 5
import { crearLink, listarLinks, desactivarLink, listarReferidos, bonificarReferido } from './controllers/admin/linkCaptacionController';
import { validarCodigo, invitarMedico, misReferidos } from './controllers/captacion/captacionController';
import { getMiLinkReferido, renovarMiLinkReferido } from './controllers/medico/miLinkReferidoController';
import { generarOrdenAlivia } from './controllers/medico/formulaMedica/formulaAliviaController';
import { generarTokenHCPublica, verHCPublica } from './controllers/paciente/hcPublicaController';
import { authenticate, authorize } from './middleware/auth';
import { UserRole } from './types';

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de médico
app.use('/api/medico', medicoRoutes);

// Rutas de paciente
app.use('/api/paciente', pacienteRoutes);

// Rutas de administración
app.use('/api/admin', adminRoutes);

// Rutas del módulo administrativo (rol administrativo)
app.use('/api/administrativo', administrativoRoutes);

// Rutas Externas (solo lectura, con token de autenticación)
app.use('/api/external', externalRoutes);

// Rutas Públicas Abiertas (No Auth)
app.use('/api/public', publicRoutes);

// Cuidador IA (ruta directa, fuera del router paciente para limpieza de path)
app.use('/api/paciente/cuidador-ia', cuidadorIARoutes);

// Iniciar job diario de pre-cita de control.
// DESHABILITADO temporalmente: descomentar cuando se quiera reactivar el envío
// automático de WhatsApps de pre-cita en producción.
// scheduleControlPreCitaJob();

// ─── Fase 5 — Captación médica ─────────────────────────────────────────────
// Admin: links de captación y referidos
app.post('/api/admin/links-captacion', authenticate, authorize(UserRole.ADMINISTRATIVO), crearLink);
app.get('/api/admin/links-captacion', authenticate, authorize(UserRole.ADMINISTRATIVO), listarLinks);
app.delete('/api/admin/links-captacion/:id', authenticate, authorize(UserRole.ADMINISTRATIVO), desactivarLink);
app.get('/api/admin/referidos', authenticate, authorize(UserRole.ADMINISTRATIVO), listarReferidos);
app.post('/api/admin/referidos/:id/bonificar', authenticate, authorize(UserRole.ADMINISTRATIVO), bonificarReferido);

// Public: validar código de registro médico + HC pública
app.get('/api/public/registro-medico/:codigo', validarCodigo);
app.get('/api/public/hc-publica/:token', verHCPublica);

// Paciente: invitar médico + QR de HC
app.post('/api/paciente/invitar-medico', authenticate, authorize(UserRole.PACIENTE), invitarMedico);
app.get('/api/paciente/hc-publica/generar-token', authenticate, authorize(UserRole.PACIENTE), generarTokenHCPublica);

// Médico: mis referidos + link de referido propio
app.get('/api/medico/mis-referidos', authenticate, authorize(UserRole.MEDICO), misReferidos);
app.get('/api/medico/mi-link-referido', authenticate, authorize(UserRole.MEDICO), getMiLinkReferido);
app.post('/api/medico/mi-link-referido/renovar', authenticate, authorize(UserRole.MEDICO), renovarMiLinkReferido);

// Fase 7 — ALIVIA (webhook se registra en el external router)
app.post('/api/medico/formula-medica/:formulaId/generar-orden-alivia', authenticate, authorize(UserRole.MEDICO), generarOrdenAlivia);

// Ruta de prueba
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'CRISALIA API está funcionando' });
});

// Ruta raíz para evitar 404
app.get('/', (_req, res) => {
  res.json({ status: 'OK', message: 'CRISALIA API está funcionando' });
});

// Manejo de errores
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Error interno del servidor' });
});

// Exportar la app para Vercel
export default app;
