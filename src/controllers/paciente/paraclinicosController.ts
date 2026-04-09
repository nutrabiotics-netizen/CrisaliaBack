import { Response } from 'express';
import Paraclinico from '../../models/Paraclinico';
import Paciente from '../../models/Paciente';
import { AuthRequest } from '../../middleware/auth';
import { buildParaclinicoKey, uploadBinaryAndGetUrl } from '../../utils/s3Documents';
import { extraerParaclinicoOcr } from '../../services/paraclinicos/paraclinicoOcrService';

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function mimeToTipo(mime: string): 'pdf' | 'imagen' | null {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'imagen';
  return null;
}

export const obtenerParaclinicos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const paraclinicos = await Paraclinico.find({ pacienteId }).sort({ fecha: -1 });
    res.json(paraclinicos);
  } catch (error) {
    console.error('Error al obtener paraclínicos:', error);
    res.status(500).json({ mensaje: 'Error al obtener los paraclínicos' });
  }
};

export const subirParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const { nombre, tipo, tamañoBytes, urlArchivo, notasPaciente } = req.body;

    // Validación básica
    if (!nombre || !tipo || !tamañoBytes || !urlArchivo) {
      res.status(400).json({ mensaje: 'Faltan campos requeridos: nombre, tipo, tamañoBytes, urlArchivo' });
      return;
    }

    const nuevoParaclinico = new Paraclinico({
      pacienteId,
      nombre,
      tipo,
      tamañoBytes,
      urlArchivo,
      notasPaciente,
      fecha: new Date(),
      revisadoPorMedico: false,
      ocrEstado: 'omitido',
      ocrError: 'Registro manual sin archivo; no se ejecutó OCR.'
    });

    await nuevoParaclinico.save();
    res.status(201).json(nuevoParaclinico);
  } catch (error) {
    console.error('Error al subir paraclínico:', error);
    res.status(500).json({ mensaje: 'Error al registrar el paraclínico' });
  }
};

/** Subida real: archivo en multipart (campo `archivo`), opcional `notasPaciente`. Requiere multer antes. */
export const subirParaclinicoArchivo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ mensaje: 'Debes enviar un archivo en el campo "archivo"' });
      return;
    }

    const mime = file.mimetype || '';
    if (!ALLOWED_MIMES.has(mime)) {
      res.status(400).json({ mensaje: 'Solo se permiten PDF, JPG, PNG o WebP' });
      return;
    }

    const tipo = mimeToTipo(mime);
    if (!tipo) {
      res.status(400).json({ mensaje: 'Tipo de archivo no soportado' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
    const numeroDoc = paciente?.numeroDocumento || pacienteId;

    const notasPaciente =
      typeof req.body?.notasPaciente === 'string' && req.body.notasPaciente.trim()
        ? req.body.notasPaciente.trim()
        : undefined;

    const nombreMostrado =
      typeof req.body?.nombreDocumento === 'string' && req.body.nombreDocumento.trim()
        ? req.body.nombreDocumento.trim()
        : file.originalname || 'documento';

    const key = buildParaclinicoKey(numeroDoc, file.originalname || 'documento', mime);
    let urlArchivo: string;
    try {
      urlArchivo = await uploadBinaryAndGetUrl(file.buffer, key, mime);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[subirParaclinicoArchivo] S3:', msg);
      res.status(503).json({
        mensaje:
          'No se pudo guardar el archivo en almacenamiento. Verifica AWS_S3_DOCUMENTS_BUCKET y credenciales.'
      });
      return;
    }

    const ocr = await extraerParaclinicoOcr(file.buffer, mime, tipo);

    const doc = new Paraclinico({
      pacienteId,
      nombre: nombreMostrado,
      tipo,
      tamañoBytes: file.size,
      urlArchivo,
      notasPaciente,
      fecha: new Date(),
      revisadoPorMedico: false,
      ocrTextoPlano: ocr.ocrTextoPlano,
      ocrValores: ocr.ocrValores,
      ocrEstado: ocr.ocrEstado,
      ocrMetodo: ocr.ocrMetodo,
      ocrError: ocr.ocrError
    });

    await doc.save();
    res.status(201).json(doc);
  } catch (error) {
    console.error('Error al subir paraclínico (archivo):', error);
    res.status(500).json({ mensaje: 'Error al registrar el paraclínico' });
  }
};

export const eliminarParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { id } = req.params;

    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const paraclinico = await Paraclinico.findOne({ _id: id, pacienteId });
    if (!paraclinico) {
      res.status(404).json({ mensaje: 'Paraclínico no encontrado o no autorizado para eliminarlo' });
      return;
    }

    await paraclinico.deleteOne();
    res.json({ mensaje: 'Paraclínico eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar paraclínico:', error);
    res.status(500).json({ mensaje: 'Error al eliminar el paraclínico' });
  }
};
