# CrisaliaBack — Guía para Claude Code

Plataforma de salud SaaS para Nutrabiotics. Backend Express + TypeScript + MongoDB con integraciones de AWS y AI.

---

## Arquitectura de despliegue

El backend se divide en **dos servidores** porque Vercel no soporta WebSockets:

| Servidor | Entry point | Plataforma | Puerto |
|---|---|---|---|
| API REST | `src/server.ts` → `src/index.ts` | Vercel | 5000 |
| WebSocket | `src/server-ws.ts` | Railway | 5001 |

`src/index.ts` exporta la app Express (sin `listen`). Ambos servidores la importan.

```
src/
├── index.ts          # App Express: middleware, modelos, rutas — no llama .listen()
├── server.ts         # HTTP + WS en un solo puerto (dev / Vercel)
└── server-ws.ts      # Solo WS (Railway production)
```

---

## Stack técnico

- **Runtime**: Node.js + TypeScript compilado a CommonJS (`"module": "commonjs"`)
- **Framework**: Express 5
- **Base de datos**: MongoDB + Mongoose 8
- **Auth**: JWT (7 días por defecto, configurable con `JWT_EXPIRES_IN`)
- **Seguridad**: Helmet, express-rate-limit, bcryptjs
- **AI/LLM**: OpenAI, AWS Bedrock, ElevenLabs
- **Cloud**: AWS S3, Chime (video), Transcribe (transcripción en vivo)
- **Real-time**: WebSockets (`ws`, `noServer: true`)
- **Validación**: express-validator
- **Notificaciones**: WhatsApp + Email

---

## Módulos del sistema y roles

Tres roles principales con sus propios controladores, servicios y rutas:

```
MEDICO       → src/controllers/medico/      src/routes/medico/
PACIENTE     → src/controllers/paciente/    src/routes/paciente/
ADMINISTRATIVO → src/controllers/administrativo/  src/routes/administrativo/
AUTH         → src/controllers/auth/        src/routes/auth/
ADMIN        → src/controllers/admin/       src/routes/admin/
EXTERNAL     → src/controllers/external/    src/routes/external/   (solo lectura, token)
PUBLIC       → (montado directo en index.ts, sin auth)
```

Enums de rol en `src/types/index.ts`:
```typescript
export enum UserRole {
  MEDICO = 'medico',
  PACIENTE = 'paciente',
  ADMINISTRATIVO = 'administrativo'
}
```

---

## Estructura de carpetas

```
src/
├── config/
│   ├── awsConfig.ts          # Clientes AWS (Chime, Bedrock, S3)
│   ├── copilotoVozConfig.ts
│   └── database.ts           # connectDB() con MONGODB_URI
├── controllers/
│   ├── admin/
│   ├── administrativo/
│   ├── auth/
│   ├── captacion/
│   ├── external/
│   ├── medico/               # ~40 módulos (historia clínica, fórmulas, videocall, etc.)
│   └── paciente/             # ~15 módulos
├── middleware/
│   ├── auth.ts               # authenticate + authorize()
│   ├── checkSuscripcion.ts   # Límites de plan
│   ├── externalAuth.ts       # Token para API externa
│   ├── externalPhoneAuth.ts
│   └── requirePago.ts
├── models/                   # 50 esquemas Mongoose (PascalCase)
├── routes/
│   ├── medico/index.ts       # Monta sub-routers de cada feature
│   ├── paciente/
│   ├── administrativo/
│   ├── auth/
│   ├── admin/
│   ├── external/             # README.md documenta la API externa
│   └── public/
├── services/                 # Lógica de negocio, separada de controladores
│   ├── ai/
│   ├── auditoria/
│   ├── auth/
│   ├── chat/
│   ├── cie10/
│   ├── medico/
│   ├── notifications/
│   ├── nutricion/
│   ├── openai/
│   ├── paciente/
│   ├── paraclinicos/
│   ├── transcription/
│   ├── whatsapp/
│   └── ripsGeneratorService.ts
├── types/
│   └── index.ts              # Enums (UserRole) + interfaces principales
├── utils/
│   ├── errors.ts             # AppError + handleError()
│   ├── jwt.ts                # generateToken() + verifyToken()
│   ├── auditoriaHelper.ts    # registrarAccion(), obtenerIp(), obtenerUserAgent()
│   ├── s3Documents.ts        # buildCitaDocumentKey(), uploadPDFAndGetUrl()
│   └── pdfGenerator.ts
└── ws/
    ├── registerWebSockets.ts  # Enrutador de upgrade a WSS por pathname
    ├── transcriptionHandlers.ts
    ├── copilotoVozHandlers.ts
    └── chatHandlers.ts
```

