import { Response } from 'express';
import Paciente from '../../models/Paciente';
import { AuthRequest } from '../../middleware/auth';
import {
  buildAlimentoEvaluacionKey,
  prefixAlimentoEvaluacionParaPaciente,
  uploadBinaryAndGetUrl
} from '../../utils/s3Documents';
import {
  generarAnalisisAlimentoSimulado,
  PerfilParaEvaluacionAlimento
} from '../../services/nutricion/alimentoEvaluacionSimuladaService';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const subirImagenEvaluacionAlimento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ mensaje: 'Envía una imagen en el campo "imagen"' });
      return;
    }

    const mime = file.mimetype || '';
    if (!ALLOWED.has(mime)) {
      res.status(400).json({ mensaje: 'Solo se permiten imágenes JPG, PNG o WebP' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
    const numeroDoc = paciente?.numeroDocumento || pacienteId;

    const key = buildAlimentoEvaluacionKey(numeroDoc, file.originalname || 'plato.jpg', mime);
    let urlArchivo: string;
    try {
      urlArchivo = await uploadBinaryAndGetUrl(file.buffer, key, mime);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[subirImagenEvaluacionAlimento] S3:', msg);
      res.status(503).json({
        mensaje:
          'No se pudo guardar la imagen. Verifica la configuración del bucket de documentos y las credenciales.'
      });
      return;
    }

    res.status(201).json({
      s3Key: key,
      urlArchivo,
      nombreArchivo: file.originalname || 'imagen',
      tamañoBytes: file.size
    });
  } catch (error) {
    console.error('[subirImagenEvaluacionAlimento]', error);
    res.status(500).json({ mensaje: 'Error al subir la imagen' });
  }
};

export const analizarEvaluacionAlimento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const s3Key = typeof req.body?.s3Key === 'string' ? req.body.s3Key.trim() : '';
    if (!s3Key) {
      res.status(400).json({ mensaje: 'Indica la clave s3Key de la imagen ya subida' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId)
      .select(
        'nombre apellido tipoDocumento numeroDocumento fechaNacimiento sexoBiologico eps zonasDolor'
      )
      .lean();

    if (!paciente) {
      res.status(404).json({ mensaje: 'Paciente no encontrado' });
      return;
    }

    const folderId = paciente.numeroDocumento || pacienteId;
    const prefix = prefixAlimentoEvaluacionParaPaciente(folderId);
    if (!s3Key.startsWith(prefix)) {
      res.status(403).json({ mensaje: 'La imagen no corresponde a tu cuenta o no es una foto de evaluación reciente' });
      return;
    }

    const perfil: PerfilParaEvaluacionAlimento = {
      nombre: paciente.nombre || '',
      apellido: paciente.apellido || '',
      tipoDocumento: paciente.tipoDocumento,
      numeroDocumento: paciente.numeroDocumento,
      fechaNacimiento: paciente.fechaNacimiento
        ? new Date(paciente.fechaNacimiento).toISOString().slice(0, 10)
        : undefined,
      sexoBiologico: paciente.sexoBiologico,
      eps: paciente.eps,
      zonasDolor: paciente.zonasDolor
    };

    const mensajes = generarAnalisisAlimentoSimulado(perfil);

    res.json({
      simulado: true,
      s3Key,
      mensajes
    });
  } catch (error) {
    console.error('[analizarEvaluacionAlimento]', error);
    res.status(500).json({ mensaje: 'Error al procesar el análisis' });
  }
};
