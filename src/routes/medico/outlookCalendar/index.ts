import { Router } from 'express';
import { getAuthUrl, handleCallback, getEstadoConexion, syncCitas, disconnect } from '../../../controllers/medico/outlookCalendar/outlookCalendarController';
import { authenticate, authorize } from '../../../middleware/auth';
import { UserRole } from '../../../types';

const router = Router();

router.get('/auth-url',    authenticate, authorize(UserRole.MEDICO), getAuthUrl);
router.get('/callback',    handleCallback);
router.get('/estado',      authenticate, authorize(UserRole.MEDICO), getEstadoConexion);
router.post('/sync',       authenticate, authorize(UserRole.MEDICO), syncCitas);
router.delete('/disconnect', authenticate, authorize(UserRole.MEDICO), disconnect);

export default router;
