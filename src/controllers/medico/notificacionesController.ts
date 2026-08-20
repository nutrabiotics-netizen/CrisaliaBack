import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ConfiguracionNotificacionesMedico from '../../models/ConfiguracionNotificacionesMedico';
import type { IConfiguracionCategoria } from '../../models/ConfiguracionNotificacionesMedico';
import { handleError } from '../../utils/errors';

/**
 * GET /medico/notificaciones/configuracion
 * Devuelve la configuración de notificaciones del médico autenticado.
 * Si no existe, la crea con los valores por defecto.
 */
export const obtenerConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    let doc = await ConfiguracionNotificacionesMedico.findOne({ medicoId });
    if (!doc) doc = await ConfiguracionNotificacionesMedico.create({ medicoId });

    res.json({ success: true, data: doc.toObject() });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /medico/notificaciones/configuracion
 * Actualiza parcialmente la configuración. Solo acepta campos conocidos.
 */
export const actualizarConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const { frecuenciaResumen, recordarMasTarde, sugerenciasIA, horarioTranquilo, categorias } = req.body;

    const update: Record<string, unknown> = {};

    if (frecuenciaResumen !== undefined) {
      const validos = ['antes_jornada', 'mediodia', 'fin_jornada'];
      if (!validos.includes(frecuenciaResumen)) {
        res.status(400).json({ success: false, message: 'frecuenciaResumen inválido' }); return;
      }
      update.frecuenciaResumen = frecuenciaResumen;
    }

    if (recordarMasTarde !== undefined) update.recordarMasTarde = Boolean(recordarMasTarde);

    if (sugerenciasIA !== undefined) {
      const validos = ['normal', 'alta_prioridad', 'desactivado'];
      if (!validos.includes(sugerenciasIA)) {
        res.status(400).json({ success: false, message: 'sugerenciasIA inválido' }); return;
      }
      update.sugerenciasIA = sugerenciasIA;
    }

    if (horarioTranquilo && typeof horarioTranquilo === 'object') {
      if (horarioTranquilo.activo !== undefined) update['horarioTranquilo.activo'] = Boolean(horarioTranquilo.activo);
      if (horarioTranquilo.desde)                update['horarioTranquilo.desde'] = String(horarioTranquilo.desde);
      if (horarioTranquilo.hasta)                update['horarioTranquilo.hasta'] = String(horarioTranquilo.hasta);
      if (horarioTranquilo.dias) {
        const validos = ['lunes_viernes', 'todos', 'fines_semana'];
        if (validos.includes(horarioTranquilo.dias)) update['horarioTranquilo.dias'] = horarioTranquilo.dias;
      }
    }

    if (Array.isArray(categorias) && categorias.length > 0) {
      update.categorias = categorias as IConfiguracionCategoria[];
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: 'No se proporcionaron campos válidos.' }); return;
    }

    const config = await ConfiguracionNotificacionesMedico.findOneAndUpdate(
      { medicoId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ success: true, data: config });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * POST /medico/notificaciones/configuracion/restaurar
 * Borra la configuración actual y la recrea con los valores por defecto.
 */
export const restaurarDefaults = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    await ConfiguracionNotificacionesMedico.deleteOne({ medicoId });
    const nueva = await ConfiguracionNotificacionesMedico.create({ medicoId });

    res.json({ success: true, data: nueva.toObject() });
  } catch (err: any) {
    handleError(err, res);
  }
};