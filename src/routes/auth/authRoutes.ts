import { Router } from 'express';
import { body } from 'express-validator';
import AuthController from '../../controllers/auth/authController';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Validaciones para login
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
];

// Rutas
router.post('/login', loginValidation, AuthController.login.bind(AuthController));
router.get('/me', authenticate, AuthController.getCurrentUser.bind(AuthController));

export default router;

