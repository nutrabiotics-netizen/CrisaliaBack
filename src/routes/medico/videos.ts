import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types/index';
import { getVideoUrl } from '../../controllers/medico/videosController';

const router = Router();

// GET /api/medico/videos/url?key=video.mp4
router.get('/url', authenticate, authorize(UserRole.MEDICO), getVideoUrl);

export default router;
