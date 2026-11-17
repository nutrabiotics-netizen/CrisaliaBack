import { Response } from 'express';
import Material from '../../models/Material';
import { AuthRequest } from '../../middleware/auth';
import { buscarCUM } from '../../utils/buscarCUM';

/**
 * GET /api/medico/materiales/search?q=texto
 * Busca materiales por nombre o código para uso en fórmula médica.
 */
const buscarCatalogo = async (req: AuthRequest, res: Response, incluirCUM: boolean): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();

    if (!q || q.length < 2) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const materiales = await Material.find({
      activo: true,
      $or: [{ nombre: regex }, { codigo: regex }, { marca: regex }, { composicion: regex }],
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
        marca: m.marca || '',
        presentacion: m.presentacion || '',
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

    // El CUM conserva cada presentación. No contiene campos estructurados de
    // concentración, unidad o vía: debe completarlos el médico, sin inferirlos.
    const pais = String(req.query.pais || 'CO').toUpperCase();
    const codigosMateriales = new Set(data.map(m => m.codigo));
    const medicamentosCUM = incluirCUM && pais === 'CO'
      ? buscarCUM(q, 30, 2).filter(m => !codigosMateriales.has(m.codigo)).map(m => ({
          id: `cum-${m.codigo}`, codigo: m.codigo, codigoCUM: m.codigo,
          producto: m.nombre, denominacionComun: m.nombre,
          presentacion: m.descripcion, descripcionLocal: m.descripcion,
          formafarmaceutica: '', formaFarmaceutica: '', concentracion: '',
          unidadmedida: '', unidadMedida: '', viaAdministracion: '', presentaciones: [],
        }))
      : [];
    res.status(200).json({ success: true, data: [...data, ...medicamentosCUM] });
  } catch (err) {
    console.error('Error en búsqueda de materiales:', err);
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Error al buscar materiales',
    });
  }
};

// Las integraciones que solicitan materiales conservan su catálogo específico.
export const buscarMateriales = (req: AuthRequest, res: Response): Promise<void> => buscarCatalogo(req, res, false);

export const buscarMedicamentos = (req: AuthRequest, res: Response): Promise<void> =>
  buscarCatalogo(req, res, req.query.catalogo !== 'materiales');
