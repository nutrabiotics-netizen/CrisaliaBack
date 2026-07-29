import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Medico from '../../../models/Medico';
import { handleError } from '../../../utils/errors';

/**
 * GET /api/medico/perfil/facturacion
 */
export const getFacturacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    const medico = await Medico.findById(medicoId).select('facturacion').lean();
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }
    res.json({ success: true, data: medico.facturacion ?? {} });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /api/medico/perfil/facturacion
 */
export const updateFacturacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const permitidos = [
      'tipoPersona', 'nombreRazonSocial', 'tipoIdentificacion', 'numeroIdentificacion',
      'responsabilidadTributaria', 'correoFacturacion', 'direccion', 'ciudad',
      'banco', 'tipoCuenta', 'numeroCuenta', 'numeroIdentificacionCuenta',
      'responsabilidadTributariaCuenta', 'titularCuenta', 'identificacionTitular',
    ];

    const update: Record<string, unknown> = {};
    for (const key of permitidos) {
      if (req.body[key] !== undefined) update[`facturacion.${key}`] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: 'No se proporcionaron campos válidos.' });
      return;
    }

    const medico = await Medico.findByIdAndUpdate(
      medicoId,
      { $set: update },
      { new: true, runValidators: true }
    ).select('facturacion').lean();

    res.json({ success: true, data: medico?.facturacion });
  } catch (err: any) {
    handleError(err, res);
  }
};