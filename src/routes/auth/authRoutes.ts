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

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registrar médico
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterMedicoRequest'
 *     responses:
 *       201:
 *         description: Médico registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Error de validación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
router.post('/register', registerValidation, AuthController.register.bind(AuthController));

/**
 * @swagger
 * /api/auth/register-paciente:
 *   post:
 *     tags: [Auth]
 *     summary: Registrar paciente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterPacienteRequest'
 *     responses:
 *       201:
 *         description: Paciente registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Error de validación
 */
router.post('/register-paciente', registerPacienteValidation, AuthController.registerPaciente.bind(AuthController));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión (email + password)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login exitoso — devuelve JWT y datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Credenciales incorrectas
 */
router.post('/login', loginValidation, AuthController.login.bind(AuthController));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtener usuario autenticado actual
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario actual
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Token inválido o expirado
 */
router.get('/me', authenticate, AuthController.getCurrentUser.bind(AuthController));

/**
 * @swagger
 * /api/auth/whatsapp/send-code:
 *   post:
 *     tags: [Auth]
 *     summary: Enviar código de acceso por WhatsApp (pacientes)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [celular]
 *             properties:
 *               celular:
 *                 type: string
 *                 example: '+573001234567'
 *     responses:
 *       200:
 *         description: Código enviado
 */
router.post('/whatsapp/send-code', AuthController.sendWhatsAppCode.bind(AuthController));

/**
 * @swagger
 * /api/auth/whatsapp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verificar código WhatsApp e iniciar sesión
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [celular, codigo]
 *             properties:
 *               celular:
 *                 type: string
 *                 example: '+573001234567'
 *               codigo:
 *                 type: string
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Login exitoso — devuelve JWT
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Código inválido o expirado
 */
router.post('/whatsapp/verify', AuthController.verifyWhatsApp.bind(AuthController));

/**
 * @swagger
 * /api/auth/whatsapp/send-code-2fa:
 *   post:
 *     tags: [Auth]
 *     summary: Enviar código 2FA por WhatsApp (paciente ya autenticado)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Código 2FA enviado
 */
router.post('/whatsapp/send-code-2fa', authenticate, authorize(UserRole.PACIENTE), AuthController.sendWhatsAppCode2FA.bind(AuthController));

/**
 * @swagger
 * /api/auth/whatsapp/verify-2fa:
 *   post:
 *     tags: [Auth]
 *     summary: Verificar código 2FA por WhatsApp
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: '654321'
 *     responses:
 *       200:
 *         description: 2FA verificado correctamente
 *       401:
 *         description: Código inválido
 */
router.post('/whatsapp/verify-2fa', authenticate, authorize(UserRole.PACIENTE), AuthController.verifyWhatsApp2FA.bind(AuthController));

/**
 * @swagger
 * /api/auth/2fa/enviar:
 *   post:
 *     tags: [Auth]
 *     summary: Enviar código 2FA por documento (pre-login)
 *     description: Busca el usuario por número de documento y envía un código OTP por WhatsApp. Usar antes de /2fa/validar para obtener el JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documento]
 *             properties:
 *               documento:
 *                 type: string
 *                 example: '1234567890'
 *     responses:
 *       200:
 *         description: Código enviado al WhatsApp registrado
 *       404:
 *         description: Usuario no encontrado
 */
router.post(
  '/2fa/enviar',
  [body('documento').notEmpty().withMessage('El documento es requerido').trim()],
  enviarCodigo2FA
);

/**
 * @swagger
 * /api/auth/2fa/validar:
 *   post:
 *     tags: [Auth]
 *     summary: Validar código 2FA por documento y obtener JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documento, codigo]
 *             properties:
 *               documento:
 *                 type: string
 *                 example: '1234567890'
 *               codigo:
 *                 type: string
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Login exitoso — devuelve JWT
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Código inválido o expirado
 */
router.post(
  '/2fa/validar',
  [
    body('documento').notEmpty().withMessage('El documento es requerido').trim(),
    body('codigo').notEmpty().withMessage('El código es requerido').trim()
  ],
  validarCodigo2FA
);

export default router;

