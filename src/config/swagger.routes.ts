/**
 * Anotaciones Swagger/OpenAPI para todas las rutas de la API.
 * Este archivo es procesado por swagger-jsdoc; no exporta nada en runtime.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — AGENDAMIENTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/agendamiento/configuracion:
 *   get:
 *     tags: [Médico - Agendamiento]
 *     summary: Obtener configuración de agenda
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Configuración de agenda del médico
 *   post:
 *     tags: [Médico - Agendamiento]
 *     summary: Crear configuración de agenda
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Datos de configuración de agenda (horarios, duración de cita, etc.)
 *     responses:
 *       200:
 *         description: Configuración guardada
 *   put:
 *     tags: [Médico - Agendamiento]
 *     summary: Actualizar configuración de agenda
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Configuración actualizada
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas:
 *   get:
 *     tags: [Médico - Agendamiento]
 *     summary: Listar todas las citas del médico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha
 *         schema:
 *           type: string
 *           format: date
 *         description: Filtrar por fecha (YYYY-MM-DD)
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, confirmada, en_espera, en_consulta, cancelada, completada]
 *     responses:
 *       200:
 *         description: Lista de citas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Cita'
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/hoy:
 *   get:
 *     tags: [Médico - Agendamiento]
 *     summary: Obtener citas de hoy
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Citas del día actual
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/{citaId}/confirmar:
 *   put:
 *     tags: [Médico - Agendamiento]
 *     summary: Confirmar una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cita confirmada
 *       404:
 *         description: Cita no encontrada
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/{citaId}/cancelar:
 *   put:
 *     tags: [Médico - Agendamiento]
 *     summary: Cancelar una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivoCancelacion:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cita cancelada
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/{citaId}/completar:
 *   put:
 *     tags: [Médico - Agendamiento]
 *     summary: Marcar una cita como completada
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cita completada
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/{citaId}/resumen-pdf:
 *   post:
 *     tags: [Médico - Agendamiento]
 *     summary: Generar PDF de resumen de la cita
 *     description: Genera un PDF con historia clínica, fórmula médica, incapacidad e interconsulta de la cita.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: URL del PDF generado
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/{citaId}/recording-url:
 *   get:
 *     tags: [Médico - Agendamiento]
 *     summary: Obtener URL firmada de la grabación de videoconsulta
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: URL de S3 firmada para reproducir la grabación
 */

/**
 * @swagger
 * /api/medico/agendamiento/citas/{citaId}/preconsulta:
 *   get:
 *     tags: [Médico - Agendamiento]
 *     summary: Obtener análisis de preconsulta IA
 *     description: Devuelve el resumen del interrogatorio del paciente generado por IA para que el médico lo revise antes de la consulta.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Análisis de preconsulta
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — HISTORIA CLÍNICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/historia-clinica:
 *   post:
 *     tags: [Médico - Historia Clínica]
 *     summary: Crear historia clínica
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HistoriaClinica'
 *     responses:
 *       201:
 *         description: Historia clínica creada
 *       403:
 *         description: Límite de plan alcanzado
 */

/**
 * @swagger
 * /api/medico/historia-clinica/cita/{citaId}:
 *   get:
 *     tags: [Médico - Historia Clínica]
 *     summary: Obtener historia clínica por cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historia clínica de la cita
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HistoriaClinica'
 */

/**
 * @swagger
 * /api/medico/historia-clinica/paciente/{pacienteId}:
 *   get:
 *     tags: [Médico - Historia Clínica]
 *     summary: Obtener todas las historias clínicas de un paciente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de historias clínicas
 */

/**
 * @swagger
 * /api/medico/historia-clinica/paciente/{pacienteId}/last-summary:
 *   get:
 *     tags: [Médico - Historia Clínica]
 *     summary: Obtener resumen de la última historia clínica del paciente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resumen de la última historia
 */

/**
 * @swagger
 * /api/medico/historia-clinica/{historiaId}:
 *   get:
 *     tags: [Médico - Historia Clínica]
 *     summary: Obtener historia clínica por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historiaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historia clínica
 *       404:
 *         description: No encontrada
 *   put:
 *     tags: [Médico - Historia Clínica]
 *     summary: Actualizar historia clínica
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historiaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HistoriaClinica'
 *     responses:
 *       200:
 *         description: Historia actualizada
 *   delete:
 *     tags: [Médico - Historia Clínica]
 *     summary: Eliminar historia clínica (soft delete)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historiaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historia eliminada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — FÓRMULA MÉDICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/formula-medica/verificar-y-crear:
 *   post:
 *     tags: [Médico - Fórmula Médica]
 *     summary: Verificar y crear fórmula médica
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FormulaMedica'
 *     responses:
 *       201:
 *         description: Fórmula creada
 */

/**
 * @swagger
 * /api/medico/formula-medica/cita/{citaId}:
 *   get:
 *     tags: [Médico - Fórmula Médica]
 *     summary: Obtener fórmula médica de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fórmula médica
 */

