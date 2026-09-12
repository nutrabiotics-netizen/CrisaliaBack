/**
 * googleCalendarSync.ts
 * Helper para sincronizar una cita con el Google Calendar del médico.
 * Se llama desde los controladores de agendamiento (crear, reagendar, cancelar).
 */

import { google } from 'googleapis';
import Medico from '../models/Medico';
import Cita from '../models/Cita';

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

async function getAuthenticatedClient(medicoId: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) return null;

  const medico = await Medico.findById(medicoId).select('googleCalendar').lean();
  const gcal = (medico as any)?.googleCalendar;
  if (!gcal?.conectado || !gcal?.accessToken) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: gcal.accessToken,
    refresh_token: gcal.refreshToken,
    expiry_date: gcal.expiryDate ? new Date(gcal.expiryDate).getTime() : undefined,
  });

  // Refrescar token si venció
  if (gcal.expiryDate && new Date(gcal.expiryDate) <= new Date()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await Medico.findByIdAndUpdate(medicoId, {
      $set: {
        'googleCalendar.accessToken': credentials.access_token,
        'googleCalendar.expiryDate': credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
      },
    });
    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}

function buildEventBody(cita: any) {
  const pac = typeof cita.pacienteId === 'object' ? cita.pacienteId : null;
  const nombrePac = pac ? `${pac.nombre ?? ''} ${pac.apellido ?? ''}`.trim() : 'Paciente';

  const fechaInicio = new Date(cita.fecha);
  const [hh, mm] = (cita.hora ?? '08:00').split(':').map(Number);
  fechaInicio.setUTCHours(hh + 5, mm, 0, 0); // T05:00Z = medianoche Colombia; hora de cita en Colombia

  const durMin = 60;
  const fechaFin = new Date(fechaInicio.getTime() + durMin * 60 * 1000);

  return {
    summary: `Consulta — ${nombrePac}`,
    description: `Tipo: ${cita.tipo ?? ''}\nModalidad: ${cita.modalidad ?? ''}\nEstado: ${cita.estado ?? ''}`,
    start: { dateTime: fechaInicio.toISOString(), timeZone: 'America/Bogota' },
    end: { dateTime: fechaFin.toISOString(), timeZone: 'America/Bogota' },
  };
}

export async function syncCitaGoogleCalendar(
  medicoId: string,
  citaId: string,
  accion: 'crear' | 'actualizar' | 'eliminar',
): Promise<void> {
  try {
    const auth = await getAuthenticatedClient(medicoId);
    if (!auth) return;

    const cita = await Cita.findById(citaId)
      .populate('pacienteId', 'nombre apellido email')
      .lean();
    if (!cita) return;

    const calendar = google.calendar({ version: 'v3', auth });
    const existingEventId = (cita as any).googleCalendarEventId as string | undefined;

    if (accion === 'eliminar') {
      if (existingEventId) {
        await calendar.events.delete({ calendarId: 'primary', eventId: existingEventId, sendUpdates: 'none' }).catch(() => {});
        await Cita.findByIdAndUpdate(citaId, { $unset: { googleCalendarEventId: 1 } });
      }
      return;
    }

    if (accion === 'actualizar' && existingEventId) {
      await calendar.events.update({
        calendarId: 'primary',
        eventId: existingEventId,
        sendUpdates: 'none',
        requestBody: buildEventBody(cita),
      }).catch(() => {});
      return;
    }

    // crear (o actualizar sin eventId previo)
    const created = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'none',
      requestBody: buildEventBody(cita),
    });

    if (created.data.id) {
      await Cita.findByIdAndUpdate(citaId, { googleCalendarEventId: created.data.id });
    }
  } catch (err) {
    console.warn('[googleCalendarSync] error (no crítico):', (err as any)?.message ?? err);
  }
}
