import { Response } from 'express';
import Material from '../../models/Material';
import { AuthRequest } from '../../middleware/auth';

/**
 * GET /api/medico/materiales/search?q=texto
 * Busca materiales por nombre o código para uso en fórmula médica.
 */
export const buscarMateriales = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();

    if (!q || q.length < 2) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const materiales = await Material.find({
      activo: true,
      $or: [{ nombre: regex }, { codigo: regex }],
    })
      .limit(30)
      .lean();

    const data = materiales.map((m) => {
      const presentaciones = Array.isArray(m.presentaciones)
        ? m.presentaciones.filter((p: any) => p?.nombre?.trim()).map((p: any) => ({ nombre: String(p.nombre || '').trim(), mockup: p.mockup || '' }))
        : [];
        
      const primeraPresentacion = presentaciones[0]?.nombre || m.formaFarmaceutica || m.presentacion || m.categoria || '';
      
      return {
        id: m._id,
        codigo: m.codigo,
        producto: m.nombre || m.codigo,
        denominacionComun: m.nombre || m.codigo,
        formafarmaceutica: primeraPresentacion,
        formaFarmaceutica: primeraPresentacion,
        concentracion: m.concentracion || '',
        unidadmedida: m.unidadMedida || '',
        unidadMedida: m.unidadMedida || '',
        viaAdministracion: m.viaAdministracion || '',
        descripcionLocal: m.descripcion || '',
        composicion: m.composicion || '',
        categoriaLocal: m.categoria || '',
        registroSanitario: m.registroSanitario || '',
        presentaciones,
      };
    });

    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Error en búsqueda de materiales:', err);
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Error al buscar materiales',
    });
  }
};
