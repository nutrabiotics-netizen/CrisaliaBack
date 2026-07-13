/**
 * Servicio Fitbit Web API — OAuth2 + sync de HRV, sueño, frecuencia cardíaca.
 *
 * Requiere variables de entorno:
 *   FITBIT_CLIENT_ID
 *   FITBIT_CLIENT_SECRET
 *   FITBIT_REDIRECT_URI   (debe coincidir EXACTO con el registrado en dev.fitbit.com)
 *   WEARABLES_ENC_KEY     (clave AES-256, 64 chars hex)
 *
 * Registro de la app:
 *   1. https://dev.fitbit.com → Register an App
 *   2. Application Type: Personal (no requiere aprobación de Fitbit)
 *   3. OAuth 2.0 Application Type: Server
 *   4. Callback URL: la misma que FITBIT_REDIRECT_URI
 *
 * Docs:
 *   - https://dev.fitbit.com/build/reference/web-api/authorization/
 *   - https://dev.fitbit.com/build/reference/web-api/heartrate-timeseries/
 */

import crypto from 'crypto';
import WearableConnection from '../../models/WearableConnection';
import WearableData, { WearableType } from '../../models/WearableData';
import { encryptToken, decryptToken } from '../../utils/cryptoTokens';

const FITBIT_API = 'https://api.fitbit.com';
const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const FITBIT_TOKEN_URL = `${FITBIT_API}/oauth2/token`;

const SCOPES = ['heartrate', 'sleep', 'activity', 'profile'];

function clientId(): string {
  const v = process.env.FITBIT_CLIENT_ID?.trim();
  if (!v) throw new Error('FITBIT_CLIENT_ID no configurada');
  return v;
}
function clientSecret(): string {
  const v = process.env.FITBIT_CLIENT_SECRET?.trim();
  if (!v) throw new Error('FITBIT_CLIENT_SECRET no configurada');
  return v;
}
function redirectUri(): string {
  const v = process.env.FITBIT_REDIRECT_URI?.trim();
  if (!v) throw new Error('FITBIT_REDIRECT_URI no configurada');
  return v;
}

/**
 * Construye la URL de autorización a la que el paciente debe ser redirigido.
 * `state` se usa como CSRF/protección para que el callback sepa quién pidió.
 */
export function buildAuthorizationUrl(state: string): string {
  const u = new URL(FITBIT_AUTH_URL);
  u.searchParams.set('client_id', clientId());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('state', state);
  u.searchParams.set('expires_in', '604800'); // 7 días
  return u.toString();
}

/** Intercambia el `code` del callback por access + refresh token. */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
  scope: string;
}> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const body = new URLSearchParams({
    client_id: clientId(),
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code
  });
  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Fitbit token exchange failed (${res.status}): ${txt}`);
  }
  return res.json() as any;
}

/** Renueva el access token usando el refresh token. */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Fitbit refresh failed (${res.status}): ${txt}`);
  }
  return res.json() as any;
}

/**
 * Guarda/actualiza la conexión del paciente. Si ya existe, sobreescribe los
 * tokens (caso re-conexión después de revocar).
 */
