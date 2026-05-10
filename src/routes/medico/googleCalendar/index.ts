import { Router } from 'express';
import {
  getAuthUrl,
  handleCallback,
  syncCitas,
  disconnect,
  getEstadoConexion
} from '../../../controllers/medico/googleCalendar/googleCalendarController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

// Obtener URL de autorización OAuth (requiere auth)
router.get('/auth-url', authenticate, authorize(UserRole.MEDICO), getAuthUrl);

// Callback OAuth (NO requiere auth — viene de Google redirect)
router.get('/callback', handleCallback);

// Estado de conexión
router.get('/estado', authenticate, authorize(UserRole.MEDICO), getEstadoConexion);

// Sincronizar citas próximas
router.post('/sync', authenticate, authorize(UserRole.MEDICO), syncCitas);

// Desconectar
router.delete('/disconnect', authenticate, authorize(UserRole.MEDICO), disconnect);

export default router;
