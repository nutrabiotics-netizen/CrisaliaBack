# CrisaliaBack — Contexto Completo del Proyecto

Plataforma SaaS de salud para **Nutrabiotics**. Backend médico colombiano con historia clínica, consultas, fórmulas, IA clínica, transcripción en tiempo real y cumplimiento regulatorio (RIPS, CIE-10, CUPS 2026).

---

## Arquitectura de despliegue

| Servidor | Entry point | Plataforma | Puerto |
|---|---|---|---|
| API REST | `src/server.ts` → `src/index.ts` | Vercel | 5000 |
| WebSocket | `src/server-ws.ts` | Railway | 5001 |

`src/index.ts` exporta la app Express sin `.listen()`. Ambos servidores la importan.

---

## Stack técnico

- **Runtime:** Node.js >=20 + TypeScript compilado a CommonJS
- **Framework:** Express 5
- **BD:** MongoDB + Mongoose 8
- **Auth:** JWT (7 días), bcryptjs, OTP WhatsApp, 2FA por documento
- **Seguridad:** Helmet, CORS, express-rate-limit, express-validator
- **AI/LLM:** OpenAI (`openai` v6), AWS Bedrock (Bedrock Agent Runtime), ElevenLabs (TTS)
- **Cloud:** AWS S3, AWS Chime (video), AWS Transcribe (streaming)
- **Real-time:** WebSockets (`ws`, `noServer: true`)
- **Docs:** PDFKit + QRCode, Swagger (spec pre-generado en build)
- **Notificaciones:** WhatsApp + Email
- **Integraciones:** Google Calendar, ALIVIA (farmacia), Nutrabiotics

---

## Estructura de carpetas

```
src/
├── config/
│   ├── awsConfig.ts              # Clientes AWS (Chime, Bedrock, S3, Transcribe)
│   ├── copilotoVozConfig.ts
│   ├── database.ts               # connectDB() con MONGODB_URI
│   ├── swagger.ts                # Generación spec OpenAPI
│   └── swagger.routes.ts
├── controllers/
│   ├── admin/                    # codigoDescuento, cups2026, linkCaptacion, parametrosNutrabiotics
│   ├── administrativo/           # agenda, demoras, estadisticas, ingreso, rips, terceros, visita
│   ├── auth/                     # authController, twoFactorController
│   ├── captacion/
│   ├── external/                 # externalController, toolsController, toolsAuthController, aliviaWebhook
│   ├── medico/                   # ~30 módulos (ver lista completa abajo)
│   ├── paciente/                 # ~20 módulos
│   ├── public/                   # documentosLegales, encuesta, registroMedico
│   └── shared/                   # chat, cie10
├── middleware/
│   ├── auth.ts                   # authenticate + authorize(rol)
│   ├── checkSuscripcion.ts       # Límites de plan / trial
│   ├── externalAuth.ts           # Token estático EXTERNAL_API_TOKEN
│   ├── externalPhoneAuth.ts      # requirePhoneToken (OTP flow)
│   └── requirePago.ts            # requireCuota1
├── models/                       # 47 esquemas Mongoose (PascalCase)
├── routes/
│   ├── medico/index.ts           # ~30 sub-routers
│   ├── paciente/index.ts         # ~20 sub-routers
│   ├── administrativo/
│   ├── auth/
│   ├── admin/
│   ├── external/                 # README.md con documentación
│   └── public/
├── services/                     # Lógica de negocio (40+ servicios)
│   ├── ai/                       # AIService, bedrock, bedrockHeridas, bedrockText, crisaliaAgent
│   ├── auditoria/
│   ├── auth/
│   ├── chat/
│   ├── cie10/
│   ├── jobs/                     # controlPreCitaJob (pre-cita WhatsApp)
│   ├── medico/                   # agendamiento, copiloto-voz, formulaMedica, historiaClinica, etc.
│   ├── notifications/            # medicoNotificacionService, citaWhatsAppNotifier
│   ├── nutricion/                # alimentoEvaluacionBedrock, alimentoEvaluacionSimulada
│   ├── openai/
│   ├── paciente/                 # agendamiento, interrogatorio, resumenPaciente, tratamiento
│   ├── paraclinicos/             # paraclinicoOcrService (OCR + visión)
│   ├── transcription/            # streaming, audioStreamQueue
│   ├── whatsapp/
│   ├── external/                 # phoneAuthService
│   └── ripsGeneratorService.ts
├── types/
│   └── index.ts                  # UserRole enum + interfaces principales
├── utils/
│   ├── auditoriaHelper.ts        # registrarAccion(), obtenerIp(), obtenerUserAgent()
│   ├── citaFechaHora.ts
│   ├── dateFormatter.ts
│   ├── errors.ts                 # AppError + handleError()
│   ├── excelReader.ts
│   ├── jwt.ts                    # generateToken() + verifyToken()
│   ├── pdfGenerator.ts           # 845 líneas — 8 generadores de PDF
│   └── s3Documents.ts            # buildCitaDocumentKey(), uploadPDFAndGetUrl()
├── ws/
│   ├── registerWebSockets.ts     # upgrade router por pathname
│   ├── transcriptionHandlers.ts
│   ├── copilotoVozHandlers.ts
│   └── chatHandlers.ts
└── scripts/                      # Datos iniciales, importación, swagger gen
```