/**
 * @swagger
 * /api/medico/formula-medica/paciente/{pacienteId}:
 *   get:
 *     tags: [Médico - Fórmula Médica]
 *     summary: Obtener fórmulas médicas de un paciente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de fórmulas
 */

/**
 * @swagger
 * /api/medico/formula-medica/{formulaId}:
 *   get:
 *     tags: [Médico - Fórmula Médica]
 *     summary: Obtener fórmula por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formulaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fórmula médica
 *   delete:
 *     tags: [Médico - Fórmula Médica]
 *     summary: Eliminar fórmula médica
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formulaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fórmula eliminada
 */

/**
 * @swagger
 * /api/medico/formula-medica/{formulaId}/generar-orden-alivia:
 *   post:
 *     tags: [Médico - Fórmula Médica]
 *     summary: Generar orden de despacho en Alivia (farmacia)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formulaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orden generada en Alivia
 *       503:
 *         description: Integración Alivia deshabilitada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — INCAPACIDAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/incapacidad:
 *   post:
 *     tags: [Médico - Incapacidad]
 *     summary: Crear certificado de incapacidad
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Incapacidad'
 *     responses:
 *       201:
 *         description: Incapacidad creada
 */

/**
 * @swagger
 * /api/medico/incapacidad/cita/{citaId}:
 *   get:
 *     tags: [Médico - Incapacidad]
 *     summary: Obtener incapacidad de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Incapacidad de la cita
 */

/**
 * @swagger
 * /api/medico/incapacidad/{incapacidadId}:
 *   get:
 *     tags: [Médico - Incapacidad]
 *     summary: Obtener incapacidad por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incapacidadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Incapacidad
 *   put:
 *     tags: [Médico - Incapacidad]
 *     summary: Actualizar incapacidad
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incapacidadId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Incapacidad'
 *     responses:
 *       200:
 *         description: Actualizada
 *   delete:
 *     tags: [Médico - Incapacidad]
 *     summary: Eliminar incapacidad
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: incapacidadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Eliminada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — VIDEOCALL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/videocall/meetings:
 *   post:
 *     tags: [Médico - Videocall]
 *     summary: Crear videollamada (AWS Chime)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citaId]
 *             properties:
 *               citaId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Meeting creado — devuelve meetingId y datos de Chime
 *   get:
 *     tags: [Médico - Videocall]
 *     summary: Listar meetings del médico
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de meetings
 */

/**
 * @swagger
 * /api/medico/videocall/meetings/{meetingId}:
 *   get:
 *     tags: [Médico - Videocall]
 *     summary: Obtener datos de un meeting
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Datos del meeting
 *   delete:
 *     tags: [Médico - Videocall]
 *     summary: Terminar meeting
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meeting terminado
 */

/**
 * @swagger
 * /api/medico/videocall/meetings/{meetingId}/attendees:
 *   post:
 *     tags: [Médico - Videocall]
 *     summary: Crear asistente en el meeting
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               externalUserId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Asistente creado — devuelve credenciales Chime para el cliente
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — PERFIL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/perfil:
 *   get:
 *     tags: [Médico - Perfil]
 *     summary: Obtener perfil del médico autenticado
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del médico
 *   put:
 *     tags: [Médico - Perfil]
 *     summary: Actualizar perfil
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Perfil actualizado
 */

/**
 * @swagger
 * /api/medico/perfil/suscripcion:
 *   get:
 *     tags: [Médico - Perfil]
 *     summary: Obtener estado de suscripción
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de suscripción y plan
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — MÉTRICAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/metricas/dashboard:
 *   get:
 *     tags: [Médico - Métricas]
 *     summary: Obtener métricas del dashboard
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: KPIs del médico (citas, pacientes, ingresos)
 */

/**
 * @swagger
 * /api/medico/metricas/tendencia:
 *   get:
 *     tags: [Médico - Métricas]
 *     summary: Obtener tendencias de métricas
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos de tendencia para gráficos
 */

/**
 * @swagger
 * /api/medico/metricas/motivos-consulta:
 *   get:
 *     tags: [Médico - Métricas]
 *     summary: Obtener distribución de motivos de consulta
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Motivos de consulta agrupados
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — CHAT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/chat/cita/{citaId}:
 *   get:
 *     tags: [Médico - Chat]
 *     summary: Obtener mensajes del chat de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de mensajes
 *   post:
 *     tags: [Médico - Chat]
 *     summary: Enviar mensaje en el chat de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto:
 *                 type: string
 *     responses:
 *       201:
 *         description: Mensaje enviado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — CIE-10
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/cie10/search:
 *   get:
 *     tags: [Médico - CIE-10]
 *     summary: Buscar códigos de diagnóstico CIE-10
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Término de búsqueda (código o descripción)
 *         example: 'diabetes'
 *     responses:
 *       200:
 *         description: Lista de códigos CIE-10 coincidentes
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — COPILOTO DE VOZ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/copiloto-voz/health:
 *   get:
 *     tags: [Médico - Copiloto de Voz]
 *     summary: Verificar estado del copiloto de voz
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estado del servicio
 */

