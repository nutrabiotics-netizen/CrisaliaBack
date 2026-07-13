/**
 * Rutas de wearables para el rol MEDICO.
 *
 * Reutiliza los controllers de `paciente/wearables/wearablesController.ts`
 * (que son agnósticos al rol — usan `req.userId`). Aquí solo cambia el
 * `authorize(MEDICO)` y la ruta base.
 *
 * Existe únicamente para que el equipo de desarrollo pueda conectar su
 * propio Fitbit/Google Health desde la cuenta médico para pruebas. La
 * versión paciente sigue activa en `/api/paciente/wearables/*` cuando el
 * feature flag FEATURE_WEARABLES_ENABLED esté habilitado en el front.
 *
 * NOTA: los callbacks OAuth siguen viviendo bajo `/api/paciente/wearables/`
 * porque la URI registrada en Fitbit/Google es esa. El controller decide a
 * qué dashboard redirigir según el rol firmado en el `state`.
 */
import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerMisConexiones,
  iniciarConexionFitbit,
  sincronizarFitbit,
  desconectarFitbit,
  obtenerDatos,
  iniciarConexionGoogle,
  sincronizarGoogle,
  desconectarGoogle,
  diagnosticarGoogle
} from '../../../controllers/paciente/wearables/wearablesController';

const router = Router();

router.get('/me',   authenticate, authorize(UserRole.MEDICO), obtenerMisConexiones);
router.get('/data', authenticate, authorize(UserRole.MEDICO), obtenerDatos);

router.get('/fitbit/connect', authenticate, authorize(UserRole.MEDICO), iniciarConexionFitbit);
router.post('/fitbit/sync',   authenticate, authorize(UserRole.MEDICO), sincronizarFitbit);
router.delete('/fitbit',      authenticate, authorize(UserRole.MEDICO), desconectarFitbit);

router.get('/google/connect',    authenticate, authorize(UserRole.MEDICO), iniciarConexionGoogle);
router.post('/google/sync',      authenticate, authorize(UserRole.MEDICO), sincronizarGoogle);
router.get('/google/datatypes',  authenticate, authorize(UserRole.MEDICO), diagnosticarGoogle);
router.delete('/google',         authenticate, authorize(UserRole.MEDICO), desconectarGoogle);

export default router;
