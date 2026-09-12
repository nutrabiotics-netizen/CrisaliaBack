/**
 * outlookCalendarSync.ts
 * Helper para sincronizar una cita con Outlook Calendar del médico.
 */

import Medico from '../models/Medico';
import Cita from '../models/Cita';

const {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
} = process.env;

const GRAPH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getValidToken(medicoId: string): Promise<string | null> {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) return null;

  const medico = await Medico.findById(medicoId).select('outlookCalendar').lean();
  const oc = (medico as any)?.outlookCalendar;
  if (!oc?.conectado || !oc?.accessToken) return null;

  if (oc.expiryDate && new Date(oc.expiryDate) <= new Date()) {
    if (!oc.refreshToken) return null;
    const body = new URLSearchParams({
      client_id:     MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: oc.refreshToken,
      grant_type:    'refresh_token',
      scope:         'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
    });
    const res = await fetch(GRAPH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokens: any = await res.json();
    if (tokens.error) return null;
    const expiryDate = new Date(Date.now() + tokens.expires_in * 1000);
    await Medico.findByIdAndUpdate(medicoId, {
      $set: {
        'outlookCalendar.accessToken': tokens.access_token,
        'outlookCalendar.expiryDate':  expiryDate,
        ...(tokens.refresh_token ? { 'outlookCalendar.refreshToken': tokens.refresh_token } : {}),
      },
    });
    return tokens.access_token;
  }

  return oc.accessToken;
}

async function graphRequest(token: string, method: string, path: string, body?: object): Promise<any> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

function buildEventBody(cita: any) {
  const pac = typeof cita.pacienteId === 'object' ? cita.pacienteId : null;
  const nombrePac = pac ? `${pac.nombre ?? ''} ${pac.apellido ?? ''}`.trim() : 'Paciente';
  const fechaInicio = new Date(cita.fecha);
  const [hh, mm] = (cita.hora ?? '08:00').split(':').map(Number);
  fechaInicio.setUTCHours(hh + 5, mm, 0, 0);
  const fechaFin = new Date(fechaInicio.getTime() + 60 * 60 * 1000);
  return {
    subject: `Consulta — ${nombrePac}`,
    body: { contentType: 'text', content: `Tipo: ${cita.tipo ?? ''}\nModalidad: ${cita.modalidad ?? ''}\nEstado: ${cita.estado ?? ''}` },
    start: { dateTime: fechaInicio.toISOString().replace('Z', ''), timeZone: 'America/Bogota' },
    end:   { dateTime: fechaFin.toISOString().replace('Z', ''), timeZone: 'America/Bogota' },
  };
}

export async function syncCitaOutlookCalendar(
  medicoId: string,
  citaId: string,
  accion: 'crear' | 'actualizar' | 'eliminar',
): Promise<void> {
  try {
    const token = await getValidToken(medicoId);
    if (!token) return;

    const cita = await Cita.findById(citaId)
      .populate('pacienteId', 'nombre apellido')
      .lean();
    if (!cita) return;

    const existingEventId = (cita as any).outlookCalendarEventId as string | undefined;

    if (accion === 'eliminar') {
      if (existingEventId) {
        await graphRequest(token, 'DELETE', `/me/events/${existingEventId}`);
        await Cita.findByIdAndUpdate(citaId, { $unset: { outlookCalendarEventId: 1 } });
      }
      return;
    }

    if (accion === 'actualizar' && existingEventId) {
      await graphRequest(token, 'PATCH', `/me/events/${existingEventId}`, buildEventBody(cita));
      return;
    }

    const event: any = await graphRequest(token, 'POST', '/me/events', buildEventBody(cita));
    if (event?.id) {
      await Cita.findByIdAndUpdate(citaId, { outlookCalendarEventId: event.id });
    }
  } catch (err) {
    console.warn('[outlookCalendarSync] error (no crítico):', (err as any)?.message ?? err);
  }
}
