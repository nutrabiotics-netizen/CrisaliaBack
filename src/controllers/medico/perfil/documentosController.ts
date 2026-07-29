import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Medico from '../../../models/Medico';
import { handleError } from '../../../utils/errors';
import { uploadBinary, getDocumentUrl } from '../../../utils/s3Documents';
import type { TipoDocumentoMedico } from '../../../models/Medico';

const TIPOS_VALIDOS: TipoDocumentoMedico[] = ['identidad', 'tarjeta_profesional', 'rethus', 'rut'];

/**
 * GET /api/medico/perfil/documentos
 * Lista los documentos del médico con URLs firmadas temporales.
 */
export const listarDocumentos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const medico = await Medico.findById(medicoId).select('documentos').lean();
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }

    const docs = await Promise.all((medico.documentos ?? []).map(async (doc: any) => {
      let url: string | null = null;
      try { url = await getDocumentUrl(doc.s3Key); } catch { /* S3 key puede no existir aún */ }
      return { ...doc, url };
    }));

    res.json({ success: true, data: docs });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * POST /api/medico/perfil/documentos
 * Sube un documento a S3 y lo registra (o reemplaza si ya existe el tipo).
 * Body multipart: field "archivo", field "tipo"
 */
export const subirDocumento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const tipo = req.body?.tipo as TipoDocumentoMedico;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      res.status(400).json({ success: false, message: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) { res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' }); return; }

    const ext = file.mimetype === 'image/png' ? '.png'
              : file.mimetype === 'image/jpeg' ? '.jpg'
              : file.mimetype === 'image/webp' ? '.webp'
              : '.pdf';
    const ts = Date.now();
    const s3Key = `medicos/${medicoId}/documentos/${tipo}_${ts}${ext}`;
    await uploadBinary(file.buffer, s3Key, file.mimetype);

    const medico = await Medico.findById(medicoId);
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado' }); return; }

    const docs = medico.documentos ?? [];
    const idx = docs.findIndex((d: any) => d.tipo === tipo);
    const entry = {
      tipo,
      nombre: file.originalname,
      s3Key,
      estado: 'pendiente' as const,
      fechaCarga: new Date(),
      vencePronto: false,
    };

    if (idx >= 0) {
      docs[idx] = { ...docs[idx], ...entry } as any;
    } else {
      docs.push(entry as any);
    }
    medico.documentos = docs;
    await medico.save();

    const url = await getDocumentUrl(s3Key);
    res.status(201).json({ success: true, data: { ...entry, url } });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * DELETE /api/medico/perfil/documentos/:tipo
 * Elimina el documento de un tipo del array (no borra S3 por si se necesita auditoría).
 */
export const eliminarDocumento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }

    const tipo = req.params.tipo as TipoDocumentoMedico;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      res.status(400).json({ success: false, message: 'Tipo de documento inválido.' });
      return;
    }

    await Medico.findByIdAndUpdate(medicoId, {
      $pull: { documentos: { tipo } }
    });

    res.json({ success: true, message: 'Documento eliminado.' });
  } catch (err: any) {
    handleError(err, res);
  }
};