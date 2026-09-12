/**
 * outlookCalendarController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Integración Outlook / Microsoft Calendar usando Microsoft Graph API.
 *
 * Rutas:
 *  1. GET  /outlook-calendar/auth-url      → devuelve URL de autorización OAuth
 *  2. GET  /outlook-calendar/callback      → recibe code, guarda tokens en el médico
 *  3. GET  /outlook-calendar/estado        → estado de conexión
 *  4. POST /outlook-calendar/sync          → sincroniza citas → Outlook Calendar
 *  5. DELETE /outlook-calendar/disconnect  → revoca y elimina tokens
 *
 * Requiere en .env:
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Medico from '../../../models/Medico';
import Cita from '../../../models/Cita';
import { handleError } from '../../../utils/errors';

const {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_REDIRECT_URI,
  FRONTEND_URL,
} = process.env;

const GRAPH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'https://graph.microsoft.com/Calendars.ReadWrite offline_access';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function exchangeCode(code: string): Promise<any> {
  const body = new URLSearchParams({
    client_id:     MICROSOFT_CLIENT_ID!,
    client_secret: MICROSOFT_CLIENT_SECRET!,
    code,
    redirect_uri:  MICROSOFT_REDIRECT_URI!,
    grant_type:    'authorization_code',
  });
  const res = await fetch(GRAPH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<any> {
  const body = new URLSearchParams({
    client_id:     MICROSOFT_CLIENT_ID!,
    client_secret: MICROSOFT_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         SCOPES,
  });
  const res = await fetch(GRAPH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.json();
}

async function graphRequest(accessToken: string, method: string, path: string, body?: object): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

async function getValidToken(medicoId: string): Promise<string | null> {
  const medico = await Medico.findById(medicoId).select('outlookCalendar').lean();
  const oc = (medico as any)?.outlookCalendar;
  if (!oc?.conectado || !oc?.accessToken) return null;

  if (oc.expiryDate && new Date(oc.expiryDate) <= new Date()) {
    if (!oc.refreshToken) return null;
    const tokens = await refreshAccessToken(oc.refreshToken);
    if (tokens.error) return null;
    const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
    await Medico.findByIdAndUpdate(medicoId, {
      $set: {
        'outlookCalendar.accessToken': tokens.access_token,
        'outlookCalendar.expiryDate': expiryDate,
        ...(tokens.refresh_token ? { 'outlookCalendar.refreshToken': tokens.refresh_token } : {}),
      },
    });
    return tokens.access_token;
  }

  return oc.accessToken;
}

// ── 1. URL de autorización ────────────────────────────────────────────────────

export const getAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
      res.status(503).json({ success: false, message: 'Outlook no está configurado. Define MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y MICROSOFT_REDIRECT_URI.' });
      return;
    }
    const params = new URLSearchParams({
      client_id:     MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri:  MICROSOFT_REDIRECT_URI,
      scope:         SCOPES,
      response_mode: 'query',
      state:         req.userId!,
    });
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    res.json({ success: true, data: { url } });
  } catch (err: any) {
    res.status(503).json({ success: false, message: err.message });
  }
};

// ── 2. Callback OAuth ─────────────────────────────────────────────────────────

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  const frontendBase = FRONTEND_URL ?? 'http://localhost:5173';
  try {
    const { code, state: medicoId, error } = req.query;

    if (error) {
      res.redirect(`${frontendBase}/medico/perfil/general?outlook=error`);
      return;
    }
    if (!code || !medicoId) {
      res.status(400).json({ success: false, message: 'Parámetros inválidos.' });
      return;
    }

    const tokens = await exchangeCode(String(code));
    if (tokens.error) {
      res.redirect(`${frontendBase}/medico/perfil/general?outlook=error`);
      return;
    }

    const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
    await Medico.findByIdAndUpdate(String(medicoId), {
      $set: {
        'outlookCalendar.accessToken':  tokens.access_token,
        'outlookCalendar.refreshToken': tokens.refresh_token,
        'outlookCalendar.expiryDate':   expiryDate,
        'outlookCalendar.conectado':    true,
      },
    });

    res.redirect(`${frontendBase}/medico/perfil/general?outlook=ok`);
  } catch (err: any) {
    handleError(err, res);
  }
};

// ── 3. Estado de conexión ─────────────────────────────────────────────────────

export const getEstadoConexion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medico = await Medico.findById(req.userId!).select('outlookCalendar').lean();
    const oc = (medico as any)?.outlookCalendar;
    res.json({ success: true, data: { conectado: oc?.conectado === true, expiryDate: oc?.expiryDate ?? null } });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ── 4. Sincronizar citas → Outlook ────────────────────────────────────────────

export const syncCitas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const token = await getValidToken(medicoId);
    if (!token) {
      res.status(400).json({ success: false, message: 'Outlook Calendar no está conectado.' });
      return;
    }

    const ahora = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);

    const citas = await Cita.find({
      medicoId,
      fecha: { $gte: ahora, $lte: limite },
      estado: { $in: ['pendiente', 'confirmada'] },
    }).populate('pacienteId', 'nombre apellido').lean();

    let sincronizadas = 0;
    const errores: string[] = [];

    for (const cita of citas) {
      const pac = cita.pacienteId as any;
      const nombrePac = pac ? `${pac.nombre ?? ''} ${pac.apellido ?? ''}`.trim() : 'Paciente';
      const fechaInicio = new Date(cita.fecha);
      const [hh, mm] = (cita.hora ?? '08:00').split(':').map(Number);
      fechaInicio.setUTCHours(hh + 5, mm, 0, 0);
      const fechaFin = new Date(fechaInicio.getTime() + 60 * 60 * 1000);

      try {
        const event: any = await graphRequest(token, 'POST', '/me/events', {
          subject: `Consulta — ${nombrePac}`,
          body: { contentType: 'text', content: `Tipo: ${cita.tipo}\nModalidad: ${cita.modalidad}\nEstado: ${cita.estado}` },
          start: { dateTime: fechaInicio.toISOString().replace('Z', ''), timeZone: 'America/Bogota' },
          end:   { dateTime: fechaFin.toISOString().replace('Z', ''), timeZone: 'America/Bogota' },
        });
        if (event?.id) {
          await Cita.findByIdAndUpdate(cita._id, { outlookCalendarEventId: event.id });
        }
        sincronizadas++;
      } catch (e: any) {
        errores.push(`Cita ${cita._id}: ${e.message}`);
      }
    }

    res.json({ success: true, message: `${sincronizadas} citas sincronizadas con Outlook Calendar.`, data: { sincronizadas, errores } });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ── 5. Desconectar ────────────────────────────────────────────────────────────

export const disconnect = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Medico.findByIdAndUpdate(req.userId!, { $unset: { outlookCalendar: 1 } });
    res.json({ success: true, message: 'Outlook Calendar desconectado correctamente.' });
  } catch (err: any) {
    handleError(err, res);
  }
};
