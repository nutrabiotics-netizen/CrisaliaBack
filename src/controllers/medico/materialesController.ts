import { Response } from 'express';
import Material from '../../models/Material';
import MaterialPais from '../../models/MaterialPais';
import { AuthRequest } from '../../middleware/auth';
import type { PaisCode } from '../../interfaces/material.interface';

const PAISES_VALIDOS: PaisCode[] = ['CO', 'EC', 'MX', 'PE', 'CR'];

/**
 * GET /api/medico/materiales/search?q=texto&pais=CO
 * Busca materiales por nombre o código para uso en fórmula médica.
 * pais opcional: devuelve datos del país (presentación, categoría, etc.); por defecto CO.
 */
export const buscarMateriales = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    const pais = String(req.query.pais || 'CO').toUpperCase() as PaisCode;

    if (!q || q.length < 2) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    if (!PAISES_VALIDOS.includes(pais)) {
      res.status(400).json({ success: false, message: 'País no válido. Use CO, EC, MX, PE o CR.' });
      return;
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const materiales = await Material.find({
      activo: true,
      $or: [{ nombre: regex }, { codigo: regex }],
    })
      .limit(30)
      .lean();

    const ids = materiales.map((m) => m._id);
    const paisesData = await MaterialPais.find({
      material: { $in: ids },
      pais,
    }).lean();

    const mapPais = new Map(
      paisesData.map((p) => [p.material.toString(), p])
    );

    const data = materiales.map((m) => {
      const mp = mapPais.get(m._id.toString());
      const presentaciones = Array.isArray(mp?.presentaciones)
        ? mp.presentaciones.filter((p: any) => p?.nombre?.trim()).map((p: any) => ({ nombre: String(p.nombre || '').trim(), mockup: p.mockup || '' }))
        : [];
      const primeraPresentacion = presentaciones[0]?.nombre || mp?.categoriaLocal || '';
      return {
        id: m._id,
        codigo: m.codigo,
        producto: m.nombre || m.codigo,
        denominacionComun: m.nombre || m.codigo,
        formafarmaceutica: primeraPresentacion,
        formaFarmaceutica: primeraPresentacion,
        concentracion: '',
        unidadmedida: '',
        unidadMedida: '',
        descripcionLocal: mp?.descripcionLocal || m.descripcionBase || '',
        composicion: mp?.composicion || '',
        categoriaLocal: mp?.categoriaLocal || m.categoriaGeneral || '',
        registroSanitario: mp?.registroSanitario || '',
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
