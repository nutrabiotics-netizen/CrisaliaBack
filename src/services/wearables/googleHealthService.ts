/**
 * Servicio Google Health API — OAuth2 + sync de HRV, sueño, FC, pasos.
 *
 * Sucesor de Fitbit Web API. Migración obligatoria antes de septiembre 2026.
 * Docs: https://developers.google.com/health/migration/api-specifications
 *
 * Requiere variables de entorno:
 *   GOOGLE_HEALTH_CLIENT_ID
 *   GOOGLE_HEALTH_CLIENT_SECRET
 *   GOOGLE_HEALTH_REDIRECT_URI   (debe coincidir EXACTO con el registrado en Cloud Console)
 *   WEARABLES_ENC_KEY            (compartido con el conector Fitbit)
 *
 * Scopes (todos "Restricted" → consent screen exige test users):
 *   - googlehealth.health_metrics_and_measurements.readonly → HRV, FC, FC reposo, peso, SpO2
 *   - googlehealth.sleep.readonly                            → sueño + stages
 *   - googlehealth.activity_and_fitness.readonly             → pasos, calorías, distancia
 */

import crypto from 'crypto';
import WearableConnection from '../../models/WearableConnection';
import WearableData, { WearableType } from '../../models/WearableData';
import { encryptToken, decryptToken } from '../../utils/cryptoTokens';

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const HEALTH_API_BASE  = 'https://health.googleapis.com/v4';

const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.heart_rate.readonly',
  'https://www.googleapis.com/auth/googlehealth.oxygen_saturation.readonly'
];

function clientId(): string {
  const v = process.env.GOOGLE_HEALTH_CLIENT_ID?.trim();
  if (!v) throw new Error('GOOGLE_HEALTH_CLIENT_ID no configurada');
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_HEALTH_CLIENT_SECRET?.trim();
  if (!v) throw new Error('GOOGLE_HEALTH_CLIENT_SECRET no configurada');
  return v;
}
function redirectUri(): string {
  const v = process.env.GOOGLE_HEALTH_REDIRECT_URI?.trim();
  if (!v) throw new Error('GOOGLE_HEALTH_REDIRECT_URI no configurada');
  return v;
}

/** URL a la que el paciente debe ser redirigido para autorizar. */
export function buildAuthorizationUrl(state: string): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set('client_id', clientId());
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');     // necesario para refresh_token
  u.searchParams.set('prompt', 'consent');          // fuerza re-consent → garantiza refresh_token
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  return u.toString();
}

/** Intercambia el `code` por access + refresh token. */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code'
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google token exchange ${res.status}: ${txt}`);
  }
  return res.json() as any;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google refresh ${res.status}: ${txt}`);
  }
  return res.json() as any;
}