---

## Roles y módulos

```typescript
export enum UserRole {
  MEDICO = 'medico',
  PACIENTE = 'paciente',
  ADMINISTRATIVO = 'administrativo'
}
```

| Módulo | Prefijo de ruta | Auth |
|---|---|---|
| Auth | `/api/auth` | pública |
| Médico | `/api/medico` | JWT + MEDICO |
| Paciente | `/api/paciente` | JWT + PACIENTE |
| Administrativo | `/api/administrativo` | JWT + ADMINISTRATIVO |
| Admin | `/api/admin` | JWT + (rol admin) |
| External | `/api/external` | Token estático o phoneToken |
| Public | `/api/public` | sin auth |

---

## Modelos MongoDB (47 total)

### Usuarios

**User.ts**
- `email` (unique), `password` (bcrypt), `role` (enum UserRole)

**Medico.ts**
- nombre, apellido, especialidad, numeroColegiatura, telefono, whatsapp
- `suscripcionActiva: boolean`
- `planPrueba: { activo, pacientesUsados, limite: 3 }`
- `logoUrl`, `firmaUrl`, `indicacionesAntesConsulta`
- `preajustes: { duracionConsultaMin, intervaloEntreConsultasMin, idioma, firmaDigitalHash, firmaImagenUrl, plantillaObservaciones, semaforoColores }`
- `copilotoVoz: { habilitado }`
- `googleCalendar: { accessToken, refreshToken, expiryDate, conectado }`
- `aliados: { alivia, nutrapp, amf }` (cada uno con activo, userId, token)

**Paciente.ts**
- nombre, apellido, email, telefono, direccion
- `tipoDocumento` (CC/TI/RC/PA/CE), `numeroDocumento`
- fechaNacimiento, sexoBiologico, genero, estadoCivil, nacionalidad, grupoSanguineo, rh
- escolaridad, ocupacion, condicionDesplazamiento, grupoEtnico
- regimenAfiliacion, eps, aseguradora, numeroAfiliacion
- `contactoEmergencia: { nombre, relacion, telefono }`
- `acudiente: { nombre, parentesco, telefono }`
- `zonasDolor: string[]` (default []) — mapa corporal del onboarding
- `resumenIA: { texto, actualizadoEn, motivoActualizacion (cita_completada|formula_creada|formula_actualizada|manual|inicial), citaIdReferencia, version }`
- `firstAppointment: boolean` (default false) — false = nunca agendó, true = ya agendó primera cita
- `activo: boolean` (default true)

**Administrativo.ts** / **PersonalInstitucional.ts**

### Citas y consulta

**Cita.ts**
- pacienteId, medicoId, fecha, hora (required)
- `tipo`: preconsulta | consulta | control
- `modalidad`: presencial | virtual
- `estado`: pendiente | confirmada | en_espera | en_consulta | cancelada | completada
- meetingId (AWS Chime), grabacionUrl (S3)
- horaLlegada, notifRecordatorio24hAt, notifRecordatorio2hAt
- creadoPor/actualizadoPor/canceladoPor (con roles)
- `demora: { detectadaEn, minutosDemora, motivo, registradoPor }`
- Índices: `{ medicoId, fecha }`, `{ pacienteId, fecha }`, `{ medicoId, estado, fecha }`

**HistoriaClinica.ts**
- pacienteId, medicoId, citaId (unique), historiaClinicaId
- fechaRegistro, tipoActividad
- datos del paciente: numeroIdentificacion, fechaNacimiento, genero, sexo, telefono, email, dirección, ciudad, departamento
- acompañante: nombre, parentesco, telefono
- motivoConsulta, motivoAtencion, enfermedadActual
- `sistemas[]`, `antecedentes[]`, familiares, psicosociales, `ginecoobstetricos[]`
- estadoDeConciencia, equiposSignos
- `signosVitales: { TA, FC, FR, temperatura, peso, talla, imc, saturacionOxigeno }`
- `examenMedico: { cabeza, cuello, torax, abdomen, extremidades, neurologico, otros }`
- `diagnosticos[]`, resultadosParaclinicos, alertas, alergias
- analisisyplan, recomendaciones
- `iaRecomendacionesPaciente: { texto, generadoEn }`
- `iaResumenCita: { texto, generadoEn }`
- `analisisFisiologicoIA[]: { sistema, nivel (optimo|moderado|critico), puntuacion, hallazgos }`
- creadoPor, actualizadoPor, `activo` (soft delete)