---

## Convenciones de nomenclatura

| Artefacto | Convención | Ejemplo |
|---|---|---|
| Archivos de controller | camelCase | `historiaClinicaController.ts` |
| Archivos de model | PascalCase | `HistoriaClinica.ts` |
| Archivos de service | camelCase | `historiaClinicaService.ts` |
| Interfaces | `I` + PascalCase | `IHistoriaClinica`, `ICita` |
| Clases | PascalCase | `HistoriaClinicaService` |
| Funciones async | camelCase verbo + sustantivo | `crearHistoriaClinica()` |
| Rutas HTTP | kebab-case | `/api/medico/historia-clinica` |
| Campos de BD | camelCase | `pacienteId`, `fechaRegistro` |
| Valores de enum | UPPER\_CASE | `UserRole.MEDICO` |

---

## Patrones de código

### Controller — estructura estándar

```typescript
// Importa AuthRequest (extiende Request con userId y userRole)
import { AuthRequest } from '../../middleware/auth';

export const crearHistoriaClinica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId; // Siempre desde auth middleware, nunca desde body
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    // Llamada al service — controladores no tocan Mongoose directamente
    const resultado = await historiaClinicaService.crearHistoriaClinica({...});

    // Audit log obligatorio en operaciones de escritura
    await registrarAccion(req, 'crear', 'HistoriaClinica', resultado._id.toString());

    res.status(201).json({ success: true, data: resultado });
  } catch (err: any) {
    handleError(err, res); // Siempre handleError, nunca res.status(500) manual
  }
};
```

### Service — singleton exportado

```typescript
class HistoriaClinicaService {
  async crearHistoriaClinica(data: Partial<IHistoriaClinica>): Promise<IHistoriaClinica> {
    return await HistoriaClinica.create(data);
  }

  async obtenerPorId(id: string): Promise<IHistoriaClinica | null> {
    return await HistoriaClinica.findById(id).lean(); // .lean() en consultas de solo lectura
  }
}

export default new HistoriaClinicaService(); // Singleton
```

### Model — interface + schema

```typescript
export interface ICita extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  estado: 'pendiente' | 'confirmada' | 'en_espera' | 'en_consulta' | 'cancelada' | 'completada';
  activo?: boolean;         // Soft delete
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CitaSchema = new Schema<ICita>({ ... }, { timestamps: true });
CitaSchema.index({ medicoId: 1, fecha: 1 });   // Índices explícitos en campos de query frecuente
export default mongoose.model<ICita>('Cita', CitaSchema);
```

### Ruta — middleware en cadena

```typescript
// Patrón: authenticate → authorize(rol) → [checkSuscripcion] → controller
router.post('/', authenticate, authorize(UserRole.MEDICO), checkSuscripcion, crearHistoriaClinica);
router.get('/:id', authenticate, authorize(UserRole.MEDICO), obtenerHistoriaClinica);

// API externa: middleware distinto
router.get('/pacientes', externalAuth, getPacientes);
```

### Sub-routers del médico (`src/routes/medico/index.ts`)

```typescript
router.use('/historia-clinica', historiaClinicaRoutes);
router.use('/formula-medica', formulaMedicaRoutes);
router.use('/consulta', consultaRoutes);
// ... ~40 sub-routers más
```

---

## Formato de respuestas HTTP

```typescript
// Éxito
res.status(200).json({ success: true, data: resultado });
res.status(201).json({ success: true, message: 'Creado', data: resultado });

// Error operacional (AppError)
res.status(404).json({ message: 'No encontrado', status: 'error' });

// Error de validación
res.status(400).json({ success: false, message: 'Error de validación', errors: errors.array() });

// Sin autorización
res.status(401).json({ success: false, message: '...' });
res.status(403).json({ success: false, message: '...' });
```

