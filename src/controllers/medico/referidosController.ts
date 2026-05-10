import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ReferidoMedico from '../../models/ReferidoMedico';

/**
 * GET /api/medico/mis-referidos
 * El médico consulta los colegas que ha referido a Crisal-iA y el estado de cada uno.
 */
export const misReferidos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const referidos = await ReferidoMedico.find({ medicoReferidorId: medicoId })
      .sort({ createdAt: -1 })
      .populate('medicoReferidoId', 'nombre apellido especialidad createdAt')
      .lean();

    const totalBonificado = referidos
      .filter(r => r.estado === 'bonificado')
      .reduce((sum, r) => sum + (r.montoBonus ?? 0), 0);

    res.json({
      success: true,
      referidos,
      resumen: {
        total: referidos.length,
        registrados: referidos.filter(r => r.estado === 'registrado').length,
        activos: referidos.filter(r => r.estado === 'activo').length,
        bonificados: referidos.filter(r => r.estado === 'bonificado').length,
        totalBonificado
      }
    });
  } catch (err) {
    console.error('[misReferidos]:', err);
    res.status(500).json({ mensaje: 'Error al obtener los referidos.' });
  }
};
