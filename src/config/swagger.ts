import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Crisalia API',
      version: '1.0.0',
      description: 'API REST de la plataforma médica Crisalia (Nutrabiotics). Gestiona médicos, pacientes, citas, historia clínica, fórmulas, videollamadas e integraciones de IA.',
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local' },
      { url: 'https://crisalia-back.vercel.app', description: 'Producción (Vercel)' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido en POST /api/auth/login',
        },
        ExternalToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-External-Token',
          description: 'Token estático para la API externa de solo lectura',
        },
      },
      schemas: {
        // ── Respuestas genéricas ──────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Error interno del servidor' },
            status: { type: 'string', example: 'error' },
          },
        },
        ValidationErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error de validación' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        // ── Auth ─────────────────────────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'medico@crisalia.co' },
            password: { type: 'string', minLength: 6, example: 'MiPass123!' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
                user: { $ref: '#/components/schemas/UserBase' },
              },
            },
          },
        },
        RegisterMedicoRequest: {
          type: 'object',
          required: ['nombre', 'apellido', 'email', 'password'],
          properties: {
            nombre: { type: 'string', minLength: 2, example: 'Carlos' },
            apellido: { type: 'string', minLength: 2, example: 'Gómez' },
            email: { type: 'string', format: 'email', example: 'carlos@crisalia.co' },
            password: { type: 'string', minLength: 8, example: 'MiPass123!' },
            especialidad: { type: 'string', example: 'Medicina interna' },
            whatsapp: { type: 'string', example: '+573001234567' },
          },
        },
        RegisterPacienteRequest: {
          type: 'object',
          required: ['nombre', 'apellido', 'email', 'password'],
          properties: {
            nombre: { type: 'string', minLength: 2, example: 'Ana' },
            apellido: { type: 'string', minLength: 2, example: 'Martínez' },
            email: { type: 'string', format: 'email', example: 'ana@email.com' },
            password: { type: 'string', minLength: 6, example: 'Pass123' },
            telefono: { type: 'string', example: '+573001234567' },
            aceptaTerminos: { type: 'boolean', example: true },
            aceptaConsentimiento: { type: 'boolean', example: true },
          },
        },
        // ── Entidades base ────────────────────────────────────────────────────
        UserBase: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d1' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['medico', 'paciente', 'administrativo'] },
            nombre: { type: 'string' },
            apellido: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Cita: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            pacienteId: { type: 'string' },
            medicoId: { type: 'string' },
            fecha: { type: 'string', format: 'date', example: '2026-07-15' },
            hora: { type: 'string', example: '10:00' },
            tipo: { type: 'string', enum: ['preconsulta', 'consulta', 'control'] },
            modalidad: { type: 'string', enum: ['presencial', 'virtual'] },
            estado: {
              type: 'string',
              enum: ['pendiente', 'confirmada', 'en_espera', 'en_consulta', 'cancelada', 'completada'],
            },
            meetingId: { type: 'string' },
            grabacionUrl: { type: 'string' },
            motivoCancelacion: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        HistoriaClinica: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            citaId: { type: 'string' },
            pacienteId: { type: 'string' },
            medicoId: { type: 'string' },
            motivoConsulta: { type: 'string' },
            examenFisico: { type: 'object' },
            diagnostico: { type: 'array', items: { type: 'string' } },
            plan: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        FormulaMedica: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            citaId: { type: 'string' },
            pacienteId: { type: 'string' },
            medicoId: { type: 'string' },
            medicamentos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nombre: { type: 'string' },
                  dosis: { type: 'string' },
                  frecuencia: { type: 'string' },
                  duracion: { type: 'string' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Incapacidad: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            citaId: { type: 'string' },
            pacienteId: { type: 'string' },
            medicoId: { type: 'string' },
            diasIncapacidad: { type: 'integer', example: 3 },
            fechaInicio: { type: 'string', format: 'date' },
            diagnostico: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Autenticación y registro de usuarios' },
      { name: 'Médico - Agendamiento', description: 'Gestión de agenda y citas del médico' },
      { name: 'Médico - Historia Clínica', description: 'Creación y consulta de historias clínicas' },
      { name: 'Médico - Fórmula Médica', description: 'Prescripciones médicas' },
      { name: 'Médico - Incapacidad', description: 'Certificados de incapacidad' },
      { name: 'Médico - Interconsulta', description: 'Remisiones a otros especialistas' },
      { name: 'Médico - Examen Médico', description: 'Hallazgos del examen físico' },
      { name: 'Médico - Apoyo Terapéutico', description: 'Apoyos terapéuticos ordenados' },
      { name: 'Médico - Ayuda Diagnóstica', description: 'Órdenes de ayudas diagnósticas' },
      { name: 'Médico - Videocall', description: 'Gestión de videollamadas (AWS Chime)' },
      { name: 'Médico - Perfil', description: 'Perfil, preajustes clínicos y suscripción' },
      { name: 'Médico - Métricas', description: 'Dashboard y métricas del médico' },
      { name: 'Médico - Chat', description: 'Chat en tiempo real con pacientes' },
      { name: 'Médico - CIE-10', description: 'Búsqueda de códigos de diagnóstico CIE-10' },
      { name: 'Médico - Copiloto de Voz', description: 'Asistente de voz con IA (AWS Bedrock)' },
      { name: 'Médico - Google Calendar', description: 'Sincronización con Google Calendar' },
      { name: 'Médico - Paraclínicos', description: 'Resultados de laboratorio y paraclínicos' },
      { name: 'Médico - IA', description: 'Módulos de IA entrenada y simulada' },
      { name: 'Médico - Pago', description: 'Registro y estadísticas de pagos' },
      { name: 'Paciente - Agendamiento', description: 'Búsqueda de médicos y gestión de citas' },
      { name: 'Paciente - Historia Clínica', description: 'Consulta de historia clínica propia' },
      { name: 'Paciente - Interrogatorio', description: 'Cuestionario de preconsulta' },
      { name: 'Paciente - Tratamiento', description: 'Tratamiento activo e indicaciones' },
      { name: 'Paciente - Paraclínicos', description: 'Carga y consulta de paraclínicos' },
      { name: 'Paciente - Cuidador IA', description: 'Asistente de seguimiento con IA' },
      { name: 'Paciente - Alimentos', description: 'Análisis de alimentos con IA' },
      { name: 'Paciente - Fórmula', description: 'Consulta de fórmula vigente' },
      { name: 'Paciente - Chat', description: 'Chat en tiempo real con el médico' },
      { name: 'Administrativo - Agenda', description: 'Gestión de boxes y asignaciones' },
      { name: 'Administrativo - RIPS', description: 'Generación y validación de RIPS' },
      { name: 'Administrativo - Terceros', description: 'Aseguradoras y pagadores' },
      { name: 'Administrativo - Ingreso', description: 'Control de personal e ingresos' },
      { name: 'Admin', description: 'Operaciones de administración del sistema' },
      { name: 'External - Admin', description: 'API de solo lectura con token estático' },
      { name: 'External - Tools', description: 'API para integraciones externas con OTP' },
      { name: 'Public', description: 'Endpoints públicos sin autenticación' },
    ],
  },
  apis: ['./src/routes/**/*.ts', './src/index.ts', './src/config/swagger.routes.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