/**
 * @swagger
 * /api/medico/copiloto-voz/config:
 *   get:
 *     tags: [Médico - Copiloto de Voz]
 *     summary: Obtener configuración del copiloto de voz
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Configuración del copiloto
 *   put:
 *     tags: [Médico - Copiloto de Voz]
 *     summary: Actualizar configuración del copiloto de voz
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Configuración actualizada
 */

/**
 * @swagger
 * /api/medico/copiloto-voz/sugerir-examen:
 *   post:
 *     tags: [Médico - Copiloto de Voz]
 *     summary: Solicitar sugerencia de sección de examen al copiloto IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               texto:
 *                 type: string
 *                 description: Fragmento de transcripción a analizar
 *     responses:
 *       200:
 *         description: Sección de examen sugerida
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — GOOGLE CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/google-calendar/auth-url:
 *   get:
 *     tags: [Médico - Google Calendar]
 *     summary: Obtener URL de autorización OAuth2 de Google
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: URL para redirigir al médico a Google OAuth
 */

/**
 * @swagger
 * /api/medico/google-calendar/estado:
 *   get:
 *     tags: [Médico - Google Calendar]
 *     summary: Verificar estado de conexión con Google Calendar
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de la conexión
 */

/**
 * @swagger
 * /api/medico/google-calendar/sync:
 *   post:
 *     tags: [Médico - Google Calendar]
 *     summary: Sincronizar citas con Google Calendar
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sincronización completada
 */

/**
 * @swagger
 * /api/medico/google-calendar/disconnect:
 *   delete:
 *     tags: [Médico - Google Calendar]
 *     summary: Desconectar Google Calendar
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Desconectado exitosamente
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — AGENDAMIENTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/agendamiento/medicos:
 *   get:
 *     tags: [Paciente - Agendamiento]
 *     summary: Listar médicos disponibles
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de médicos disponibles para agendar
 */

/**
 * @swagger
 * /api/paciente/agendamiento/medicos-recomendados:
 *   get:
 *     tags: [Paciente - Agendamiento]
 *     summary: Obtener médicos recomendados para el paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de médicos recomendados
 */

/**
 * @swagger
 * /api/paciente/agendamiento/medicos/{medicoId}/horarios:
 *   get:
 *     tags: [Paciente - Agendamiento]
 *     summary: Obtener horarios disponibles de un médico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: medicoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: fecha
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha para consultar disponibilidad (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Slots de horario disponibles
 */

/**
 * @swagger
 * /api/paciente/agendamiento/citas:
 *   get:
 *     tags: [Paciente - Agendamiento]
 *     summary: Listar citas del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de citas del paciente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Cita'
 *   post:
 *     tags: [Paciente - Agendamiento]
 *     summary: Crear nueva cita
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [medicoId, fecha, hora, tipo, modalidad]
 *             properties:
 *               medicoId:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date
 *                 example: '2026-07-20'
 *               hora:
 *                 type: string
 *                 example: '10:00'
 *               tipo:
 *                 type: string
 *                 enum: [preconsulta, consulta, control]
 *               modalidad:
 *                 type: string
 *                 enum: [presencial, virtual]
 *               codigoDescuento:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cita creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cita'
 */

/**
 * @swagger
 * /api/paciente/agendamiento/citas/{citaId}/cancelar:
 *   put:
 *     tags: [Paciente - Agendamiento]
 *     summary: Cancelar cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivoCancelacion:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cita cancelada
 */

/**
 * @swagger
 * /api/paciente/agendamiento/citas/{citaId}/sala-espera:
 *   get:
 *     tags: [Paciente - Agendamiento]
 *     summary: Obtener estado de sala de espera virtual
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado de la sala de espera y turno estimado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — INTERROGATORIO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/interrogatorio:
 *   post:
 *     tags: [Paciente - Interrogatorio]
 *     summary: Crear interrogatorio de preconsulta
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               citaId:
 *                 type: string
 *               respuestas:
 *                 type: object
 *     responses:
 *       201:
 *         description: Interrogatorio creado
 *   get:
 *     tags: [Paciente - Interrogatorio]
 *     summary: Listar interrogatorios del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de interrogatorios
 */

/**
 * @swagger
 * /api/paciente/interrogatorio/{interrogatorioId}/analizar:
 *   post:
 *     tags: [Paciente - Interrogatorio]
 *     summary: Generar análisis IA del interrogatorio
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interrogatorioId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Análisis generado por IA
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — HISTORIA CLÍNICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/historia-clinica:
 *   get:
 *     tags: [Paciente - Historia Clínica]
 *     summary: Listar historias clínicas propias del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de historias clínicas
 */

/**
 * @swagger
 * /api/paciente/historia-clinica/cita/{citaId}/recomendaciones-ia:
 *   get:
 *     tags: [Paciente - Historia Clínica]
 *     summary: Obtener recomendaciones IA de la historia clínica
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Recomendaciones generadas por IA
 */