**HistoriaClinicaHeridas.ts** — 14 secciones especializadas en heridas:
1. Identificación (override)
2. Motivo consulta
3. Enfermedad actual
4. Antecedentes (patológicos, quirúrgicos, traumáticos, alérgicos, farmacológicos, tabaco, alcohol, familiares)
5. Riesgo de cicatrización (nutricional, cardiovascular, vascular, metabólico)
6. Examen físico general (signos vitales, estado general)
7. Valoración especializada de herida (diagnóstico, localización anatómica, tiempo evolución, número de heridas)
8. Caracterización (medidas, bordes, composición lecho %, exudado, olor, dolor EVA, signos infección, piel perilesional)
9. Clasificaciones especializadas (Wagner, PEDIS, PUSH, EVA, ITB, estadio úlcera presión, CEAP venosa, Rutherford arterial)
10. Registro fotográfico (foto inicial, consentimiento, código foto, URLs)
11. Plan de manejo (limpieza, desbridamiento, apósitos, descarga, compresión, antibióticos, remisiones, paraclínicos, seguimiento)
12. Educación al paciente
13. Seguimiento evolutivo (próximo control, indicaciones, días incapacidad, documentos portal)
14. Escalas aplicadas (Wagner, PEDIS, PUSH, ITB, EVA, Braden, Norton, CEAP, MNA)

**FormulaMedica.ts**
- pacienteId, medicoId, citaId (unique), historiaClinicaId
- `medicamentos[]: { denominacionComun, concentracion, unidadMedida, formaFarmaceutica, dosis, viaAdministracion, frecuencia, diasTratamiento, cantidadNumeros, cantidadLetras, indicaciones, fechaInicio, horaInicio, recordatorios[] }`
- `diagnosticos[]`
- pdfUrl
- `ordenAlivia: { json, estado (pendiente_envio|enviado|pagado|cancelado), linkCarrito, fechaEnvio }`
- creadoPor, actualizadoPor

**ExamenMedico.ts** — Órdenes de laboratorio
- `examenes[]: { codigoCups, descripcionCups, cantidad, observacion }`
- `estado`: pendiente | procesado | cancelado
- pdfUrl

**AyudaDiagnostica.ts** — Órdenes de ayudas diagnósticas
- `ayudasDiagnosticas[]: { codigoCups, descripcionCups, cantidad, observacion }`

**ApoyoTerapeutico.ts**
- `servicioQueSolicita`
- `serviciosRemitidos[]: { codigoCups, descripcionCups, servicio, motivo }`
- `estado`: pendiente | atendida | cancelada

**Interconsulta.ts** — similar a ApoyoTerapeutico

**Incapacidad.ts**
- lugarExpedicion, fechaExpedicion, esProrroga
- fechaInicial, dias, fechaFinal (validado: fechaFinal >= fechaInicial)
- `diagnosticoPrincipal: { codigo, descripcion }`
- observaciones

**Asesoria.ts**
- pacienteId, tema, descripcion
- `estado`: pendiente | asignada | respondida
- medicoId, respuesta, fechaRespuesta

**Interrogatorio.ts**
- pacienteId, `tipo`: primera_vez | control
- `estado`: en_proceso | completado | pendiente, `progreso` (0–100)
- respuestas (mixed), observacionesIA[], analisisIA
- `analisisFisiologicoIA[]`, `objetivos[]`
- `recomendacionAutomatica: { semaforizacion, recomendacionesOTC, estiloVida, estrategiasFuncionales, llamadoAccion, generadoEn }`
- notasMedico

### Resultados y documentos

**Paraclinico.ts**
- pacienteId, nombre, fecha
- `tipo`: pdf | imagen, tamañoBytes, urlArchivo
- notasPaciente, revisadoPorMedico
- `ocrTextoPlano`, `ocrValores[]: { nombre, valor, unidad, referencia }`
- `ocrEstado`: listo | error | omitido
- `ocrMetodo`: pdf-texto | vision
- `semaforo`: verde | amarillo | rojo, valorFuncional
- `tendencia`: mejorando | estable | empeorando, analisisIA

**ChatMessage.ts**
- citaId, fromUserId, fromRole (MEDICO|PACIENTE)
- text (max 4000), attachmentUrl, attachmentType, readAt

**TranscriptionSession.ts** / **TranscriptionSegment.ts**
- medicoId, pacienteId, citaId
- `status`: active | closed, currentClinicalSection
- startedAt, endedAt, orden_consulta_ia y secciones clínicas

### Videollamada

**Meeting.ts** (AWS Chime)
- meetingId (unique), externalMeetingId, citaId
- meetingData (mixed), `status`: created | active | ended | expired
- pipelineId, recordingSinkArn, transcriptionEnabled, grabacionUrl, duracionMinutos
- `attendees[]` con joinedAt, isGuided

### Agenda y configuración

**ConfiguracionAgenda.ts**
- medico (unique ref)
- `sedes[]: { nombre, direccion, jornadas[] }`
- `jornadas[]: { dia (Lunes-Domingo), activa, bloquesHorarios[] }`
- `bloquesHorarios[]: { horaInicio, horaFin, modalidad (presencial|virtual|mixta), duracionConsulta, tiemposInactividad[] }`
- `notificacionesAgendamiento: { notificacionAutomaticaPaciente, recordatorio24Horas, recordatorio2Horas, notificacionMedico* }`
- `flujoPaciente: { activarAnalisisAutomatico, mostrarMedicamentos, recomendacionesOrigen, activarCodigosDescuento, tipoCodigosDescuento, activarDescuentoSiAgendaPronto, activarVideosTestimonios, activarChatDirectoMedico }`