export async function guardarConexion(pacienteId: string, tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await WearableConnection.findOneAndUpdate(
    { pacienteId, source: 'google_health' },
    {
      $set: {
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

async function obtenerAccessTokenValido(pacienteId: string): Promise<string | null> {
  const conn = await WearableConnection
    .findOne({ pacienteId, source: 'google_health', revoked: false })
    .select('+accessTokenEnc +refreshTokenEnc')
    .lean();
  if (!conn) return null;

  const noVencido = conn.expiresAt && new Date(conn.expiresAt).getTime() > Date.now() + 60_000;
  if (noVencido && conn.accessTokenEnc) {
    return decryptToken(conn.accessTokenEnc);
  }
  if (!conn.refreshTokenEnc) return null;

  const refreshed = await refreshAccessToken(decryptToken(conn.refreshTokenEnc));
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await WearableConnection.updateOne(
    { _id: conn._id },
    { $set: { accessTokenEnc: encryptToken(refreshed.access_token), expiresAt } }
  );
  return refreshed.access_token;
}

/**
 * Identificadores canónicos de `dataType` en Google Health API v4.
 *
 * IMPORTANTE: en el PATH del endpoint el id va en **kebab-case**
 * (`…/dataTypes/{dataType}/dataPoints`). En filtros (query params) el mismo id va
 * en snake_case — pero aquí solo lo usamos en el path, así que kebab-case.
 *
 * Verificado contra el catálogo oficial (junio 2026):
 *   - https://developers.google.com/health/data-types
 *   - https://developers.google.com/health/migration/api-specifications
 *
 * Notas:
 *   - `daily-resting-heart-rate` es un rollup diario (no intradía).
 *   - `active-energy-burned` = calorías activas; existe también `total-calories`.
 *   - `oxygen-saturation` es intradía; el rollup diario es `daily-oxygen-saturation`.
 */
const DATA_TYPE = {
  hrv:           'heart-rate-variability',     // RMSSD/SDNN entre latidos normales
  restingHr:     'daily-resting-heart-rate',   // rollup diario de FC en reposo
  heartRate:     'heart-rate',                  // FC intradía (bpm)
  sleep:         'sleep',                       // sesiones de sueño con stages
  steps:         'steps',                       // conteo de pasos
  calories:      'active-energy-burned',        // calorías activas (kcal)
  distance:      'distance',                    // distancia recorrida
  weight:        'weight',                      // peso corporal
  spo2:          'oxygen-saturation'            // saturación de oxígeno intradía
};

/**
 * Lista dataPoints de un dataType en un rango temporal.
 *
 * Detalles de la Google Health API v4 (verificados jun 2026):
 *   - Método estándar `list` → `GET .../dataPoints` (SIN sufijo `:list`).
 *   - El rango NO se pasa con startTime/endTime, sino con el query param `filter`
 *     usando la sintaxis `{dataType}.interval.start_time >= "ISO" AND ... < "ISO"`.
 *   - En el PATH el dataType va en kebab-case; en el FILTER va en snake_case.
 *   - Paginación con `pageToken` / `nextPageToken`.
 *
 * @param dataType identificador en kebab-case (ej. "heart-rate-variability")
 */
async function listarDataPoints(token: string, dataType: string, desde: Date, hasta: Date): Promise<any[]> {
  // El filtro de Google Health API v4 usa solo "interval.start_time", sin prefijo de dataType
  const filter =
    `interval.start_time >= "${desde.toISOString()}" ` +
    `AND interval.start_time < "${hasta.toISOString()}"`;

  const puntos: any[] = [];
  let pageToken: string | undefined;

  // Bucle de paginación con tope defensivo (evita loops infinitos)
  for (let page = 0; page < 20; page++) {
    const u = new URL(`${HEALTH_API_BASE}/users/me/dataTypes/${dataType}/dataPoints`);
    u.searchParams.set('filter', filter);
    u.searchParams.set('pageSize', '1000');
    if (pageToken) u.searchParams.set('pageToken', pageToken);

    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 404) {
      throw new Error(`dataType "${dataType}" no existe en Google Health API`);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Google Health ${dataType} ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json() as { dataPoints?: any[]; nextPageToken?: string };
    if (json.dataPoints?.length) puntos.push(...json.dataPoints);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return puntos;
}

/** Convierte un dataType kebab-case a la clave camelCase del wrapper en el JSON.
 *  ej. "heart-rate-variability" → "heartRateVariability" */
function camelKey(dataType: string): string {
  return dataType.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

const TIME_KEYS = new Set(['interval', 'sampleTime']);
const SKIP_NUM_KEYS = new Set(['startUtcOffset', 'endUtcOffset', 'utcOffset']);

/**
 * Parsea un dataPoint de Google Health API v4. El shape real anida la métrica
 * bajo una clave camelCase con el nombre del dataType:
 *
 *   steps:      { steps:     { interval:{startTime,endTime}, count:"5000" } }
 *   heart-rate: { heartRate: { sampleTime:{physicalTime}, beatsPerMinute:"72" } }
 *
 * Extraemos:
 *   - start: wrapper.interval.startTime  ó  wrapper.sampleTime.physicalTime
 *   - end:   wrapper.interval.endTime    (puede no existir en samples puntuales)
 *   - value: primer campo numérico (o string numérico) del wrapper que no sea
 *            tiempo/offset. Esto cubre count, beatsPerMinute, kilograms, etc.
 *            sin tener que codificar el nombre exacto de cada métrica.
 *
 * Defensivo: si el shape no calza, devuelve value=null y el punto se salta.
 */
function parseDataPoint(dp: any, dataType: string): { value: number | null; start: Date | null; end: Date | null } {
  const w = dp?.[camelKey(dataType)] ?? dp?.[dataType] ?? null;
  if (!w || typeof w !== 'object') return { value: null, start: null, end: null };

  const startIso = w.interval?.startTime ?? w.sampleTime?.physicalTime ?? null;
  const endIso   = w.interval?.endTime ?? null;
  const start = startIso ? new Date(startIso) : null;
  const end   = endIso ? new Date(endIso) : null;

  let value: number | null = null;
  for (const [k, v] of Object.entries(w)) {
    if (TIME_KEYS.has(k) || SKIP_NUM_KEYS.has(k)) continue;
    if (typeof v === 'number') { value = v; break; }
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) { value = Number(v); break; }
  }
  return { value, start, end };
}

/**
 * Verifica que la cuenta de Google esté efectivamente vinculada a Google Health.
 *
 * Autorizar los scopes OAuth NO basta: la cuenta debe tener un "data store" de
 * Google Health alimentado por alguna fuente (Fitbit vinculado y migrado, Pixel
 * Watch / Wear OS, o terceros vía Health Connect en Android). Si no, CUALQUIER
 * lectura devuelve 400 FAILED_PRECONDITION "The account is not linked to Google Health".
 *
 * Endpoint oficial: GET /v4/users/me/identity → { healthUserId, legacyUserId }
 *   - Si responde FAILED_PRECONDITION o no hay healthUserId → cuenta NO vinculada.
 */
async function verificarVinculacion(token: string): Promise<{ linked: boolean; mensaje?: string }> {
  try {
    const res = await fetch(`${HEALTH_API_BASE}/users/me/identity`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 400) {
      const txt = await res.text().catch(() => '');
      if (txt.includes('not linked') || txt.includes('FAILED_PRECONDITION')) {
        return {
          linked: false,
          mensaje:
            'La cuenta de Google autorizó el acceso, pero no está vinculada a Google Health. ' +
            'Vincula un Fitbit con datos (migrado a Google Health) o un dispositivo Pixel/Wear OS ' +
            'a esta cuenta, o usa el conector Fitbit para la demo.'
        };
      }
      return { linked: false, mensaje: `Google Health identity 400: ${txt.slice(0, 160)}` };
    }
    if (!res.ok) {
      // 401/403 → problema de token/scopes, no de vinculación. Dejar que el sync lo reporte.
      return { linked: true };
    }
    const json = await res.json().catch(() => ({})) as { healthUserId?: string };
    if (!json.healthUserId) {
      return {
        linked: false,
        mensaje: 'La cuenta no tiene un perfil de Google Health (sin healthUserId). Vincula una fuente de datos primero.'
      };
    }
    return { linked: true };
  } catch (e: any) {
    // Si el endpoint de identidad falla por red, no bloqueamos el sync — lo intentamos igual.
    return { linked: true };
  }
}

/**
 * Sync principal — últimos N días de HRV, FC reposo, sueño y pasos.
 * Idempotente por `externalId = source-type-startTime`.
 */
export async function sincronizarPaciente(pacienteId: string, dias = 7): Promise<{ sincronizados: number; errores: string[] }> {
  const token = await obtenerAccessTokenValido(pacienteId);
  if (!token) throw new Error('Paciente no tiene conexión activa con Google Health');

  // Pre-check: si la cuenta no está vinculada a Google Health, todas las lecturas
  // darían FAILED_PRECONDITION. Reportamos UN error claro en vez de N confusos.
  const vinculacion = await verificarVinculacion(token);
  if (!vinculacion.linked) {
    const msg = vinculacion.mensaje || 'Cuenta no vinculada a Google Health.';
    await WearableConnection.updateOne(
      { pacienteId, source: 'google_health' },
      { $set: { lastSyncAt: new Date(), lastErrorMessage: msg } }
    );
    return { sincronizados: 0, errores: [msg] };
  }

  const errores: string[] = [];
  const inserts: any[] = [];
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86400_000);

  const metricas: Array<{ dataType: string; type: WearableType; unit: string }> = [
    { dataType: DATA_TYPE.hrv,       type: 'hrv',        unit: 'ms'  },
    { dataType: DATA_TYPE.restingHr, type: 'rhr',        unit: 'bpm' },
    { dataType: DATA_TYPE.heartRate, type: 'heart_rate', unit: 'bpm' },
    { dataType: DATA_TYPE.steps,     type: 'steps',      unit: 'count' },
    { dataType: DATA_TYPE.calories,  type: 'calories',   unit: 'kcal' },
    { dataType: DATA_TYPE.distance,  type: 'distance_m', unit: 'm' },
    { dataType: DATA_TYPE.weight,    type: 'weight_kg',  unit: 'kg' },
    { dataType: DATA_TYPE.spo2,      type: 'spo2',       unit: '%' }
  ];

  for (const { dataType, type, unit } of metricas) {
    try {
      const puntos = await listarDataPoints(token, dataType, desde, hasta);
      for (const dp of puntos) {
        const { value: valor, start: ts, end } = parseDataPoint(dp, dataType);
        if (valor === null || !ts) continue;
        const externalId = `${type}-${ts.toISOString()}`;
        inserts.push({
          updateOne: {
            filter: { pacienteId, source: 'google_health', externalId },
            update: {
              $setOnInsert: {
                pacienteId, source: 'google_health', type, value: valor, unit,
                timestamp: ts,
                endTimestamp: end ?? undefined,
                externalId,
                raw: dp
              }
            },
            upsert: true
          }
        });
      }
    } catch (e: any) {
      errores.push(`${type}: ${e.message}`);
    }
  }

  // Sueño — estructura distinta (sesión con interval + stages + summary)
  //   { sleep: { interval:{startTime,endTime}, stages:[{startTime,endTime,type}], summary:{minutesAsleep} } }
  try {
    const sesiones = await listarDataPoints(token, DATA_TYPE.sleep, desde, hasta);
    for (const dp of sesiones) {
      const s = dp?.sleep ?? dp;
      const start = s.interval?.startTime ? new Date(s.interval.startTime) : null;
      const end   = s.interval?.endTime   ? new Date(s.interval.endTime)   : null;
      if (!start || !end) continue;
      // Preferir summary.minutesAsleep; si no, calcular de la duración del intervalo
      const totalMin = s.summary?.minutesAsleep != null && !Number.isNaN(Number(s.summary.minutesAsleep))
        ? Number(s.summary.minutesAsleep)
        : Math.round((end.getTime() - start.getTime()) / 60_000);
      const fechaKey = start.toISOString().slice(0, 10);
      inserts.push({
        updateOne: {
          filter: { pacienteId, source: 'google_health', externalId: `sleep_total-${fechaKey}` },
          update: {
            $setOnInsert: {
              pacienteId, source: 'google_health', type: 'sleep_total' as WearableType,
              value: totalMin, unit: 'min',
              timestamp: start, endTimestamp: end,
              externalId: `sleep_total-${fechaKey}`,
              raw: dp
            }
          },
          upsert: true
        }
      });
      // Stages — array `sleep.stages[]` con { startTime, endTime, type } (type en MAYÚSCULAS)
      const stages = s?.stages || [];
      const acumulado: Record<string, number> = { deep: 0, rem: 0, light: 0, awake: 0 };
      for (const st of stages) {
        const sStart = st.startTime ? new Date(st.startTime) : null;
        const sEnd   = st.endTime   ? new Date(st.endTime)   : null;
        if (!sStart || !sEnd) continue;
        const min = Math.round((sEnd.getTime() - sStart.getTime()) / 60_000);
        const tipo = String(st.stageType || st.type || '').toLowerCase();
        if (tipo.includes('deep'))       acumulado.deep  += min;
        else if (tipo.includes('rem'))   acumulado.rem   += min;
        else if (tipo.includes('light')) acumulado.light += min;
        else if (tipo.includes('awake') || tipo.includes('wake')) acumulado.awake += min;
      }
      const stageMap: Array<[WearableType, number]> = [
        ['sleep_deep',  acumulado.deep],
        ['sleep_rem',   acumulado.rem],
        ['sleep_light', acumulado.light],
        ['sleep_awake', acumulado.awake]
      ];
      for (const [tipo, valor] of stageMap) {
        if (valor > 0) {
          inserts.push({
            updateOne: {
              filter: { pacienteId, source: 'google_health', externalId: `${tipo}-${fechaKey}` },
              update: {
                $setOnInsert: {
                  pacienteId, source: 'google_health', type: tipo,
                  value: valor, unit: 'min',
                  timestamp: start, endTimestamp: end,
                  externalId: `${tipo}-${fechaKey}`
                }
              },
              upsert: true
            }
          });
        }
      }
    }
  } catch (e: any) {
    errores.push(`sleep: ${e.message}`);
  }

  let sincronizados = 0;
  if (inserts.length) {
    const r = await WearableData.bulkWrite(inserts, { ordered: false });
    sincronizados = (r.upsertedCount || 0) + (r.modifiedCount || 0);
  }

  await WearableConnection.updateOne(
    { pacienteId, source: 'google_health' },
    { $set: { lastSyncAt: new Date(), lastErrorMessage: errores.slice(0, 3).join(' · ') || undefined } }
  );

  return { sincronizados, errores };
}

/** State firmado HMAC. Codifica `userId.role.ts.sig` (sufijo `.gh` diferencia el HMAC de Fitbit). */
export function firmarState(userId: string, role: 'paciente' | 'medico' = 'paciente'): string {
  const secret = process.env.JWT_SECRET || 'fallback-state-secret';
  const ts = Date.now();
  const hmac = crypto.createHmac('sha256', secret).update(`${userId}.${role}.${ts}.gh`).digest('hex').slice(0, 16);
  return `${userId}.${role}.${ts}.${hmac}`;
}

export function verificarState(state: string): { pacienteId: string; role: 'paciente' | 'medico' } | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [userId, role, ts, sig] = parts;
  if (role !== 'paciente' && role !== 'medico') return null;
  const age = Date.now() - parseInt(ts, 10);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60_000) return null;
  const secret = process.env.JWT_SECRET || 'fallback-state-secret';
  const expected = crypto.createHmac('sha256', secret).update(`${userId}.${role}.${ts}.gh`).digest('hex').slice(0, 16);
  if (expected !== sig) return null;
  return { pacienteId: userId, role };
}
