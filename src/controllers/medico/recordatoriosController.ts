import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ConfiguracionRecordatorios from '../../models/ConfiguracionRecordatorios';
import { handleError } from '../../utils/errors';

/** GET /medico/recordatorios — obtener configuración del médico */
export const obtenerConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const config = await ConfiguracionRecordatorios.findOne({ medicoId }).lean();
    res.json({ success: true, data: config ?? { medicoId, recordatorios: [] } });
  } catch (err: any) {
    handleError(err, res);
  }
};

/** PUT /medico/recordatorios — guardar configuración completa */
export const guardarConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const { recordatorios } = req.body;
    if (!Array.isArray(recordatorios)) {
      res.status(400).json({ success: false, message: 'recordatorios debe ser un array' });
      return;
    }

    // Validar cada recordatorio
    for (const r of recordatorios) {
      if (!r.intervalo || r.intervalo < 1) {
        res.status(400).json({ success: false, message: 'Intervalo debe ser mayor a 0' });
        return;
      }
      if (!['minutos', 'horas', 'dias'].includes(r.unidad)) {
        res.status(400).json({ success: false, message: 'Unidad inválida' });
        return;
      }
    }

    // Deduplicar por intervalo+unidad
    const deduplicados = recordatorios.filter((r: any, i: number, arr: any[]) =>
      arr.findIndex((x: any) => x.intervalo === r.intervalo && x.unidad === r.unidad) === i
    );

    const config = await ConfiguracionRecordatorios.findOneAndUpdate(
      { medicoId },
      { $set: { recordatorios: deduplicados } },
      { new: true, upsert: true }
    ).lean();

    res.json({ success: true, data: config });
  } catch (err: any) {
    handleError(err, res);
  }
};
