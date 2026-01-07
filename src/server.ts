import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexión a la base de datos
connectDB();

// Importar modelos para asegurar que estén registrados antes de usar populate
import './models/User';
import './models/Medico';
import './models/Paciente';
import './models/Cita';
import './models/ConfiguracionAgenda';
import './models/Auditoria';
import './models/Interrogatorio';
import './models/HistoriaClinica';

// Rutas
import authRoutes from './routes/auth/authRoutes';
import medicoRoutes from './routes/medico';
import pacienteRoutes from './routes/paciente';

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de médico
app.use('/api/medico', medicoRoutes);

// Rutas de paciente
app.use('/api/paciente', pacienteRoutes);

// Ruta de prueba
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'CRISALIA API está funcionando' });
});

// Manejo de errores
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