/**
 * @swagger
 * /api/paciente/historia-clinica/cita/{citaId}/preguntar:
 *   post:
 *     tags: [Paciente - Historia Clínica]
 *     summary: Hacer una pregunta al asistente IA sobre la historia clínica
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pregunta]
 *             properties:
 *               pregunta:
 *                 type: string
 *                 example: '¿Qué medicamentos debo tomar?'
 *     responses:
 *       200:
 *         description: Respuesta del asistente IA
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — TRATAMIENTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/tratamiento/activo:
 *   get:
 *     tags: [Paciente - Tratamiento]
 *     summary: Obtener tratamiento activo del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tratamiento activo con medicamentos e indicaciones
 */

/**
 * @swagger
 * /api/paciente/tratamiento/marcar-toma:
 *   post:
 *     tags: [Paciente - Tratamiento]
 *     summary: Registrar toma de medicamento
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               medicamentoId:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Toma registrada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — CUIDADOR IA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/cuidador-ia/mensaje:
 *   post:
 *     tags: [Paciente - Cuidador IA]
 *     summary: Enviar mensaje al cuidador IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mensaje]
 *             properties:
 *               mensaje:
 *                 type: string
 *                 example: '¿Puedo tomar el medicamento con leche?'
 *     responses:
 *       200:
 *         description: Respuesta del cuidador IA
 */

/**
 * @swagger
 * /api/paciente/cuidador-ia/alertar-medico:
 *   post:
 *     tags: [Paciente - Cuidador IA]
 *     summary: Alertar al médico desde el cuidador IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               motivo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alerta enviada al médico
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — ALIMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/alimentos/analizar:
 *   post:
 *     tags: [Paciente - Alimentos]
 *     summary: Analizar imagen de alimento con IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               imagen:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Análisis nutricional del alimento
 */

/**
 * @swagger
 * /api/paciente/alimentos/historial:
 *   get:
 *     tags: [Paciente - Alimentos]
 *     summary: Obtener historial de evaluaciones de alimentos
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de evaluaciones anteriores
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ADMINISTRATIVO — AGENDA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/administrativo/agenda/citas:
 *   get:
 *     tags: [Administrativo - Agenda]
 *     summary: Listar todas las citas (vista administrativa)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: medicoId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de citas
 */

/**
 * @swagger
 * /api/administrativo/agenda/boxes:
 *   get:
 *     tags: [Administrativo - Agenda]
 *     summary: Listar boxes/consultorios
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de boxes
 *   post:
 *     tags: [Administrativo - Agenda]
 *     summary: Crear box/consultorio
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: 'Consultorio 1'
 *               capacidad:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Box creado
 */

/**
 * @swagger
 * /api/administrativo/agenda/mapa-ocupacion:
 *   get:
 *     tags: [Administrativo - Agenda]
 *     summary: Obtener mapa de ocupación de boxes en tiempo real
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estado de ocupación de cada box
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ADMINISTRATIVO — RIPS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/administrativo/rips/consolidado:
 *   get:
 *     tags: [Administrativo - RIPS]
 *     summary: Obtener datos consolidados para RIPS
 *     description: RIPS (Registro Individual de Prestación de Servicios) es el sistema de facturación de salud en Colombia.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fechaInicio
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: fechaFin
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Datos consolidados para generación de RIPS
 */

/**
 * @swagger
 * /api/administrativo/rips/descargar:
 *   get:
 *     tags: [Administrativo - RIPS]
 *     summary: Descargar archivo RIPS generado
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Archivo ZIP con los archivos RIPS
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ADMINISTRATIVO — TERCEROS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/administrativo/terceros:
 *   get:
 *     tags: [Administrativo - Terceros]
 *     summary: Listar aseguradoras y pagadores
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de terceros
 *   post:
 *     tags: [Administrativo - Terceros]
 *     summary: Crear tercero (aseguradora/pagador)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, nit]
 *             properties:
 *               nombre:
 *                 type: string
 *               nit:
 *                 type: string
 *               tipo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tercero creado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/admin/cups2026/search:
 *   get:
 *     tags: [Admin]
 *     summary: Buscar procedimientos CUPS 2026
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Código o descripción del procedimiento
 *         example: 'consulta'
 *     responses:
 *       200:
 *         description: Lista de códigos CUPS coincidentes
 */

/**
 * @swagger
 * /api/admin/codigos-descuento:
 *   get:
 *     tags: [Admin]
 *     summary: Listar códigos de descuento
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de códigos
 *   post:
 *     tags: [Admin]
 *     summary: Crear código de descuento
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [codigo, descuento]
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: 'BIENVENIDO20'
 *               descuento:
 *                 type: number
 *                 example: 20
 *               tipo:
 *                 type: string
 *                 enum: [porcentaje, valor_fijo]
 *               usos_maximos:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Código creado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL — ADMIN API (token estático, solo lectura)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/external/pacientes:
 *   get:
 *     tags: [External - Admin]
 *     summary: Listar todos los pacientes
 *     description: Requiere token estático en header X-External-Token o Authorization Bearer.
 *     security:
 *       - ExternalToken: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Lista de pacientes
 *       401:
 *         description: Token inválido
 */

