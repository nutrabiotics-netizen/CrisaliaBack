import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { connectDB } from "./config/database";

// En producción se usa el spec pre-generado en build time (compatible con Vercel serverless).
// En desarrollo se genera dinámicamente desde los JSDoc.
import fs from "fs";
import path from "path";

function loadSwaggerSpec(): object {
  const prebuilt = path.join(__dirname, "config/swagger-spec.json");
  if (fs.existsSync(prebuilt)) {
    return JSON.parse(fs.readFileSync(prebuilt, "utf-8"));
  }
  // Fallback: generación dinámica (solo funciona en dev con archivos .ts presentes)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./config/swagger").swaggerSpec;
}

const swaggerSpec = loadSwaggerSpec();

// Cargar variables de entorno
dotenv.config();

const app = express();

// ─── CORS (debe ir antes que rate limiting para que los preflights OPTIONS pasen) ─
app.use(
  cors({
    origin: [
      "https://nutrabiotics.mozartai.com.co",
      "https://app.nutrabiotics.mozartia.com",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Seguridad ────────────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://unpkg.com"],
      },
    },
  }),
);

// Rate limiting global: 200 req/15 min por IP en producción, 2000 en desarrollo
const limiterGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 2000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
  skip: (req) => {
    const p = req.path;
    return p.includes('/videocall/') || p.includes('/heridas') || p.includes('/heridas-ia');
  }
});
app.use("/api/", limiterGlobal);

// Rate limiting estricto para auth: 20 req/15 min
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiados intentos de autenticación. Intenta en 15 minutos.",
  },
});
app.use("/api/auth/", limiterAuth);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexión a la base de datos
connectDB();

// Importar modelos para asegurar que estén registrados antes de usar populate
import "./models/User";
import "./models/Medico";
import "./models/Paciente";
import "./models/Cita";
import "./models/Meeting";
import "./models/ConfiguracionAgenda";
import "./models/Auditoria";
import "./models/Interrogatorio";
import "./models/HistoriaClinica";
import "./models/Cups2026";
import "./models/Material";
import "./models/ExamenMedico";
import "./models/ApoyoTerapeutico";
import "./models/AyudaDiagnostica";
import "./models/TranscriptionSession";
import "./models/TranscriptionSegment";
import "./models/Asesoria";
import "./models/Tercero";
import "./models/PersonalInstitucional";
import "./models/RegistroIngresoSalida";
import "./models/CodigoDescuento";
import "./models/PagoSimulado";
import "./models/CuidadorIAConversacion";
import "./models/LinkCaptacion";
import "./models/ReferidoMedico";
import "./models/AdherenciaToma";
import "./models/Codigo2FA";
import "./models/EvaluacionAlimento";

// Rutas
import authRoutes from "./routes/auth/authRoutes";
import medicoRoutes from "./routes/medico";
import pacienteRoutes from "./routes/paciente";
import adminRoutes from "./routes/admin";
import administrativoRoutes from "./routes/administrativo";
import externalRoutes from "./routes/external";
import publicRoutes from "./routes/public/index";
import cuidadorIARoutes from "./routes/paciente/cuidador-ia";
// import { scheduleControlPreCitaJob } from './services/jobs/controlPreCitaJob';
import { scheduleRecordatorioCitaJob } from './services/jobs/recordatorioCitaJob';
import './models/ConfiguracionRecordatorios';
// Fase 5
import {
  crearLink,
  listarLinks,
  desactivarLink,
  listarReferidos,
  bonificarReferido,
} from "./controllers/admin/linkCaptacionController";
import {
  validarCodigo,
  invitarMedico,
  misReferidos,
} from "./controllers/captacion/captacionController";
import {
  getMiLinkReferido,
  renovarMiLinkReferido,
} from "./controllers/medico/miLinkReferidoController";
import { generarOrdenAlivia } from "./controllers/medico/formulaMedica/formulaAliviaController";
import {
  generarTokenHCPublica,
  verHCPublica,
} from "./controllers/paciente/hcPublicaController";
import { authenticate, authorize } from "./middleware/auth";
import { UserRole } from "./types";

// Rutas de autenticación
app.use("/api/auth", authRoutes);

// Rutas de médico
app.use("/api/medico", medicoRoutes);

// Rutas de paciente
app.use("/api/paciente", pacienteRoutes);

// Rutas de administración
app.use("/api/admin", adminRoutes);

// Rutas del módulo administrativo (rol administrativo)
app.use("/api/administrativo", administrativoRoutes);

// Rutas Externas (solo lectura, con token de autenticación)
app.use("/api/external", externalRoutes);

// Rutas Públicas Abiertas (No Auth)
app.use("/api/public", publicRoutes);

// Cuidador IA (ruta directa, fuera del router paciente para limpieza de path)
app.use("/api/paciente/cuidador-ia", cuidadorIARoutes);

// Iniciar job diario de pre-cita de control.
// DESHABILITADO temporalmente: descomentar cuando se quiera reactivar el envío
// automático de WhatsApps de pre-cita en producción.
// scheduleControlPreCitaJob();
scheduleRecordatorioCitaJob();

