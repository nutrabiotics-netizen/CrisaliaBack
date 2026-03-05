import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';

// Cargar variables de entorno
dotenv.config();

const app = express();

// Middlewares
app.use(cors({
  // origin: 'https://app.nutrabiotics.mozartia.com',
  origin:'http://localhost:5173',
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
import './models/MaterialPais';
import './models/ExamenMedico';
import './models/ApoyoTerapeutico';
import './models/AyudaDiagnostica';
import './models/TranscriptionSession';
import './models/TranscriptionSegment';
import './models/Asesoria';

// Rutas
import authRoutes from './routes/auth/authRoutes';
import medicoRoutes from './routes/medico';
import pacienteRoutes from './routes/paciente';
import adminRoutes from './routes/admin';
import externalRoutes from './routes/external';

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de médico
app.use('/api/medico', medicoRoutes);

// Rutas de paciente
app.use('/api/paciente', pacienteRoutes);

// Rutas de administración
app.use('/api/admin', adminRoutes);

// Rutas Externas (solo lectura, con token de autenticación)
app.use('/api/external', externalRoutes);

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