**ReglaAgenda.ts** / **BoxConsultorio.ts** / **AsignacionBox.ts**

### Pagos y descuentos

**PagoSimulado.ts** / **PagoConsulta.ts**

**CodigoDescuento.ts**
- codigo (unique, uppercase), `tipo`: porcentaje | monto_fijo
- valor, medicoId, `origen`: referido | evento | webinar | medico | admin
- usos, maxUsos, expiresAt, activo

**LinkCaptacion.ts**
- codigo (unique, 8 chars), `tipo`: referido | evento | webinar | invitacion_paciente
- medicoReferidorId, pacienteQueInvitoId, descuentoAsociado (0-100%)
- `estado`: activo | usado | expirado, usadoPorMedicoId
- `creadoPor`: admin | sistema | medico

**ReferidoMedico.ts**
- medicoReferidorId, medicoReferidoId
- `estado`: pendiente | registrado | activo | bonificado
- montoBonus, fechaBonificacion, linkCaptacionId

### IA y personalización

**CuidadorIAConversacion.ts**
- pacienteId (unique index), `mensajes[]: { rol (paciente|cuidador), contenido, timestamp }`
- `contextoIntegrado: boolean`

**RepositorioIA.ts** / **EvaluacionAlimento.ts**

### Códigos médicos

**Cie10.ts** — diagnósticos ICD-10
**Cups2026.ts** — procedimientos CUPS 2026 (`codigo`, `nombre`, index `{ codigo }`)

### Materiales farmacéuticos

**Material.ts**
- codigo (unique, uppercase), nombre, marca, formaFarmaceutica, concentracion, unidadMedida, viaAdministracion, presentacion
- registroSanitario, categoria, descripcion, composicion
- `presentaciones[]: { nombre, mockup }`, mockups[], linksRotulos[], activo

### Otros

**Auditoria.ts** / **Codigo2FA.ts** / **ConfiguracionSeguridadPaciente.ts**
**DocumentoLegal.ts** / **EncuestaSatisfaccion.ts** / **AdherenciaToma.ts**
**ExternalSession.ts** / **RipsPaquete.ts** / **ParametroNutrabiotics.ts**
**Tercero.ts** / **RegistroIngresoSalida.ts**

---

## API — Endpoints completos

### Auth (`/api/auth`)

```
POST /register                   Doctor registration
POST /register-paciente          Patient registration
POST /login                      Email + password
POST /whatsapp/send-code         Enviar OTP WhatsApp
POST /whatsapp/verify            Verificar OTP → JWT
POST /2fa/enviar                 2FA por documento (pre-login, sin sesión)
POST /2fa/validar                Validar 2FA por documento → JWT
GET  /me                         Usuario actual
POST /whatsapp/send-code-2fa     Enviar código 2FA (paciente autenticado)
POST /whatsapp/verify-2fa        Verificar código 2FA (paciente autenticado)
```

**Respuesta login y register-paciente** — campos que devuelve `data.user`:
```json
{
  "_id", "email", "nombre", "apellido", "role",
  "fechaNacimiento", "telefono", "direccion",
  "genero",
  "habilitado2FA", "aceptaTerminos", "aceptaConsentimiento",
  "firstAppointment"
}
```

**Lógica de navegación post-login/registro (frontend):**
- `firstAppointment === false` → redirigir a `/agendamiento` (onboarding)
- `firstAppointment === true` → redirigir a `/home` (con sidebar)

**Normalización de género:** el backend acepta `"Masculino"`, `"MASCULINO"` o `"masculino"` — normaliza a minúscula automáticamente. Valores válidos: `masculino | femenino | no-binario | otro | prefiero-no-decir`.

### Médico (`/api/medico`) — authenticate + authorize(MEDICO)

```
/perfil                  Gestión perfil y configuraciones
/agendamiento            Agenda (vista médico)
/historia-clinica        Historia clínica (CRUD)
/historia-clinica-heridas Historia heridas (14 secciones)
/heridas-ia              Análisis IA heridas
/formula-medica          Fórmulas médicas + ALIVIA
/incapacidad             Certificados incapacidad
/interconsulta           Remisiones a especialistas
/examen-medico           Órdenes laboratorio
/apoyo-terapeutico       Apoyo terapéutico
/ayuda-diagnostica       Ayudas diagnósticas
/videocall               Videoconsulta (AWS Chime)
/transcription           Transcripción audio
/materiales              Medicamentos/materiales
/asesorias               Asesorías
/ia-simulada             IA simulada
/ia-entrenada            IA entrenada (Bedrock Agent)
/copiloto-voz            Copiloto de voz (WS)
/paraclinicos            Resultados paraclínicos
/mis-referidos           Mis referidos
/mi-link-referido        Link captación propio
/anamnesis               Anamnesis
/seguimiento             Seguimiento
/google-calendar         Sync Google Calendar
/metricas                Métricas y analytics
/pago                    Pagos
/consulta                Notas de consulta
/chat                    Chat médico-paciente
/cie10                   Búsqueda CIE-10
```

