import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middleware/auth';
import Notificacion from '../../models/Notificacion';
import { handleError } from '../../utils/errors';

/**
 * GET /medico/notificaciones/bandeja
 * Devuelve la bandeja de notificaciones in-app con KPIs y lista filtrada.
 *
 * Query params:
 *  - filtro: 'todas' | 'no-leidas' | 'requieren' | 'clinicas' | 'ia' | 'administrativas'
 *  - pagina: number (default 1)
 *  - limite: number (default 30)
 */
export const obtenerBandeja = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const { filtro = 'todas', pagina = '1', limite = '30' } = req.query;
    const skip = (Number(pagina) - 1) * Number(limite);

    // ── Filtro base ────────────────────────────────────────────────────────────
    const baseQuery: Record<string, unknown> = { medicoId: new mongoose.Types.ObjectId(medicoId) };

    const CATEGORIA_CLINICAS = ['citas_agenda', 'preconsultas_anamnesis', 'pacientes_casos', 'laboratorios_resultados', 'seguimiento_clinico', 'prescripciones_et'];
    const CATEGORIA_IA       = ['sugerencias_ia'];
    const CATEGORIA_ADMIN    = ['privacidad_seguridad', 'facturacion'];

    const queryFiltrada = { ...baseQuery };
    if (filtro === 'no-leidas')    Object.assign(queryFiltrada, { leida: false });
    if (filtro === 'requieren')    Object.assign(queryFiltrada, { requiereAccion: true, leida: false });
    if (filtro === 'clinicas')     Object.assign(queryFiltrada, { categoria: { $in: CATEGORIA_CLINICAS } });
    if (filtro === 'ia')           Object.assign(queryFiltrada, { categoria: { $in: CATEGORIA_IA } });
    if (filtro === 'administrativas') Object.assign(queryFiltrada, { categoria: { $in: CATEGORIA_ADMIN } });

    // ── KPIs ───────────────────────────────────────────────────────────────────
    const [kpis, items, total] = await Promise.all([
      Notificacion.aggregate([
        { $match: { medicoId: new mongoose.Types.ObjectId(medicoId), leida: false } },
        { $group: {
          _id: null,
          totalNoLeidas: { $sum: 1 },
          requierenAccion: { $sum: { $cond: ['$requiereAccion', 1, 0] } },
          clinicas: { $sum: { $cond: [{ $in: ['$categoria', CATEGORIA_CLINICAS] }, 1, 0] } },
          ia: { $sum: { $cond: [{ $in: ['$categoria', CATEGORIA_IA] }, 1, 0] } },
          administrativas: { $sum: { $cond: [{ $in: ['$categoria', CATEGORIA_ADMIN] }, 1, 0] } },
        }},
      ]),
      Notificacion.find(queryFiltrada)
        .sort({ requiereAccion: -1, leida: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limite))
        .lean(),
      Notificacion.countDocuments(queryFiltrada),
    ]);

    const kpisData = kpis[0] ?? { totalNoLeidas: 0, requierenAccion: 0, clinicas: 0, ia: 0, administrativas: 0 };

    res.json({
      success: true,
      data: {
        kpis: kpisData,
        items,
        total,
        pagina: Number(pagina),
        totalPaginas: Math.ceil(total / Number(limite)),
      },
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /medico/notificaciones/:notificacionId/leer
 * Marca una notificación como leída.
 */
export const marcarLeida = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { notificacionId } = req.params;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    await Notificacion.findOneAndUpdate(
      { _id: notificacionId, medicoId },
      { $set: { leida: true } }
    );
    res.json({ success: true });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /medico/notificaciones/leer-todas
 * Marca todas las notificaciones no leídas del médico como leídas.
 */
export const marcarTodasLeidas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    await Notificacion.updateMany({ medicoId, leida: false }, { $set: { leida: true } });
    res.json({ success: true });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * DELETE /medico/notificaciones/:notificacionId
 * Elimina una notificación (solo leídas).
 */
export const eliminarNotificacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { notificacionId } = req.params;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    await Notificacion.findOneAndDelete({ _id: notificacionId, medicoId });
    res.json({ success: true });
  } catch (err: any) {
    handleError(err, res);
  }
};