/**
 * @swagger
 * /api/external/medicos:
 *   get:
 *     tags: [External - Admin]
 *     summary: Listar todos los médicos
 *     security:
 *       - ExternalToken: []
 *     responses:
 *       200:
 *         description: Lista de médicos
 */

/**
 * @swagger
 * /api/external/medicos/{medicoId}/disponibilidad:
 *   get:
 *     tags: [External - Admin]
 *     summary: Obtener disponibilidad de un médico
 *     security:
 *       - ExternalToken: []
 *     parameters:
 *       - in: path
 *         name: medicoId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: fecha
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Slots disponibles del médico
 */

/**
 * @swagger
 * /api/external/citas:
 *   get:
 *     tags: [External - Admin]
 *     summary: Listar citas con filtros
 *     security:
 *       - ExternalToken: []
 *     parameters:
 *       - in: query
 *         name: fechaInicio
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: fechaFin
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de citas
 */

/**
 * @swagger
 * /api/external/historias-clinicas/paciente/{pacienteId}/ultima:
 *   get:
 *     tags: [External - Admin]
 *     summary: Obtener última historia clínica de un paciente
 *     security:
 *       - ExternalToken: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Última historia clínica
 */

/**
 * @swagger
 * /api/external/alivia/webhook:
 *   post:
 *     tags: [External - Admin]
 *     summary: Webhook de confirmación de compra Alivia
 *     description: Endpoint llamado por Alivia para confirmar que el paciente retiró su fórmula en farmacia.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook procesado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/public/documentos-legales:
 *   get:
 *     tags: [Public]
 *     summary: Obtener documentos legales (términos y condiciones, consentimientos)
 *     responses:
 *       200:
 *         description: Lista de documentos legales vigentes
 */

/**
 * @swagger
 * /api/public/registro-medico/{codigo}:
 *   get:
 *     tags: [Public]
 *     summary: Validar código de invitación para registro de médico
 *     parameters:
 *       - in: path
 *         name: codigo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Código válido — devuelve datos del médico invitado
 *       404:
 *         description: Código inválido o expirado
 */

/**
 * @swagger
 * /api/public/hc-publica/{token}:
 *   get:
 *     tags: [Public]
 *     summary: Ver historia clínica pública por token compartido
 *     description: El paciente puede compartir un enlace con token (válido 48h) para que un tercero vea su historia clínica.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historia clínica pública
 *       401:
 *         description: Token expirado o inválido
 */

/**
 * @swagger
 * /api/health:
 *   get:
 *     tags: [Public]
 *     summary: Health check del servidor
 *     responses:
 *       200:
 *         description: API funcionando
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: CRISALIA API está funcionando
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — INTERCONSULTA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/interconsulta:
 *   post:
 *     tags: [Médico - Interconsulta]
 *     summary: Crear interconsulta (remisión a otro especialista)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citaId, pacienteId, especialidadDestino]
 *             properties:
 *               citaId:
 *                 type: string
 *               pacienteId:
 *                 type: string
 *               especialidadDestino:
 *                 type: string
 *               motivoRemision:
 *                 type: string
 *     responses:
 *       201:
 *         description: Interconsulta creada
 */

/**
 * @swagger
 * /api/medico/interconsulta/cita/{citaId}:
 *   get:
 *     tags: [Médico - Interconsulta]
 *     summary: Obtener interconsulta de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Interconsulta de la cita
 */

/**
 * @swagger
 * /api/medico/interconsulta/paciente/{pacienteId}:
 *   get:
 *     tags: [Médico - Interconsulta]
 *     summary: Obtener interconsultas de un paciente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de interconsultas
 */

/**
 * @swagger
 * /api/medico/interconsulta/{interconsultaId}:
 *   get:
 *     tags: [Médico - Interconsulta]
 *     summary: Obtener interconsulta por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interconsultaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Interconsulta
 *   put:
 *     tags: [Médico - Interconsulta]
 *     summary: Actualizar interconsulta
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interconsultaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Actualizada
 *   delete:
 *     tags: [Médico - Interconsulta]
 *     summary: Eliminar interconsulta
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: interconsultaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Eliminada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — EXAMEN MÉDICO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/examen-medico:
 *   post:
 *     tags: [Médico - Examen Médico]
 *     summary: Registrar hallazgos del examen físico
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citaId, pacienteId]
 *             properties:
 *               citaId:
 *                 type: string
 *               pacienteId:
 *                 type: string
 *               hallazgos:
 *                 type: object
 *     responses:
 *       201:
 *         description: Examen médico creado
 */

