/**
 * googleCalendarController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-4 — Integración Google Calendar OAuth 2.0
 *
 * Flujo:
 *  1. GET  /google-calendar/auth-url      → devuelve URL de autorización OAuth
 *  2. GET  /google-calendar/callback      → recibe code, guarda tokens en el médico
 *  3. POST /google-calendar/sync          → sincroniza citas de Crisal-IA → Google Cal
 *  4. DELETE /google-calendar/disconnect  → revoca y elimina tokens
 *
 * Requiere en .env:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 */

import { Request, Response } from 'express';
import { google } from 'googleapis';
import { AuthRequest } from '../../../middleware/auth';
import Medico from '../../../models/Medico';
import Cita from '../../../models/Cita';
import { handleError } from '../../../utils/errors';

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

function createOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth no está configurado. Define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI en .env');
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// ─── 1. URL de autorización ──────────────────────────────────────────────────

export const getAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const oauth2Client = createOAuth2Client();
    const scopes = ['https://www.googleapis.com/auth/calendar.events'];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: req.userId // Para identificar al médico en el callback
    });
    res.json({ success: true, data: { url } });
  } catch (err: any) {
    res.status(503).json({ success: false, message: err.message });
  }
};

// ─── 2. Callback OAuth ───────────────────────────────────────────────────────

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state: medicoId, error } = req.query;

    if (error) {
      res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/medico/perfil/personalizacion?gcal=error`);
      return;
    }

    if (!code || !medicoId) {
      res.status(400).json({ success: false, message: 'Parámetros inválidos en callback.' });
      return;
    }

    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(String(code));

    // Guardar tokens cifrados en el médico (se usa el campo aliados o un campo dedicado)
    await Medico.findByIdAndUpdate(String(medicoId), {
      $set: {
        'googleCalendar.accessToken': tokens.access_token,
        'googleCalendar.refreshToken': tokens.refresh_token ?? undefined,
        'googleCalendar.expiryDate': tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        'googleCalendar.conectado': true
      }
    });

    res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/medico/perfil/personalizacion?gcal=ok`);
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── 3. Sincronizar citas → Google Calendar ──────────────────────────────────

export const syncCitas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;

    const medico = await Medico.findById(medicoId)
      .select('nombre apellido googleCalendar')
      .lean();

    if (!medico) {
      res.status(404).json({ success: false, message: 'Médico no encontrado' });
      return;
    }

    const gcal = (medico as any).googleCalendar;
    if (!gcal?.conectado || !gcal?.accessToken) {
      res.status(400).json({ success: false, message: 'Google Calendar no está conectado.' });
      return;
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: gcal.accessToken,
      refresh_token: gcal.refreshToken,
      expiry_date: gcal.expiryDate ? new Date(gcal.expiryDate).getTime() : undefined
    });

    // Si el token venció, refrescar y guardar
    if (gcal.expiryDate && new Date(gcal.expiryDate) <= new Date()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await Medico.findByIdAndUpdate(medicoId, {
        $set: {
          'googleCalendar.accessToken': credentials.access_token,
          'googleCalendar.expiryDate': credentials.expiry_date ? new Date(credentials.expiry_date) : undefined
        }
      });
      oauth2Client.setCredentials(credentials);
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Citas próximas (próximos 30 días) en estado pendiente o confirmada
    const ahora = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);

    const citas = await Cita.find({
      medicoId,
      fecha: { $gte: ahora, $lte: limite },
      estado: { $in: ['pendiente', 'confirmada'] }
    })
      .populate('pacienteId', 'nombre apellido email')
      .lean();

    let sincronizadas = 0;
    const errores: string[] = [];

    for (const cita of citas) {
      const pac = cita.pacienteId as any;
      const fechaInicio = new Date(cita.fecha);
      const [hh, mm] = (cita.hora ?? '08:00').split(':').map(Number);
      fechaInicio.setHours(hh, mm, 0, 0);
      const fechaFin = new Date(fechaInicio.getTime() + 60 * 60 * 1000); // +1 hora

      try {
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: `Consulta — ${pac?.nombre ?? ''} ${pac?.apellido ?? ''}`.trim(),
            description: `Tipo: ${cita.tipo}\nModalidad: ${cita.modalidad}\nEstado: ${cita.estado}`,
            start: { dateTime: fechaInicio.toISOString(), timeZone: 'America/Bogota' },
            end: { dateTime: fechaFin.toISOString(), timeZone: 'America/Bogota' },
            attendees: pac?.email ? [{ email: pac.email }] : []
          }
        });
        sincronizadas++;
      } catch (e: any) {
        errores.push(`Cita ${cita._id}: ${e.message}`);
      }
    }

    res.json({
      success: true,
      message: `${sincronizadas} citas sincronizadas con Google Calendar.`,
      data: { sincronizadas, errores }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── 4. Desconectar ──────────────────────────────────────────────────────────

export const disconnect = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;

    const medico = await Medico.findById(medicoId).select('googleCalendar').lean();
    const gcal = (medico as any)?.googleCalendar;

    if (gcal?.accessToken) {
      try {
        const oauth2Client = createOAuth2Client();
        oauth2Client.setCredentials({ access_token: gcal.accessToken });
        await oauth2Client.revokeCredentials();
      } catch {
        // Si falla la revocación, continúa de todas formas
      }
    }

    await Medico.findByIdAndUpdate(medicoId, {
      $unset: { googleCalendar: 1 }
    });

    res.json({ success: true, message: 'Google Calendar desconectado correctamente.' });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── 5. Estado conexión ──────────────────────────────────────────────────────

export const getEstadoConexion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const medico = await Medico.findById(medicoId).select('googleCalendar').lean();
    const gcal = (medico as any)?.googleCalendar;

    res.json({
      success: true,
      data: {
        conectado: gcal?.conectado === true,
        expiryDate: gcal?.expiryDate ?? null
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};