### Paciente (`/api/paciente`) — authenticate + authorize(PACIENTE)

```
/perfil                  Gestión perfil (GET + PUT)
/agendamiento            Agendar citas
/interrogatorio          Cuestionario de salud
/documentos              Gestión documentos
/asesorias               Asesorías
/paraclinicos            Subir resultados laboratorio
/formula-medica          Ver fórmulas
/pago                    Pagos
/orden-examenes          Solicitar exámenes
/alimentos               Evaluación alimentos
/recomendacion           Recomendaciones IA
/codigo-descuento        Aplicar códigos descuento
/cuidador-ia             Chat con IA cuidadora
/invitar-medico          Invitar médico
/historia-clinica        Ver historia clínica
/tratamiento             Seguimiento tratamiento
/transcription           Transcripción
/chat                    Chat
/wearables               Wearables
GET  /heridas-cita/:citaId/info     Info cita heridas
GET  /heridas-cita/:citaId/meeting  Meeting cita heridas
```

### Administrativo (`/api/administrativo`)

```
/terceros                Terceros / facturación
/ingreso                 Ingreso/salida (check-in)
/agenda                  Gestión agenda
/vision-estadisticas     Estadísticas
/rips                    Reportes RIPS
/experiencia-usuarios    Encuestas satisfacción
/visita-paciente         Visitas paciente
GET  /demoras/activas    Demoras activas
POST /demoras/:citaId/registrar Registrar demora
GET  /demoras/reporte    Reporte demoras
```

### Admin (`/api/admin`)

```
GET  /cups2026/search                     Búsqueda CUPS
GET  /parametros-nutrabiotics/search      Búsqueda Nutrabiotics
POST /codigos-descuento                   Crear código
GET  /codigos-descuento                   Listar códigos
PUT  /codigos-descuento/:id               Editar código
DELETE /codigos-descuento/:id             Desactivar código
POST /links-captacion                     Crear link
GET  /links-captacion                     Listar links
DELETE /links-captacion/:id               Desactivar link
GET  /referidos                           Listar referidos
POST /referidos/:id/bonificar             Bonificar referido
```

### External — Tools API (`/api/external/tools`) — phoneToken OTP

```
POST /auth/request-otp               Solicitar OTP
POST /auth/verify-otp                Verificar OTP → phoneToken
POST /auth/revoke                    Revocar token

GET  /tools/me                       Perfil usuario actual
GET  /tools/me/citas                 Mis citas
GET  /tools/me/citas/proxima         Próxima cita
GET  /tools/me/tratamiento           Mi tratamiento
GET  /tools/me/historia              Mi historia clínica
POST /tools/me/agendar               Agendar cita
POST /tools/me/cancelar              Cancelar cita
PUT  /tools/me/citas/:citaId/reagendar   Reagendar cita
GET  /tools/me/agenda                Agenda (si es médico)
GET  /tools/medico/:pacienteId/ficha Ficha paciente (médico)
GET  /tools/especialidades           Especialidades
GET  /tools/medicos                  Médicos disponibles
GET  /tools/medicos/:medicoId/disponibilidad Disponibilidad
POST /tools/me/conversacion          Guardar conversación WhatsApp
GET  /tools/me/conversacion          Obtener conversación
GET  /tools/me/resumen               Resumen paciente (Crisal·IA)
POST /tools/me/resumen/refresh       Refrescar resumen
```

### External — Admin Data API (`/api/external`) — EXTERNAL_API_TOKEN

```
GET /pacientes                       Todos los pacientes
GET /pacientes/:id                   Detalle paciente
GET /medicos                         Todos los médicos
GET /medicos/:id                     Detalle médico
GET /medicos/:medicoId/disponibilidad Disponibilidad médico
GET /medicos/:medicoId/estadisticas-citas Estadísticas citas
GET /medicos/:medicoId/cantidad-citas Cantidad citas
GET /citas                           Todas las citas
GET /citas/:id                       Detalle cita
GET /citas/medico/:medicoId          Citas del médico
GET /citas/paciente/:pacienteId      Citas del paciente
GET /historias-clinicas              Todas las historias
GET /historias-clinicas/:id          Detalle historia
GET /historias-clinicas/paciente/:pacienteId/ultima  Última historia
GET /historias-clinicas/paciente/:pacienteId         Historias paciente
GET /historias-clinicas/medico/:medicoId             Historias médico
GET /historias-clinicas/cita/:citaId                 Historia por cita
GET /formulas-medicas                Todas las fórmulas
GET /formulas-medicas/:id            Detalle fórmula
GET /formulas-medicas/paciente/:pacienteId   Fórmulas paciente
GET /formulas-medicas/cita/:citaId           Fórmula por cita
GET /interrogatorios/paciente/:pacienteId    Interrogatorios paciente
GET /interrogatorios/:id             Detalle interrogatorio
GET /medicamentos-nutrabiotic        Búsqueda Nutrabiotics (?q=text)
GET /medicamentos-nutrabiotic/all    Listado paginado
GET /medicamentos-nutrabiotic/:id    Detalle Nutrabiotics
POST /alivia/webhook                 Webhook compra ALIVIA
```