/**
 * @swagger
 * /api/medico/examen-medico/cita/{citaId}:
 *   get:
 *     tags: [Médico - Examen Médico]
 *     summary: Obtener examen médico de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Examen médico
 */

/**
 * @swagger
 * /api/medico/examen-medico/paciente/{pacienteId}:
 *   get:
 *     tags: [Médico - Examen Médico]
 *     summary: Obtener exámenes médicos de un paciente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de exámenes
 */

/**
 * @swagger
 * /api/medico/examen-medico/{examenMedicoId}:
 *   get:
 *     tags: [Médico - Examen Médico]
 *     summary: Obtener examen médico por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examenMedicoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Examen médico
 *   put:
 *     tags: [Médico - Examen Médico]
 *     summary: Actualizar examen médico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examenMedicoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Actualizado
 *   delete:
 *     tags: [Médico - Examen Médico]
 *     summary: Eliminar examen médico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examenMedicoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Eliminado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — APOYO TERAPÉUTICO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/apoyo-terapeutico:
 *   post:
 *     tags: [Médico - Apoyo Terapéutico]
 *     summary: Crear orden de apoyo terapéutico
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citaId, pacienteId]
 *             properties:
 *               citaId:
 *                 type: string
 *               pacienteId:
 *                 type: string
 *               tipo:
 *                 type: string
 *                 example: 'Fisioterapia'
 *               indicaciones:
 *                 type: string
 *     responses:
 *       201:
 *         description: Apoyo terapéutico creado
 */

/**
 * @swagger
 * /api/medico/apoyo-terapeutico/cita/{citaId}:
 *   get:
 *     tags: [Médico - Apoyo Terapéutico]
 *     summary: Obtener apoyo terapéutico de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Apoyo terapéutico de la cita
 */

/**
 * @swagger
 * /api/medico/apoyo-terapeutico/{apoyoTerapeuticoId}:
 *   get:
 *     tags: [Médico - Apoyo Terapéutico]
 *     summary: Obtener apoyo terapéutico por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apoyoTerapeuticoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Apoyo terapéutico
 *   put:
 *     tags: [Médico - Apoyo Terapéutico]
 *     summary: Actualizar apoyo terapéutico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apoyoTerapeuticoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Actualizado
 *   delete:
 *     tags: [Médico - Apoyo Terapéutico]
 *     summary: Eliminar apoyo terapéutico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: apoyoTerapeuticoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Eliminado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — AYUDA DIAGNÓSTICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/ayuda-diagnostica:
 *   post:
 *     tags: [Médico - Ayuda Diagnóstica]
 *     summary: Crear orden de ayuda diagnóstica (laboratorios, imágenes)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citaId, pacienteId]
 *             properties:
 *               citaId:
 *                 type: string
 *               pacienteId:
 *                 type: string
 *               examenes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ['Hemograma', 'Glucemia']
 *     responses:
 *       201:
 *         description: Ayuda diagnóstica creada
 */

/**
 * @swagger
 * /api/medico/ayuda-diagnostica/cita/{citaId}:
 *   get:
 *     tags: [Médico - Ayuda Diagnóstica]
 *     summary: Obtener ayuda diagnóstica de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ayuda diagnóstica
 */

/**
 * @swagger
 * /api/medico/ayuda-diagnostica/{ayudaDiagnosticaId}:
 *   get:
 *     tags: [Médico - Ayuda Diagnóstica]
 *     summary: Obtener ayuda diagnóstica por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ayudaDiagnosticaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ayuda diagnóstica
 *   put:
 *     tags: [Médico - Ayuda Diagnóstica]
 *     summary: Actualizar ayuda diagnóstica
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ayudaDiagnosticaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Actualizada
 *   delete:
 *     tags: [Médico - Ayuda Diagnóstica]
 *     summary: Eliminar ayuda diagnóstica
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ayudaDiagnosticaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Eliminada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — PARACLÍNICOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/paraclinicos/{pacienteId}:
 *   get:
 *     tags: [Médico - Paraclínicos]
 *     summary: Listar paraclínicos de un paciente
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de paraclínicos con semáforo de valores
 */

/**
 * @swagger
 * /api/medico/paraclinicos/{pacienteId}/analisis-evolutivo:
 *   get:
 *     tags: [Médico - Paraclínicos]
 *     summary: Obtener análisis evolutivo de paraclínicos con IA
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pacienteId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Análisis de tendencias generado por IA
 */

/**
 * @swagger
 * /api/medico/paraclinicos/{paraclinicoId}/semaforo:
 *   put:
 *     tags: [Médico - Paraclínicos]
 *     summary: Actualizar semáforo (rojo/amarillo/verde) de un paraclínico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paraclinicoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [semaforo]
 *             properties:
 *               semaforo:
 *                 type: string
 *                 enum: [rojo, amarillo, verde]
 *     responses:
 *       200:
 *         description: Semáforo actualizado
 */

