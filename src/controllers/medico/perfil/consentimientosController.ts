import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Medico from '../../../models/Medico';
import DocumentoLegal from '../../../models/DocumentoLegal';
import { handleError } from '../../../utils/errors';

/**
 * GET /api/medico/perfil/consentimientos
 * Devuelve los documentos legales activos junto con el estado de aceptación del médico.
 */
export const getConsentimientos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const [documentos, medico] = await Promise.all([
      DocumentoLegal.find({ activo: true }).sort({ createdAt: 1 }).lean(),
      Medico.findById(medicoId).select('consentimientos').lean(),
    ]);

    const consentimientos: Record<string, string> = (medico?.consentimientos as any) ?? {};

    const resultado = documentos.map(doc => ({
      _id: doc._id,
      titulo: doc.titulo,
      slug: doc.slug,
      version: doc.version,
      tipo: doc.tipo,
      obligatorio: doc.obligatorio,
      aceptadoEn: consentimientos[doc.slug] ?? null,
    }));

    res.json({ success: true, data: resultado });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * POST /api/medico/perfil/consentimientos/aceptar
 * Body: { slug: string }
 * Registra la aceptación de un consentimiento por parte del médico.
 */
export const aceptarConsentimiento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const { slug } = req.body;
    if (!slug) { res.status(400).json({ success: false, message: 'slug requerido.' }); return; }

    const documento = await DocumentoLegal.findOne({ slug, activo: true });
    if (!documento) { res.status(404).json({ success: false, message: 'Documento no encontrado.' }); return; }

    await Medico.findByIdAndUpdate(medicoId, {
      $set: { [`consentimientos.${slug}`]: new Date().toISOString() }
    });

    res.json({ success: true, message: `Consentimiento "${documento.titulo}" aceptado.` });
  } catch (err: any) {
    handleError(err, res);
  }
};