### Public (`/api/public`)

```
GET  /registro-medico/:codigo    Validar código registro médico
GET  /hc-publica/:token          Ver historia pública (QR-based, 48h)
POST /documentos-legales         Acceder documentos legales
POST /encuesta                   Enviar encuesta satisfacción
```

### Médico — Agendamiento (`/api/medico/agendamiento`)

```
GET    /configuracion                    Obtener config agenda (crea por defecto si no existe)
POST   /configuracion                    Crear configuración
PUT    /configuracion                    Actualizar configuración
GET    /citas                            Citas del médico (?fechaInicio=&fechaFin=)
GET    /citas/hoy                        Citas de hoy
PUT    /citas/:citaId/confirmar          Confirmar cita + notifica WhatsApp paciente
PUT    /citas/:citaId/cancelar           Cancelar cita (requiere motivoCancelacion en body)
PUT    /citas/:citaId/completar          Completar cita + regenera resumenIA del paciente
POST   /citas/:citaId/resumen-pdf        Generar PDF resumen (historia+fórmula+incapacidad+interconsulta) → S3
GET    /citas/:citaId/recording-url      URL firmada grabación videoconsulta
GET    /citas/:citaId/preconsulta        Análisis preconsulta IA (resumen interrogatorio)
```

### Perfil paciente — editar (`/api/paciente/perfil`)

```
GET  /perfil    Obtener perfil completo + configuracionSeguridad
PUT  /perfil    Actualizar perfil (campos sueltos, no requiere todo el objeto)
```

Campos editables vía `PUT /perfil`:
- Datos personales: nombre, apellido, tipoDocumento, numeroDocumento, fechaNacimiento, sexoBiologico, genero, estadoCivil, nacionalidad, lugarResidencia, direccion, telefono
- Salud: grupoSanguineo, rh, escolaridad, ocupacion, condicionDesplazamiento, grupoEtnico
- Afiliación: regimenAfiliacion, eps, aseguradora, numeroAfiliacion
- Contacto: contactoEmergencia `{ nombre, relacion, telefono }`
- Onboarding: `firstAppointment: boolean`
- Seguridad: autenticacionDosFactores, recordarDispositivo, autenticacionBiometrica, tipoBiometrico, visualizarContrasena, metodoNotificacion, aceptaTerminos, aceptaConsentimiento

**Regla importante:** mandar solo el campo que cambia, NO todo el objeto.

### Otros endpoints en `src/index.ts`

```
GET /api/docs.json     Swagger JSON spec
GET /api/docs          Swagger UI
GET /api/health        Health check
GET /                  Landing page HTML (Crisalia API status)
```

---

## Middleware

| Archivo | Función | Uso |
|---|---|---|
| `auth.ts` | `authenticate` + `authorize(...roles)` | JWT desde `Authorization: Bearer <token>` |
| `checkSuscripcion.ts` | `checkSuscripcion` + `incrementarPacientesPlanPrueba` | Suscripción activa o trial con cupo |
| `externalAuth.ts` | `authenticateExternal` | Token estático `EXTERNAL_API_TOKEN` |
| `externalPhoneAuth.ts` | `requirePhoneToken` | OTP phone-based flow |
| `requirePago.ts` | `requireCuota1` | Cuota de pago completada |

Cadena estándar de rutas:
```typescript
router.post('/', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, controller);
```

---

## Utilities

**`errors.ts`**
```typescript
throw new AppError('Mensaje', 404);
// En catch:
handleError(err, res); // AppError → statusCode, Error genérico → 500
```

**`jwt.ts`**
```typescript
generateToken(userId, role): string   // 7d por defecto
verifyToken(token): { userId, role }
```

**`pdfGenerator.ts`** — 845 líneas, 8 generadores:
- `generateHistoriaPdf(historia)` — con QR
- `generateFormulaPdf(formula)`
- `generateIncapacidadPdf(incapacidad)`
- `generateInterconsultaPdf(interconsulta)`
- `generateExamenMedicoPdf(examen)`
- `generateAyudaDiagnosticaPdf(ayuda)`
- `generateApoyoTerapeuticoPdf(apoyo)`
- `generateCitaResumenPdf(payload)` — resumen completo de consulta

**`s3Documents.ts`** — upload/download S3, presigned URLs
**`auditoriaHelper.ts`** — `registrarAccion(req, accion, modelo, id, anterior?, nuevo?)`
**`citaFechaHora.ts`** / **`dateFormatter.ts`** / **`excelReader.ts`**

---

## Servicios (40+)

### IA
- `ai/AIService.ts` — Core IA integration
- `ai/bedrock.service.ts` — AWS Bedrock
- `ai/bedrockHeridas.service.ts` — Bedrock para heridas
- `ai/bedrockTextService.ts` — Generación texto
- `ai/crisaliaAgentService.ts` — Agente Crisal·IA
- `openai/openaiService.ts` — OpenAI wrapper
- `nutricion/alimentoEvaluacionBedrockService.ts`
- `nutricion/alimentoEvaluacionSimuladaService.ts`
- `paraclinicos/paraclinicoOcrService.ts` — OCR (pdf-texto + vision)

