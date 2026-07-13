import { Response, Request } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import mongoose from 'mongoose';
import WearableConnection from '../../../models/WearableConnection';
import WearableData, { WearableType } from '../../../models/WearableData';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  guardarConexion,
  sincronizarPaciente,
  firmarState,
  verificarState
} from '../../../services/wearables/fitbitService';
import {
  buildAuthorizationUrl as ghBuildAuthorizationUrl,
  exchangeCodeForToken  as ghExchangeCodeForToken,
  guardarConexion       as ghGuardarConexion,
  sincronizarPaciente   as ghSincronizarPaciente,
  listarDataTypesDisponibles as ghListarDataTypes,
  firmarState           as ghFirmarState,
  verificarState        as ghVerificarState
} from '../../../services/wearables/googleHealthService';

/**
 * GET /paciente/wearables/me
 * Lista las conexiones activas del paciente (sin tokens) — para mostrar estado en UI.
 */
export const obtenerMisConexiones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const conexiones = await WearableConnection.find({ pacienteId, revoked: false })
      .select('source lastSyncAt expiresAt scopes lastErrorMessage createdAt')
      .lean();
    res.json({ success: true, data: conexiones });
  } catch (error: any) {
    console.error('[wearables.obtenerMisConexiones]', error);
    res.status(500).json({ success: false, message: 'Error', error: error.message });
  }
};

/**
 * GET /paciente/wearables/fitbit/connect
 * Devuelve la URL a la que el paciente debe ser redirigido para autorizar.
 * El front abre esa URL en la misma ventana (o ventana nueva).
 */
export const iniciarConexionFitbit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const role = req.userRole === 'medico' ? 'medico' : 'paciente';
    const state = firmarState(pacienteId, role);
    const url = buildAuthorizationUrl(state);
    res.json({ success: true, data: { url } });
  } catch (error: any) {
    console.error('[wearables.iniciarConexionFitbit]', error);
    res.status(500).json({ success: false, message: 'No se pudo iniciar el flujo', error: error.message });
  }
};

/** Devuelve la ruta del dashboard al que vuelve el usuario tras el OAuth callback. */
function homeFor(role: 'paciente' | 'medico'): string {
  return role === 'medico' ? '/medico/perfil/general' : '/paciente/dashboard';
}

/**
 * GET /paciente/wearables/fitbit/callback?code=...&state=...
 * Endpoint público (Fitbit redirige aquí). Verifica el `state` para resolver
 * a qué paciente pertenece la conexión, intercambia el code y guarda los tokens.
 *
 * Al final redirige al front (paciente/seguimiento-ia o dashboard) con un flag.
 */
export const callbackFitbit = async (req: Request, res: Response): Promise<void> => {
  const errorParam = (req.query.error as string) || '';
  const code = (req.query.code as string) || '';
  const state = (req.query.state as string) || '';
  const frontUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Antes de verificar state no sabemos el rol → default paciente para errores tempranos
  const verified = state ? verificarState(state) : null;
  const home = verified ? homeFor(verified.role) : '/paciente/dashboard';

  if (errorParam) { res.redirect(`${frontUrl}${home}?wearable=fitbit&status=denied`); return; }
  if (!code || !state) { res.redirect(`${frontUrl}${home}?wearable=fitbit&status=invalid`); return; }
  if (!verified) { res.redirect(`${frontUrl}${home}?wearable=fitbit&status=expired`); return; }

  try {
    const tokens = await exchangeCodeForToken(code);
    await guardarConexion(verified.pacienteId, tokens);
    sincronizarPaciente(verified.pacienteId, 7).catch((e) =>
      console.warn('[wearables.callbackFitbit] sync inicial falló:', e.message)
    );
    res.redirect(`${frontUrl}${home}?wearable=fitbit&status=ok`);
  } catch (err: any) {
    console.error('[wearables.callbackFitbit]', err);
    res.redirect(`${frontUrl}${home}?wearable=fitbit&status=error`);
  }
};

/**
 * POST /paciente/wearables/fitbit/sync
 * Fuerza una sincronización (típicamente lanzada por un botón "Sincronizar ahora").
 * Body: { dias?: number } (default 7, máx 30)
 */
export const sincronizarFitbit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const dias = Math.min(30, Math.max(1, Number(req.body?.dias) || 7));
    const result = await sincronizarPaciente(pacienteId, dias);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[wearables.sincronizarFitbit]', error);
    res.status(500).json({ success: false, message: error.message || 'Error al sincronizar' });
  }
};