---

## Manejo de errores

**`src/utils/errors.ts`** — dos exports:

```typescript
// Lanzar errores operacionales conocidos
throw new AppError('Historia no encontrada', 404);

// En el catch de cada controller
} catch (err: any) {
  handleError(err, res);
  // → AppError: usa err.statusCode + err.message
  // → Error genérico: 500 + 'Error interno del servidor'
}
```

Nunca hacer `res.status(500).json({...})` directamente — siempre `handleError`.

---

## Middleware de autenticación

**`src/middleware/auth.ts`**

```typescript
// AuthRequest — tipo que usan todos los controllers
interface AuthRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

// Aplica ambos en cadena:
router.post('/', authenticate, authorize(UserRole.MEDICO), controller);
```

`authenticate` extrae el JWT del header `Authorization: Bearer <token>`.  
`authorize(...roles)` verifica que `req.userRole` esté en la lista permitida.

**`src/middleware/checkSuscripcion.ts`** — aplicar solo en rutas de médico que consuman límites del plan (historia clínica, consultas). Tiene bypass con `BYPASS_SUSCRIPCION=true` (solo en no-production).

---

## Patrones de base de datos

### Soft delete — nunca borrar documentos

```typescript
// Borrar → marcar activo: false
await Cita.findOneAndUpdate({ _id: id, medicoId }, { $set: { activo: false } });

// Consultar → excluir inactivos
await Cita.find({ medicoId, activo: { $ne: false } });
```

### Seguridad a nivel de fila

```typescript
// Siempre filtrar por medicoId/pacienteId del token, nunca confiar solo en el :id de la URL
const cita = await Cita.findOne({ _id: req.params.id, medicoId: req.userId });
if (!cita) {
  res.status(404).json({ message: 'No encontrado' });
  return;
}
```

### Rendimiento

```typescript
// .lean() en consultas de solo lectura (retorna POJO, más rápido)
const historias = await HistoriaClinica.find({ pacienteId }).lean();

// Promise.all() para consultas paralelas independientes
const [cita, paciente] = await Promise.all([
  Cita.findById(citaId),
  Paciente.findById(pacienteId)
]);
```

### Referencias polimórficas

Algunos modelos usan `refPath` para referenciar distintos tipos de usuario según un campo de rol.

### Registro de modelos

Todos los modelos se importan en `src/index.ts` antes de montar las rutas para que Mongoose los registre.

---

## Auditoría

Toda operación de escritura debe llamar `registrarAccion()`:

```typescript
import { registrarAccion } from '../../utils/auditoriaHelper';

await registrarAccion(req, 'crear' | 'actualizar' | 'eliminar', 'NombreModelo', documento._id.toString(), valorAnterior?, valorNuevo?);
```

Los modelos incluyen campos de auditoría: `creadoPor`, `creadoPorRol`, `actualizadoPor`, `actualizadoPorRol`, `canceladoPor`, `canceladoPorRol`.

---

## WebSockets

**`src/ws/registerWebSockets.ts`** — un único listener `upgrade` enruta por pathname:

| Endpoint | Handler | Uso |
|---|---|---|
| `/api/transcription-ws` | `transcriptionHandlers` | Transcripción de audio en tiempo real |
| `/api/medico/copiloto-voz-ws` | `copilotoVozHandlers` | Copiloto de voz con AI |
| `/api/chat-ws` | `chatHandlers` | Chat médico-paciente |

Configuración: `noServer: true` + `perMessageDeflate: false` (requerido detrás de Railway/proxies).

**Protocolo de transcripción:**
```
Cliente → Servidor:
  JSON: { type: 'start', citaId, medicoId, pacienteId, speakerRole? }
  Binary: PCM 16-bit 16kHz mono (chunks de audio)
  JSON: { type: 'set_section', section }
  JSON: { type: 'close' }

Servidor → Cliente:
  { transcript, isPartial }
  { session_started: true }
  { error: string }
```

---

