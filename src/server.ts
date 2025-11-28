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

// Rutas
import authRoutes from './routes/auth/authRoutes';

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// TODO: Importar y usar las rutas de cada módulo
// import medicoPerfilRoutes from './routes/medico/perfil';
// import medicoAgendamientoRoutes from './routes/medico/agendamiento';
// import pacientePerfilRoutes from './routes/paciente/perfil';
// import pacienteAgendamientoRoutes from './routes/paciente/agendamiento';

// app.use('/api/medico/perfil', medicoPerfilRoutes);
// app.use('/api/medico/agendamiento', medicoAgendamientoRoutes);
// app.use('/api/paciente/perfil', pacientePerfilRoutes);
// app.use('/api/paciente/agendamiento', pacienteAgendamientoRoutes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CRISALIA API está funcionando' });
});

// Manejo de errores
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