### Clínico
- `medico/historiaClinica/historiaClinicaService.ts`
- `medico/formulaMedica/formulaMedicaService.ts`
- `medico/examenMedico/examenMedicoService.ts`
- `medico/incapacidad/incapacidadService.ts`
- `medico/interconsulta/interconsultaService.ts`
- `medico/ayudaDiagnostica/ayudaDiagnosticaService.ts`
- `medico/apoyoTerapeutico/apoyoTerapeuticoService.ts`
- `medico/perfil/perfilService.ts`

### Agenda
- `medico/agendamiento/agendamientoService.ts`
- `paciente/agendamiento/agendamientoService.ts`
- `paciente/agendamiento/salaEsperaService.ts`

### Copiloto de voz (WS)
- `medico/copiloto-voz/copilotoVozService.ts`
- `medico/copiloto-voz/copilotoVozRealtimeEngine.ts`
- `medico/copiloto-voz/queryQueue.ts`

### Transcripción
- `transcription/streaming/transcribeStreamingService.ts`
- `transcription/streaming/audioStreamQueue.ts`

### Paciente
- `paciente/historiaClinica/pacienteHistoriaClinicaService.ts`
- `paciente/interrogatorio/interrogatorioService.ts`
- `paciente/tratamiento/pacienteTratamientoService.ts`
- `paciente/resumenPacienteService.ts`

### Notificaciones
- `notifications/medicoNotificacionService.ts`
- `notifications/citaWhatsAppNotifier.ts`
- `whatsapp/whatsappService.ts`

### Otros
- `auth/authService.ts`
- `chat/chatService.ts`
- `cie10/cie10Service.ts`
- `ripsGeneratorService.ts`
- `auditoria/auditoriaService.ts`
- `external/phoneAuthService.ts`
- `jobs/controlPreCitaJob.ts` (deshabilitado en prod)

---

## WebSockets

**`src/ws/registerWebSockets.ts`** — único listener `upgrade` enruta por pathname:

| Endpoint | Handler | Uso |
|---|---|---|
| `/api/transcription-ws` | `transcriptionHandlers` | PCM 16-bit 16kHz mono → AWS Transcribe |
| `/api/medico/copiloto-voz-ws` | `copilotoVozHandlers` | STT → Bedrock/OpenAI → ElevenLabs TTS |
| `/api/chat-ws` | `chatHandlers` | Chat médico-paciente |

Configuración: `noServer: true` + `perMessageDeflate: false`

**Protocolo transcripción:**
```
Cliente → Servidor:
  JSON: { type: 'start', citaId, medicoId, pacienteId, speakerRole? }
  Binary: PCM chunks
  JSON: { type: 'set_section', section }
  JSON: { type: 'close' }

Servidor → Cliente:
  { transcript, isPartial }
  { session_started: true }
  { error: string }
```

---

## Convenciones de código

| Artefacto | Convención | Ejemplo |
|---|---|---|
| Controller files | camelCase | `historiaClinicaController.ts` |
| Model files | PascalCase | `HistoriaClinica.ts` |
| Service files | camelCase | `historiaClinicaService.ts` |
| Interfaces | `I` + PascalCase | `IHistoriaClinica` |
| Clases | PascalCase | `HistoriaClinicaService` |
| Funciones async | verbo + sustantivo | `crearHistoriaClinica()` |
| Rutas HTTP | kebab-case | `/api/medico/historia-clinica` |
| Campos BD | camelCase | `pacienteId`, `fechaRegistro` |
| Enums | UPPER_CASE | `UserRole.MEDICO` |

### Patrón controller
```typescript
export const crearHistoriaClinica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId; // Siempre del middleware, nunca del body
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }
    const resultado = await historiaClinicaService.crearHistoriaClinica({...});
    await registrarAccion(req, 'crear', 'HistoriaClinica', resultado._id.toString());
    res.status(201).json({ success: true, data: resultado });
  } catch (err: any) {
    handleError(err, res);
  }
};
```

### Patrón service (singleton)
```typescript
class HistoriaClinicaService {
  async crearHistoriaClinica(data: Partial<IHistoriaClinica>) {
    return await HistoriaClinica.create(data);
  }
  async obtenerPorId(id: string) {
    return await HistoriaClinica.findById(id).lean(); // .lean() en consultas de solo lectura
  }
}
export default new HistoriaClinicaService();
```

### Patrones BD
```typescript
// Soft delete (nunca borrar documentos)
await Cita.findOneAndUpdate({ _id: id, medicoId }, { $set: { activo: false } });
await Cita.find({ medicoId, activo: { $ne: false } });

// Seguridad a nivel de fila (siempre filtrar por medicoId/pacienteId del token)
const cita = await Cita.findOne({ _id: req.params.id, medicoId: req.userId });

// .lean() en consultas de solo lectura
const historias = await HistoriaClinica.find({ pacienteId }).lean();

// Promise.all() para consultas paralelas
const [cita, paciente] = await Promise.all([Cita.findById(citaId), Paciente.findById(pacienteId)]);
```

