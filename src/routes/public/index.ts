import { Router } from 'express';
import { enviarEncuesta } from '../../controllers/public/encuestaController';

const router = Router();

// /api/public/encuesta
router.post('/encuesta', enviarEncuesta);

export default router;
