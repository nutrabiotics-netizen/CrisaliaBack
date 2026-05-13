import { Router } from 'express';
import { body } from 'express-validator';
import AuthController from '../../controllers/auth/authController';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRole } from '../../types';
import { enviarCodigo2FA, validarCodigo2FA } from '../../controllers/auth/twoFactorController';

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

// Validaciones para registro de médico
const registerValidation = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .trim()
    .isLength({ min: 2 })
    .withMessage('El nombre debe tener al menos 2 caracteres'),
  body('apellido')
    .notEmpty()
    .withMessage('El apellido es requerido')
    .trim()
    .isLength({ min: 2 })
    .withMessage('El apellido debe tener al menos 2 caracteres'),
  body('email')
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial'),
  body('especialidad')
    .optional()
    .trim(),
  body('whatsapp')
    .optional()
    .trim()
];

// Validaciones para registro de paciente
const registerPacienteValidation = [
  body('nombre')
    .notEmpty()
    .withMessage('El nombre es requerido')
    .trim()
    .isLength({ min: 2 })
    .withMessage('El nombre debe tener al menos 2 caracteres'),
  body('apellido')
    .notEmpty()
    .withMessage('El apellido es requerido')
    .trim()
    .isLength({ min: 2 })
    .withMessage('El apellido debe tener al menos 2 caracteres'),
  body('email')
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('telefono')
    .optional()
    .trim(),
  body('acudiente')
    .optional()
    .isObject()
    .withMessage('Acudiente debe ser un objeto'),
  body('acudiente.nombre')
    .optional()
    .trim(),
  body('acudiente.parentesco')
    .optional()
    .trim(),
  body('acudiente.telefono')
    .optional()
    .trim(),
  body('aceptaTerminos')
    .optional()
    .isBoolean(),
  body('aceptaConsentimiento')
    .optional()
    .isBoolean()
];

// Rutas
router.post('/register', registerValidation, AuthController.register.bind(AuthController));
router.post('/register-paciente', registerPacienteValidation, AuthController.registerPaciente.bind(AuthController));
router.post('/login', loginValidation, AuthController.login.bind(AuthController));
router.get('/me', authenticate, AuthController.getCurrentUser.bind(AuthController));

// Autenticación por WhatsApp (pacientes)
router.post('/whatsapp/send-code', AuthController.sendWhatsAppCode.bind(AuthController));
router.post('/whatsapp/verify', AuthController.verifyWhatsApp.bind(AuthController));

// 2FA WhatsApp (paciente ya logueado con email/password)
router.post('/whatsapp/send-code-2fa', authenticate, authorize(UserRole.PACIENTE), AuthController.sendWhatsAppCode2FA.bind(AuthController));
router.post('/whatsapp/verify-2fa', authenticate, authorize(UserRole.PACIENTE), AuthController.verifyWhatsApp2FA.bind(AuthController));

// 2FA por documento (paciente o médico) — flujo pre-login: solo se pide el documento,
// se busca el usuario, se envía un código por WhatsApp y luego se valida para emitir JWT.
router.post(
  '/2fa/enviar',
  [body('documento').notEmpty().withMessage('El documento es requerido').trim()],
  enviarCodigo2FA
);
router.post(
  '/2fa/validar',
  [
    body('documento').notEmpty().withMessage('El documento es requerido').trim(),
    body('codigo').notEmpty().withMessage('El código es requerido').trim()
  ],
  validarCodigo2FA
);

export default router;