### Formato respuestas HTTP
```typescript
res.status(200).json({ success: true, data: resultado });
res.status(201).json({ success: true, message: 'Creado', data: resultado });
res.status(404).json({ message: 'No encontrado', status: 'error' });
res.status(400).json({ success: false, message: 'Error de validación', errors: errors.array() });
res.status(401).json({ success: false, message: '...' });
res.status(403).json({ success: false, message: '...' });
```

---

## Seguridad

- **Rate limiting global:** 200 req / 15 min por IP
- **Rate limiting auth:** 20 req / 15 min por IP
- **CORS orígenes:**
  - `https://nutrabiotics.mozartai.com.co`
  - `https://app.nutrabiotics.mozartia.com`
  - `http://localhost:5173`
- **Helmet:** `crossOriginResourcePolicy: { policy: 'cross-origin' }` (imágenes S3)

---

## Auditoría

Toda escritura debe llamar `registrarAccion()`:
```typescript
import { registrarAccion } from '../../utils/auditoriaHelper';
await registrarAccion(req, 'crear' | 'actualizar' | 'eliminar', 'NombreModelo', id, anterior?, nuevo?);
```

Campos de auditoría en modelos: `creadoPor`, `creadoPorRol`, `actualizadoPor`, `actualizadoPorRol`, `canceladoPor`, `canceladoPorRol`.

---

## Variables de entorno

```env
# Core
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=7d
NODE_ENV=development|production
PORT=5000

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

# AI
OPENAI_API_KEY=
ELEVENLABS_API_KEY=

# API Externa
EXTERNAL_API_TOKEN=

# PDFs / Frontend
PDF_LOGO_URL=
CRISALIA_PDF_LOGO_URL=
FRONTEND_URL=http://localhost:5173

# Dev bypass
BYPASS_SUSCRIPCION=true
```

---

## Comandos

```bash
npm run dev           # HTTP + WS desarrollo (nodemon + ts-node)
npm run dev:ws        # Solo WS
npm run build         # Compilar TS → dist/ (incluye swagger gen)
npm run start         # Producción HTTP
npm run start:ws      # Producción WS

# Scripts de datos (una vez)
npm run create-test-medico
npm run create-initial-users
npm run load-cups2026
npm run load-cie10
```

---

## Flujo para agregar un endpoint

1. **Model** `src/models/NuevoModelo.ts` — interface `INuevoModelo extends Document` + schema
2. **Registrar** en `src/index.ts` — `import './models/NuevoModelo'`
3. **Service** `src/services/{rol}/nuevoModeloService.ts` — clase + `export default new Clase()`
4. **Controller** `src/controllers/{rol}/nuevoModeloController.ts` — funciones `async (req: AuthRequest, res: Response): Promise<void>`
5. **Route** `src/routes/{rol}/nuevoModelo.ts` — `authenticate + authorize(rol) + controller`
6. **Montar** en `src/routes/{rol}/index.ts` — `router.use('/nuevo-modelo', nuevoModeloRoutes)`

---

## Dependencias principales

```json
"express": "^5.1.0",
"mongoose": "^8.9.0",
"typescript": "^5.9.3",
"bcryptjs": "^3.0.3",
"jsonwebtoken": "^9.0.2",
"helmet": "^8.1.0",
"cors": "^2.8.5",
"express-rate-limit": "^8.5.1",
"express-validator": "^7.3.1",
"@aws-sdk/client-bedrock-agent-runtime": "^3.1017.0",
"@aws-sdk/client-bedrock-runtime": "^3.1051.0",
"@aws-sdk/client-chime-sdk-meetings": "^3.0.0",
"@aws-sdk/client-s3": "^3.0.0",
"@aws-sdk/client-transcribe-streaming": "^3.986.0",
"@elevenlabs/elevenlabs-js": "^2.43.0",
"openai": "^6.15.0",
"pdfkit": "^0.15.0",
"qrcode": "^1.5.4",
"googleapis": "^171.4.0",
"ws": "^8.19.0",
"swagger-jsdoc": "^6.3.0",
"multer": "^2.1.1"
```

---

## Integraciones externas

| Servicio | Uso | Config |
|---|---|---|
| AWS Bedrock | Agentes IA clínicos | `src/config/awsConfig.ts` |
| AWS Chime | Videollamadas | `src/config/awsConfig.ts` |
| AWS Transcribe | Transcripción en tiempo real | WS handler |
| AWS S3 | PDFs / archivos | `src/utils/s3Documents.ts` |
| OpenAI | NLP / análisis clínico | `src/services/openai/` |
| ElevenLabs | TTS copiloto de voz | `src/config/copilotoVozConfig.ts` |
| Google Calendar | Agendamiento | `src/controllers/medico/googleCalendarController.ts` |
| ALIVIA | Fórmulas → farmacia (webhook) | `src/controllers/external/aliviaWebhookController.ts` |
| WhatsApp | Notificaciones + 2FA | `src/services/whatsapp/` |
| Nutrabiotics | Base de datos productos | `ParametroNutrabiotics` model |