/**
 * @swagger
 * /api/medico/paraclinicos/{paraclinicoId}/marcar-revisado:
 *   put:
 *     tags: [Médico - Paraclínicos]
 *     summary: Marcar paraclínico como revisado por el médico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paraclinicoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Marcado como revisado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — IA (Entrenada + Simulada)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/ia-entrenada/categorias:
 *   get:
 *     tags: [Médico - IA]
 *     summary: Listar categorías del repositorio de IA entrenada
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de categorías disponibles
 */

/**
 * @swagger
 * /api/medico/ia-entrenada:
 *   get:
 *     tags: [Médico - IA]
 *     summary: Listar contenido del repositorio de IA entrenada
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoria
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contenido del repositorio
 */

/**
 * @swagger
 * /api/medico/ia-entrenada/buscar:
 *   post:
 *     tags: [Médico - IA]
 *     summary: Buscar en el repositorio de IA entrenada
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 example: 'diabetes tipo 2 tratamiento'
 *     responses:
 *       200:
 *         description: Resultados de búsqueda semántica
 */

/**
 * @swagger
 * /api/medico/ia-simulada/anamnesis-medico:
 *   post:
 *     tags: [Médico - IA]
 *     summary: Generar anamnesis simulada con IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Anamnesis generada
 */

/**
 * @swagger
 * /api/medico/ia-simulada/diagnosticos:
 *   post:
 *     tags: [Médico - IA]
 *     summary: Generar diagnósticos sugeridos por IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Diagnósticos sugeridos
 */

/**
 * @swagger
 * /api/medico/ia-simulada/estrategias-terapeuticas:
 *   post:
 *     tags: [Médico - IA]
 *     summary: Generar estrategias terapéuticas con IA
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Estrategias terapéuticas sugeridas
 */

/**
 * @swagger
 * /api/medico/ia-simulada/demo/metricas-impacto:
 *   get:
 *     tags: [Médico - IA]
 *     summary: Obtener métricas de impacto demo
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas de impacto para demo
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MÉDICO — PAGO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/medico/pago/estadisticas:
 *   get:
 *     tags: [Médico - Pago]
 *     summary: Obtener estadísticas de pagos del médico
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas de ingresos y pagos
 */

/**
 * @swagger
 * /api/medico/pago:
 *   get:
 *     tags: [Médico - Pago]
 *     summary: Listar pagos registrados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pagos
 *   post:
 *     tags: [Médico - Pago]
 *     summary: Registrar un pago
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [citaId, monto, metodoPago]
 *             properties:
 *               citaId:
 *                 type: string
 *               monto:
 *                 type: number
 *                 example: 80000
 *               metodoPago:
 *                 type: string
 *                 enum: [efectivo, transferencia, tarjeta]
 *     responses:
 *       201:
 *         description: Pago registrado
 */

/**
 * @swagger
 * /api/medico/pago/{pagoId}/estado:
 *   put:
 *     tags: [Médico - Pago]
 *     summary: Actualizar estado de un pago
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pagoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [estado]
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [pendiente, completado, rechazado]
 *     responses:
 *       200:
 *         description: Estado actualizado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — PARACLÍNICOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/paraclinicos:
 *   get:
 *     tags: [Paciente - Paraclínicos]
 *     summary: Listar paraclínicos del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de paraclínicos subidos por el paciente
 *   post:
 *     tags: [Paciente - Paraclínicos]
 *     summary: Subir paraclínico (datos JSON)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               valores:
 *                 type: object
 *     responses:
 *       201:
 *         description: Paraclínico creado
 */

/**
 * @swagger
 * /api/paciente/paraclinicos/upload:
 *   post:
 *     tags: [Paciente - Paraclínicos]
 *     summary: Subir archivo de paraclínico (PDF/imagen)
 *     description: Acepta PDF, JPG, PNG o WebP. Máximo 10MB.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Archivo subido y procesado
 *       400:
 *         description: Tipo de archivo no permitido o excede 10MB
 */

/**
 * @swagger
 * /api/paciente/paraclinicos/analisis-evolutivo:
 *   get:
 *     tags: [Paciente - Paraclínicos]
 *     summary: Obtener análisis evolutivo de paraclínicos con IA
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Análisis de tendencias de los valores de laboratorio
 */

/**
 * @swagger
 * /api/paciente/paraclinicos/{id}:
 *   delete:
 *     tags: [Paciente - Paraclínicos]
 *     summary: Eliminar un paraclínico
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paraclínico eliminado
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — FÓRMULA MÉDICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/formula-medica/vigente:
 *   get:
 *     tags: [Paciente - Fórmula]
 *     summary: Obtener la fórmula médica (estrategia terapéutica) vigente del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Fórmula médica más reciente activa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FormulaMedica'
 *       404:
 *         description: No hay fórmula vigente
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PACIENTE — CHAT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/paciente/chat/cita/{citaId}:
 *   get:
 *     tags: [Paciente - Chat]
 *     summary: Obtener mensajes del chat de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de mensajes del chat
 *   post:
 *     tags: [Paciente - Chat]
 *     summary: Enviar mensaje en el chat de una cita
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto:
 *                 type: string
 *     responses:
 *       201:
 *         description: Mensaje enviado
 */

