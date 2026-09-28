import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { getVideoUrl } from '../../controllers/medico/videosController';

const router = Router();

// GET /api/medico/videos/url?key=video.mp4
router.get('/url', authenticate, getVideoUrl);

export default router;
