/**
 * Controlador REST para búsqueda en catálogo CIE-10.
 * Compartido: lo usan médico y administrativo. La auth la hace cada router.
 */

import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import { countCie10, getCie10ByCode, searchCie10 } from '../../../services/cie10/cie10Service';

/** GET /:rolePrefix/cie10/search?q=...&limit=20 */
export const buscarCie10 = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);

    if (q.trim().length < 2) {
      res.status(200).json({ success: true, items: [] });
      return;
    }

    const items = await searchCie10(q, limit);
    res.status(200).json({ success: true, items });
  } catch (err) {
    console.error('[Cie10][buscar]', err);
    res.status(500).json({ success: false, message: 'Error al buscar diagnósticos' });
  }
};

/** GET /:rolePrefix/cie10/:codigo */
export const obtenerCie10 = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const codigo = req.params.codigo as string;
    if (!codigo) {
      res.status(400).json({ success: false, message: 'Código requerido' });
      return;
    }
    const item = await getCie10ByCode(codigo);
    if (!item) {
      res.status(404).json({ success: false, message: 'Código no encontrado' });
      return;
    }
    res.status(200).json({ success: true, item });
  } catch (err) {
    console.error('[Cie10][obtener]', err);
    res.status(500).json({ success: false, message: 'Error al obtener el diagnóstico' });
  }
};

/** GET /:rolePrefix/cie10/stats */
export const statsCie10 = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const total = await countCie10();
    res.status(200).json({ success: true, total });
  } catch (err) {
    console.error('[Cie10][stats]', err);
    res.status(500).json({ success: false, message: 'Error al obtener stats' });
  }
};