/**
 * @swagger
 * /api/paciente/chat/cita/{citaId}/leido:
 *   post:
 *     tags: [Paciente - Chat]
 *     summary: Marcar mensajes del chat como leídos
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: citaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mensajes marcados como leídos
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ADMINISTRATIVO — INGRESO DE PERSONAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/administrativo/ingreso/medicos:
 *   get:
 *     tags: [Administrativo - Ingreso]
 *     summary: Listar médicos registrados en la plataforma
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de médicos
 */

/**
 * @swagger
 * /api/administrativo/ingreso/personal:
 *   get:
 *     tags: [Administrativo - Ingreso]
 *     summary: Listar personal institucional
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de personal
 *   post:
 *     tags: [Administrativo - Ingreso]
 *     summary: Crear registro de personal institucional
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, cargo]
 *             properties:
 *               nombre:
 *                 type: string
 *               cargo:
 *                 type: string
 *               documento:
 *                 type: string
 *     responses:
 *       201:
 *         description: Personal creado
 */

/**
 * @swagger
 * /api/administrativo/ingreso/personal/{id}:
 *   get:
 *     tags: [Administrativo - Ingreso]
 *     summary: Obtener personal por ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Datos del personal
 *   put:
 *     tags: [Administrativo - Ingreso]
 *     summary: Actualizar personal
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Actualizado
 *   delete:
 *     tags: [Administrativo - Ingreso]
 *     summary: Eliminar personal
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Eliminado
 */

/**
 * @swagger
 * /api/administrativo/ingreso/registro:
 *   get:
 *     tags: [Administrativo - Ingreso]
 *     summary: Listar registros de ingreso/salida por fecha
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Registros del día
 */

/**
 * @swagger
 * /api/administrativo/ingreso/registro/ingreso:
 *   post:
 *     tags: [Administrativo - Ingreso]
 *     summary: Registrar ingreso de personal
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [personalId]
 *             properties:
 *               personalId:
 *                 type: string
 *               hora:
 *                 type: string
 *                 example: '08:00'
 *     responses:
 *       201:
 *         description: Ingreso registrado
 */

/**
 * @swagger
 * /api/administrativo/ingreso/registro/{id}/salida:
 *   put:
 *     tags: [Administrativo - Ingreso]
 *     summary: Registrar salida de personal
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hora:
 *                 type: string
 *                 example: '17:00'
 *     responses:
 *       200:
 *         description: Salida registrada
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL — TOOLS API (OTP por teléfono)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/external/auth/request-otp:
 *   post:
 *     tags: [External - Tools]
 *     summary: Solicitar OTP para autenticación por teléfono
 *     description: Envía un código OTP al número de teléfono. Usar para obtener acceso a las rutas /tools/.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telefono]
 *             properties:
 *               telefono:
 *                 type: string
 *                 example: '+573001234567'
 *     responses:
 *       200:
 *         description: OTP enviado
 */

/**
 * @swagger
 * /api/external/auth/verify-otp:
 *   post:
 *     tags: [External - Tools]
 *     summary: Verificar OTP y obtener phoneToken
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telefono, codigo]
 *             properties:
 *               telefono:
 *                 type: string
 *               codigo:
 *                 type: string
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Autenticado — devuelve phoneToken (Bearer) para rutas /tools/
 */

/**
 * @swagger
 * /api/external/tools/me:
 *   get:
 *     tags: [External - Tools]
 *     summary: Obtener datos del usuario autenticado (paciente o médico)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
 */

/**
 * @swagger
 * /api/external/tools/me/citas:
 *   get:
 *     tags: [External - Tools]
 *     summary: Obtener citas del usuario autenticado
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de citas
 */

/**
 * @swagger
 * /api/external/tools/me/citas/proxima:
 *   get:
 *     tags: [External - Tools]
 *     summary: Obtener próxima cita del usuario
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Próxima cita activa
 */

/**
 * @swagger
 * /api/external/tools/me/agendar:
 *   post:
 *     tags: [External - Tools]
 *     summary: Agendar cita desde integración externa
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [medicoId, fecha, hora]
 *             properties:
 *               medicoId:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date
 *               hora:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cita agendada
 */

/**
 * @swagger
 * /api/external/tools/me/resumen:
 *   get:
 *     tags: [External - Tools]
 *     summary: Obtener resumen integral del paciente generado por Crisal·IA Agent
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Resumen clínico del paciente
 */

/**
 * @swagger
 * /api/external/tools/me/resumen/refresh:
 *   post:
 *     tags: [External - Tools]
 *     summary: Forzar regeneración del resumen del paciente
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Resumen regenerado
 */

/**
 * @swagger
 * /api/external/tools/medicos:
 *   get:
 *     tags: [External - Tools]
 *     summary: Listar médicos disponibles para agendar
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de médicos con disponibilidad
 */