## Seguridad

**Rate limiting** (`src/index.ts`):
- Global API: 200 req / 15 min por IP
- Auth endpoints: 20 req / 15 min por IP

**CORS** — orígenes hardcodeados en `src/index.ts`:
- `https://nutrabiotics.mozartai.com.co`
- `https://app.nutrabiotics.mozartia.com`
- `http://localhost:5173`

Al agregar nuevos orígenes de frontend, modificar el array en `src/index.ts`.

**Helmet**: `crossOriginResourcePolicy: { policy: 'cross-origin' }` para permitir imágenes de S3.

---

## JWT

```typescript
// src/utils/jwt.ts
generateToken(userId: string, role: UserRole): string   // 7 días por defecto
verifyToken(token: string): { userId: string; role: UserRole }

// Caso especial — historia clínica pública:
// jwt.sign({ historiaId, tipo: 'hc-publica' }, secret, { expiresIn: '48h' })
```

---

## Variables de entorno requeridas

```env
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES_IN=7d

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

# AI
OPENAI_API_KEY=
ELEVENLABS_API_KEY=

# API Externa
EXTERNAL_API_TOKEN=

# Bypass de suscripción (solo dev/staging)
BYPASS_SUSCRIPCION=true
NODE_ENV=development
```

---

## Comandos frecuentes

```bash
npm run dev          # Servidor HTTP + WS en desarrollo (nodemon + ts-node)
npm run dev:ws       # Solo servidor WebSocket
npm run build        # Compilar TypeScript → dist/
npm run start        # Producción HTTP (dist/server.js)
npm run start:ws     # Producción WS (dist/server-ws.js)

# Scripts de datos (ejecutar una vez)
npm run create-test-medico
npm run create-initial-users
npm run load-cups2026
npm run load-cie10
```

---

## API Externa (solo lectura)

Documentada en `src/routes/external/README.md`. Autenticación por Bearer token o header `X-External-Token`. No requiere JWT de usuario.

Endpoints disponibles: `/api/external/pacientes`, `/medicos`, `/citas`, `/historias-clinicas`, `/formulas-medicas`, `/interrogatorios`, `/cups2026`.

---

## Códigos médicos

- **CUPS 2026**: procedimientos (cargados con `npm run load-cups2026`)
- **CIE-10**: diagnósticos (cargados con `npm run load-cie10`)
- Ambos tienen endpoints de búsqueda en la API

---

## Integraciones externas

| Servicio | Uso | Configuración |
|---|---|---|
| AWS Bedrock | Agentes AI clínicos | `src/config/awsConfig.ts` |
| AWS Chime | Videollamadas | `src/config/awsConfig.ts` |
| AWS Transcribe | Transcripción en vivo | WS handler |
| AWS S3 | Almacenamiento de PDFs/archivos | `src/utils/s3Documents.ts` |
| OpenAI | NLP / análisis clínico | `src/services/openai/` |
| ElevenLabs | Síntesis de voz (copiloto) | `src/config/copilotoVozConfig.ts` |
| Google Calendar | Agendamiento | `src/controllers/medico/googleCalendarController.ts` |
| Alivia | Fórmulas médicas (farmacia) | `src/controllers/medico/formulaMedica/` |
| WhatsApp | Notificaciones y 2FA | `src/services/whatsapp/` |

---

## Flujo típico para agregar un endpoint nuevo

1. **Model** (`src/models/NuevoModelo.ts`) — interface `INuevoModelo extends Document` + schema + export
2. **Registrar** en `src/index.ts` — `import './models/NuevoModelo'`
3. **Service** (`src/services/{rol}/nuevoModelo/nuevoModeloService.ts`) — clase + `export default new Clase()`
4. **Controller** (`src/controllers/{rol}/nuevoModeloController.ts`) — funciones `async (req: AuthRequest, res: Response): Promise<void>` con `handleError` en catch
5. **Route** (`src/routes/{rol}/nuevoModelo.ts`) — `authenticate + authorize(rol) + controller`
6. **Montar** en `src/routes/{rol}/index.ts` — `router.use('/nuevo-modelo', nuevoModeloRoutes)`