/**
 * DELETE /paciente/wearables/fitbit
 * Revoca la conexión local (marca como revocada). No intenta revocar en Fitbit
 * porque eso requiere otro endpoint OAuth — el paciente puede revocar manualmente
 * desde fitbit.com/settings/applications si quiere.
 */
export const desconectarFitbit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    await WearableConnection.updateOne(
      { pacienteId, source: 'fitbit' },
      { $set: { revoked: true } }
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('[wearables.desconectarFitbit]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /paciente/wearables/data?type=hrv&desde=2026-05-01&hasta=2026-05-31
 * Devuelve los datos crudos para gráficas.
 */
export const obtenerDatos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const type = (req.query.type as string) || '';
    const desde = req.query.desde ? new Date(String(req.query.desde)) : new Date(Date.now() - 30 * 86400000);
    const hasta = req.query.hasta ? new Date(String(req.query.hasta)) : new Date();

    const q: any = { pacienteId: new mongoose.Types.ObjectId(pacienteId) };
    if (type) q.type = type;
    q.timestamp = { $gte: desde, $lte: hasta };

    // Si no se filtra por tipo específico, traer los últimos N de cada tipo
    // para no llenar el límite con un solo tipo (ej. heart_rate intradía)
    let data: any[];
    if (type) {
      data = await WearableData.find(q)
        .sort({ timestamp: -1 })
        .select('type value unit timestamp source')
        .limit(5000)
        .lean();
    } else {
      // Últimos 200 por tipo para cubrir todos los tipos
      const TIPOS: WearableType[] = [
        'hrv', 'heart_rate', 'rhr', 'sleep_total', 'sleep_deep', 'sleep_rem',
        'sleep_light', 'sleep_awake', 'sleep_efficiency', 'steps', 'distance_m',
        'calories', 'active_minutes', 'spo2', 'body_temp', 'weight_kg', 'stress',
        'respiratory_rate', 'vo2_max'
      ];
      const resultados = await Promise.all(
        TIPOS.map(t =>
          WearableData.find({ ...q, type: t })
            .sort({ timestamp: -1 })
            .select('type value unit timestamp source')
            .limit(200)
            .lean()
        )
      );
      data = resultados.flat();
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[wearables.obtenerDatos]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Google Health ──────────────────────────────────────────────────────────

export const iniciarConexionGoogle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const role = req.userRole === 'medico' ? 'medico' : 'paciente';
    const state = ghFirmarState(pacienteId, role);
    const url = ghBuildAuthorizationUrl(state);
    res.json({ success: true, data: { url } });
  } catch (error: any) {
    console.error('[wearables.iniciarConexionGoogle]', error);
    res.status(500).json({ success: false, message: 'No se pudo iniciar el flujo', error: error.message });
  }
};

export const callbackGoogle = async (req: Request, res: Response): Promise<void> => {
  const errorParam = (req.query.error as string) || '';
  const code = (req.query.code as string) || '';
  const state = (req.query.state as string) || '';
  const frontUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const verified = state ? ghVerificarState(state) : null;
  const home = verified ? homeFor(verified.role) : '/paciente/dashboard';

  if (errorParam) { res.redirect(`${frontUrl}${home}?wearable=google&status=denied`); return; }
  if (!code || !state) { res.redirect(`${frontUrl}${home}?wearable=google&status=invalid`); return; }
  if (!verified) { res.redirect(`${frontUrl}${home}?wearable=google&status=expired`); return; }

  try {
    const tokens = await ghExchangeCodeForToken(code);
    await ghGuardarConexion(verified.pacienteId, tokens);
    ghSincronizarPaciente(verified.pacienteId, 7).catch((e) =>
      console.warn('[wearables.callbackGoogle] sync inicial falló:', e.message)
    );
    res.redirect(`${frontUrl}${home}?wearable=google&status=ok`);
  } catch (err: any) {
    console.error('[wearables.callbackGoogle]', err);
    res.redirect(`${frontUrl}${home}?wearable=google&status=error`);
  }
};

export const sincronizarGoogle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const dias = Math.min(30, Math.max(1, Number(req.body?.dias) || 7));
    const result = await ghSincronizarPaciente(pacienteId, dias);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[wearables.sincronizarGoogle]', error);
    res.status(500).json({ success: false, message: error.message || 'Error al sincronizar' });
  }
};

export const diagnosticarGoogle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const resultados = await ghListarDataTypes(pacienteId);
    res.json({ success: true, data: resultados });
  } catch (error: any) {
    console.error('[wearables.diagnosticarGoogle]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const desconectarGoogle = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    await (await import('../../../models/WearableConnection')).default.updateOne(
      { pacienteId, source: 'google_health' },
      { $set: { revoked: true } }
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('[wearables.desconectarGoogle]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
