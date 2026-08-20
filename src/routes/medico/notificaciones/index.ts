import { Router } from 'express';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';
import {
  obtenerConfiguracion,
  actualizarConfiguracion,
  restaurarDefaults,
} from '../../../controllers/medico/notificacionesController';
import {
  obtenerBandeja,
  marcarLeida,
  marcarTodasLeidas,
  eliminarNotificacion,
} from '../../../controllers/medico/notificacionesBandejaController';

const router = Router();

// ── Preferencias ──────────────────────────────────────────────────────────────
router.get('/configuracion',             authenticate, authorize(UserRole.MEDICO), obtenerConfiguracion);
router.put('/configuracion',             authenticate, authorize(UserRole.MEDICO), actualizarConfiguracion);
router.post('/configuracion/restaurar',  authenticate, authorize(UserRole.MEDICO), restaurarDefaults);

// ── Bandeja in-app ────────────────────────────────────────────────────────────
router.get('/bandeja',                   authenticate, authorize(UserRole.MEDICO), obtenerBandeja);
router.put('/leer-todas',                authenticate, authorize(UserRole.MEDICO), marcarTodasLeidas);
router.put('/:notificacionId/leer',      authenticate, authorize(UserRole.MEDICO), marcarLeida);
router.delete('/:notificacionId',        authenticate, authorize(UserRole.MEDICO), eliminarNotificacion);

export default router;