// ─── Fase 5 — Captación médica ─────────────────────────────────────────────
// Admin: links de captación y referidos
app.post(
  "/api/admin/links-captacion",
  authenticate,
  authorize(UserRole.ADMINISTRATIVO),
  crearLink,
);
app.get(
  "/api/admin/links-captacion",
  authenticate,
  authorize(UserRole.ADMINISTRATIVO),
  listarLinks,
);
app.delete(
  "/api/admin/links-captacion/:id",
  authenticate,
  authorize(UserRole.ADMINISTRATIVO),
  desactivarLink,
);
app.get(
  "/api/admin/referidos",
  authenticate,
  authorize(UserRole.ADMINISTRATIVO),
  listarReferidos,
);
app.post(
  "/api/admin/referidos/:id/bonificar",
  authenticate,
  authorize(UserRole.ADMINISTRATIVO),
  bonificarReferido,
);

// Public: validar código de registro médico + HC pública
app.get("/api/public/registro-medico/:codigo", validarCodigo);
app.get("/api/public/hc-publica/:token", verHCPublica);

// Paciente: invitar médico + QR de HC
app.post(
  "/api/paciente/invitar-medico",
  authenticate,
  authorize(UserRole.PACIENTE),
  invitarMedico,
);
app.get(
  "/api/paciente/hc-publica/generar-token",
  authenticate,
  authorize(UserRole.PACIENTE),
  generarTokenHCPublica,
);

// Médico: mis referidos + link de referido propio
app.get(
  "/api/medico/mis-referidos",
  authenticate,
  authorize(UserRole.MEDICO),
  misReferidos,
);
app.get(
  "/api/medico/mi-link-referido",
  authenticate,
  authorize(UserRole.MEDICO),
  getMiLinkReferido,
);
app.post(
  "/api/medico/mi-link-referido/renovar",
  authenticate,
  authorize(UserRole.MEDICO),
  renovarMiLinkReferido,
);

// Fase 7 — ALIVIA (webhook se registra en el external router)
app.post(
  "/api/medico/formula-medica/:formulaId/generar-orden-alivia",
  authenticate,
  authorize(UserRole.MEDICO),
  generarOrdenAlivia,
);

// ─── Swagger UI ───────────────────────────────────────────────────────────────
// En Vercel (serverless) no se pueden servir archivos estáticos de node_modules,
// así que se sirve un HTML propio que carga los assets desde unpkg CDN.
app.get("/api/docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

app.get("/api/docs", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Crisalia API Docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    .swagger-ui .topbar { background-color: #443c92; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url: '/api/docs.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        deepLinking: true,
      });
    };
  </script>
</body>
</html>`);
});

// Ruta de prueba
app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", message: "CRISALIA API está funcionando" });
});

// Ruta raíz para evitar 404
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Crisalia API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);
      font-family: 'Segoe UI', sans-serif;
      color: white;
    }
    .card {
      text-align: center;
      padding: 56px 64px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      backdrop-filter: blur(12px);
      box-shadow: 0 25px 60px rgba(0,0,0,0.4);
      max-width: 480px;
      width: 90%;
    }
    .pulse {
      width: 72px;
      height: 72px;
      background: rgba(34,197,94,0.15);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 28px;
      animation: pulse 2s infinite;
    }
    .pulse svg { width: 36px; height: 36px; }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
      50% { box-shadow: 0 0 0 16px rgba(34,197,94,0); }
    }
    h1 { font-size: 2rem; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px; }
    .subtitle { font-size: 1rem; color: rgba(255,255,255,0.5); margin-bottom: 36px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(34,197,94,0.15);
      border: 1px solid rgba(34,197,94,0.3);
      color: #4ade80;
      padding: 10px 24px;
      border-radius: 999px;
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 36px;
    }
    .dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: blink 1.2s infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .info { display: flex; flex-direction: column; gap: 10px; }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(255,255,255,0.04);
      border-radius: 10px;
      font-size: 0.875rem;
    }
    .info-row span:first-child { color: rgba(255,255,255,0.4); }
    .info-row span:last-child { font-weight: 600; color: rgba(255,255,255,0.9); }
  </style>
</head>
<body>
  <div class="card">
    <div class="pulse">
      <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    </div>
    <h1>Crisalia API</h1>
    <p class="subtitle">Backend de la plataforma de salud Nutrabiotics</p>
    <div class="badge">
      <span class="dot"></span>
      Todos los sistemas operativos
    </div>
    <div class="info">
      <div class="info-row"><span>Estado</span><span>✅ Online</span></div>
      <div class="info-row"><span>Entorno</span><span>${process.env.NODE_ENV || 'development'}</span></div>
      <div class="info-row"><span>Versión</span><span>v1.0.0</span></div>
    </div>
  </div>
</body>
</html>`);
});

// Manejo de errores
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({ message: "Error interno del servidor" });
  },
);

// Exportar la app para Vercel
export default app;
