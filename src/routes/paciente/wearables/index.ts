import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerMisConexiones,
  iniciarConexionFitbit,
  callbackFitbit,
  sincronizarFitbit,
  desconectarFitbit,
  obtenerDatos,
  iniciarConexionGoogle,
  callbackGoogle,
  sincronizarGoogle,
  desconectarGoogle
} from '../../../controllers/paciente/wearables/wearablesController';

const router = Router();

// Estado: qué conexiones tiene el paciente
router.get('/me',     authenticate, authorize(UserRole.PACIENTE), obtenerMisConexiones);
router.get('/data',   authenticate, authorize(UserRole.PACIENTE), obtenerDatos);

// Fitbit
router.get('/fitbit/connect',  authenticate, authorize(UserRole.PACIENTE), iniciarConexionFitbit);
router.post('/fitbit/sync',    authenticate, authorize(UserRole.PACIENTE), sincronizarFitbit);
router.delete('/fitbit',       authenticate, authorize(UserRole.PACIENTE), desconectarFitbit);

// Callback PÚBLICO — Fitbit hace GET aquí, no podemos pedir Authorization Header.
// La verificación se hace con el `state` firmado HMAC en el controller.
router.get('/fitbit/callback', callbackFitbit);

// Google Health
router.get('/google/connect',  authenticate, authorize(UserRole.PACIENTE), iniciarConexionGoogle);
router.post('/google/sync',    authenticate, authorize(UserRole.PACIENTE), sincronizarGoogle);
router.delete('/google',       authenticate, authorize(UserRole.PACIENTE), desconectarGoogle);
router.get('/google/callback', callbackGoogle);

export default router;