export async function guardarConexion(pacienteId: string, tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
  scope: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await WearableConnection.findOneAndUpdate(
    { pacienteId, source: 'fitbit' },
    {
      $set: {
        externalUserId: tokens.user_id,
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        expiresAt,
        scopes: tokens.scope.split(' ').filter(Boolean),
        revoked: false,
        lastErrorMessage: undefined
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Obtiene un access token válido para una conexión (refresca si está expirado).
 * Devuelve null si la conexión no existe o fue revocada.
 */
async function obtenerAccessTokenValido(pacienteId: string): Promise<{ token: string; userId?: string } | null> {
  const conn = await WearableConnection
    .findOne({ pacienteId, source: 'fitbit', revoked: false })
    .select('+accessTokenEnc +refreshTokenEnc')
    .lean();
  if (!conn) return null;

  const noVencido = conn.expiresAt && new Date(conn.expiresAt).getTime() > Date.now() + 60_000;
  if (noVencido && conn.accessTokenEnc) {
    return { token: decryptToken(conn.accessTokenEnc), userId: conn.externalUserId };
  }

  // Refresh
  if (!conn.refreshTokenEnc) return null;
  const refreshed = await refreshAccessToken(decryptToken(conn.refreshTokenEnc));
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await WearableConnection.updateOne(
    { _id: conn._id },
    {
      $set: {
        accessTokenEnc: encryptToken(refreshed.access_token),
        refreshTokenEnc: encryptToken(refreshed.refresh_token),
        expiresAt
      }
    }
  );
  return { token: refreshed.access_token, userId: conn.externalUserId };
}

async function fitbitGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${FITBIT_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Fitbit GET ${path} ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

function fechaIso(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Sincroniza los últimos N días (default 7) de:
 *   - HRV diaria (heart-rate-variability/date/{date}.json)
 *   - Frecuencia cardíaca en reposo (heart/date/{date}.json → restingHeartRate)
 *   - Sueño (sleep/date/{date}.json → minutos totales, REM, profundo, ligero, eficiencia)
 *
 * Idempotente: usa `externalId` único (pacienteId+source+externalId) para evitar
 * duplicados si se vuelve a correr.
 */
export async function sincronizarPaciente(pacienteId: string, dias = 7): Promise<{ sincronizados: number; errores: string[] }> {
  const access = await obtenerAccessTokenValido(pacienteId);
  if (!access) throw new Error('Paciente no tiene conexión activa con Fitbit');

  const errores: string[] = [];
  let sincronizados = 0;
  const inserts: any[] = [];

  const hoy = new Date();
  for (let i = 0; i < dias; i++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    const fecha = fechaIso(d);

    // 1) HRV diaria
    try {
      const hrv = await fitbitGet(access.token, `/1/user/-/hrv/date/${fecha}.json`);
      const valor = hrv?.hrv?.[0]?.value?.dailyRmssd;
      if (typeof valor === 'number') {
        inserts.push({
          updateOne: {
            filter: { pacienteId, source: 'fitbit', externalId: `hrv-${fecha}` },
            update: {
              $setOnInsert: {
                pacienteId, source: 'fitbit', type: 'hrv' as WearableType,
                value: valor, unit: 'ms',
                timestamp: new Date(`${fecha}T00:00:00.000Z`),
                externalId: `hrv-${fecha}`,
                raw: hrv?.hrv?.[0] ?? {}
              }
            },
            upsert: true
          }
        });
      }
    } catch (e: any) {
      errores.push(`hrv ${fecha}: ${e.message}`);
    }

    // 2) Resting Heart Rate
    try {
      const heart = await fitbitGet(access.token, `/1/user/-/activities/heart/date/${fecha}/1d.json`);
      const rhr = heart?.['activities-heart']?.[0]?.value?.restingHeartRate;
      if (typeof rhr === 'number') {
        inserts.push({
          updateOne: {
            filter: { pacienteId, source: 'fitbit', externalId: `rhr-${fecha}` },
            update: {
              $setOnInsert: {
                pacienteId, source: 'fitbit', type: 'rhr' as WearableType,
                value: rhr, unit: 'bpm',
                timestamp: new Date(`${fecha}T00:00:00.000Z`),
                externalId: `rhr-${fecha}`,
                raw: heart?.['activities-heart']?.[0] ?? {}
              }
            },
            upsert: true
          }
        });
      }
    } catch (e: any) {
      errores.push(`rhr ${fecha}: ${e.message}`);
    }

    // 3) Sueño
    try {
      const sleep = await fitbitGet(access.token, `/1.2/user/-/sleep/date/${fecha}.json`);
      const main = (sleep?.sleep || []).find((s: any) => s.isMainSleep) || sleep?.sleep?.[0];
      if (main) {
        const start = new Date(main.startTime);
        const end = new Date(main.endTime);
        const eficiencia = typeof main.efficiency === 'number' ? main.efficiency : null;
        const total = typeof main.minutesAsleep === 'number' ? main.minutesAsleep : null;
        const stages = main.levels?.summary || {};

        const metricas: Array<[WearableType, number | null | undefined, string]> = [
          ['sleep_total',      total,                            'min'],
          ['sleep_efficiency', eficiencia,                       '%'],
          ['sleep_deep',       stages.deep?.minutes,             'min'],
          ['sleep_rem',        stages.rem?.minutes,              'min'],
          ['sleep_light',      stages.light?.minutes,            'min'],
          ['sleep_awake',      stages.wake?.minutes,             'min']
        ];

        for (const [type, valor, unit] of metricas) {
          if (typeof valor === 'number') {
            inserts.push({
              updateOne: {
                filter: { pacienteId, source: 'fitbit', externalId: `${type}-${fecha}` },
                update: {
                  $setOnInsert: {
                    pacienteId, source: 'fitbit', type,
                    value: valor, unit,
                    timestamp: start, endTimestamp: end,
                    externalId: `${type}-${fecha}`,
                    raw: { startTime: main.startTime, endTime: main.endTime, efficiency: eficiencia }
                  }
                },
                upsert: true
              }
            });
          }
        }
      }
    } catch (e: any) {
      errores.push(`sleep ${fecha}: ${e.message}`);
    }
  }

  if (inserts.length) {
    const result = await WearableData.bulkWrite(inserts, { ordered: false });
    sincronizados = (result.upsertedCount || 0) + (result.modifiedCount || 0);
  }

  await WearableConnection.updateOne(
    { pacienteId, source: 'fitbit' },
    { $set: { lastSyncAt: new Date(), lastErrorMessage: errores.slice(0, 3).join(' · ') || undefined } }
  );

  return { sincronizados, errores };
}

/**
 * State firmado HMAC. Codifica `userId.role.ts.sig` para que el callback
 * (público, sin JWT) sepa a qué dashboard redirigir y bajo qué rol guardar.
 */
export function firmarState(userId: string, role: 'paciente' | 'medico' = 'paciente'): string {
  const secret = process.env.JWT_SECRET || 'fallback-state-secret';
  const ts = Date.now();
  const hmac = crypto.createHmac('sha256', secret).update(`${userId}.${role}.${ts}`).digest('hex').slice(0, 16);
  return `${userId}.${role}.${ts}.${hmac}`;
}

export function verificarState(state: string): { pacienteId: string; role: 'paciente' | 'medico' } | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [userId, role, ts, sig] = parts;
  if (role !== 'paciente' && role !== 'medico') return null;
  const ageMs = Date.now() - parseInt(ts, 10);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 10 * 60_000) return null;
  const secret = process.env.JWT_SECRET || 'fallback-state-secret';
  const expected = crypto.createHmac('sha256', secret).update(`${userId}.${role}.${ts}`).digest('hex').slice(0, 16);
  if (expected !== sig) return null;
  return { pacienteId: userId, role };
}
