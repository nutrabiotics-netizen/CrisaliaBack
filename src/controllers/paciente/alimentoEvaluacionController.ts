import { Response } from 'express';
import Paciente from '../../models/Paciente';
import EvaluacionAlimento from '../../models/EvaluacionAlimento';
import { AuthRequest } from '../../middleware/auth';
import {
  buildAlimentoEvaluacionKey,
  prefixAlimentoEvaluacionParaPaciente,
  uploadBinaryAndGetUrl,
  getBinaryFromKey
} from '../../utils/s3Documents';
import {
  generarAnalisisAlimentoSimulado,
  PerfilParaEvaluacionAlimento
} from '../../services/nutricion/alimentoEvaluacionSimuladaService';
import {
  analizarAlimentoConBedrock,
  extraerAlimentosConBedrock,
  generarReportePlato,
  AlimentoDetectado,
  NivelConfianza,
} from '../../services/nutricion/alimentoEvaluacionBedrockService';

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

    const [paciente, ultimaFormula, ultimaHC] = await Promise.all([
      Paciente.findById(pacienteId)
        .select('nombre apellido tipoDocumento numeroDocumento fechaNacimiento sexoBiologico eps zonasDolor resumenIA')
        .lean(),
      (async () => {
        try {
          const FormulaMedica = (await import('../../models/FormulaMedica')).default;
          return FormulaMedica.findOne({ pacienteId })
            .sort({ createdAt: -1 })
            .select('medicamentos diagnostico indicaciones')
            .lean();
        } catch { return null; }
      })(),
      (async () => {
        try {
          const HistoriaClinica = (await import('../../models/HistoriaClinica')).default;
          return HistoriaClinica.findOne({ pacienteId })
            .sort({ createdAt: -1 })
            .select('motivoConsulta diagnosticos planTratamiento antecedentes')
            .lean();
        } catch { return null; }
      })()
    ]);

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
      zonasDolor: paciente.zonasDolor,
      resumenIA: (paciente as any).resumenIA?.texto,
      formulaMedica: ultimaFormula ? {
        medicamentos: ((ultimaFormula as any).medicamentos || [])
          .slice(0, 10)
          .map((m: any) => `${m.nombre || m.medicamento || ''} ${m.dosis || ''} ${m.frecuencia || ''}`.trim())
          .filter(Boolean),
        diagnostico: (ultimaFormula as any).diagnostico,
        indicaciones: (ultimaFormula as any).indicaciones
      } : undefined,
      historiaClinica: ultimaHC ? {
        motivoConsulta: (ultimaHC as any).motivoConsulta,
        diagnosticos: (ultimaHC as any).diagnosticos,
        planTratamiento: (ultimaHC as any).planTratamiento,
        antecedentes: (ultimaHC as any).antecedentes
      } : undefined
    };

    // 1) Recuperar la imagen desde S3 para mandársela a Bedrock.
    let mensajes: any[] = [];
    let modeloIA: string | undefined;
    let simulado = false;
    let errorAnalisis: string | undefined;

    console.log('[analizarEvaluacionAlimento] iniciando análisis para paciente:', pacienteId, 's3Key:', s3Key);
    console.log('[analizarEvaluacionAlimento] ENV check → BEDROCK_VISION_MODEL_ID=',
      process.env.BEDROCK_VISION_MODEL_ID || '(usando default)',
      '| BEDROCK_VISION_REGION=', process.env.BEDROCK_VISION_REGION || process.env.AWS_REGION || '(default us-east-1)',
      '| AWS_ACCESS_KEY_ID set?', !!process.env.AWS_ACCESS_KEY_ID);

    try {
      console.log('[analizarEvaluacionAlimento] descargando imagen de S3...');
      const { buffer, contentType } = await getBinaryFromKey(s3Key);
      console.log('[analizarEvaluacionAlimento] imagen obtenida, bytes:', buffer.length, 'contentType:', contentType);
      console.log('[analizarEvaluacionAlimento] invocando Bedrock...');
      const out = await analizarAlimentoConBedrock(buffer, contentType || 'image/jpeg', perfil);
      console.log('[analizarEvaluacionAlimento] Bedrock OK, modelo:', out.modeloIA, 'mensajes:', out.mensajes.length);
      mensajes = out.mensajes;
      modeloIA = out.modeloIA;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : 'UnknownError';
      console.error('[analizarEvaluacionAlimento] ❌ Bedrock falló:', name, '|', msg);
      if (err instanceof Error && err.stack) console.error(err.stack);
      simulado = true;
      errorAnalisis = `${name}: ${msg}`;
      mensajes = generarAnalisisAlimentoSimulado(perfil);
    }

    // 2) Persistir el análisis para historial del paciente.
    const edadCalc = perfil.fechaNacimiento
      ? Math.floor((Date.now() - new Date(perfil.fechaNacimiento).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined;

    const doc = await EvaluacionAlimento.create({
      pacienteId,
      s3Key,
      mensajes: mensajes.map((m: any) => ({
        id: m.id,
        rol: m.rol,
        texto: m.texto,
        creadoEn: m.creadoEn ? new Date(m.creadoEn) : new Date()
      })),
      perfilSnapshot: {
        nombre: perfil.nombre,
        apellido: perfil.apellido,
        fechaNacimiento: perfil.fechaNacimiento ? new Date(perfil.fechaNacimiento) : undefined,
        sexoBiologico: perfil.sexoBiologico,
        eps: perfil.eps,
        zonasDolor: perfil.zonasDolor,
        edadAnios: edadCalc
      },
      modeloIA,
      simulado,
      errorAnalisis
    });

    res.json({
      evaluacionId: String(doc._id),
      simulado,
      modeloIA,
      s3Key,
      mensajes
    });
  } catch (error) {
    console.error('[analizarEvaluacionAlimento]', error);
    res.status(500).json({ mensaje: 'Error al procesar el análisis' });
  }
};

/**
 * POST /api/paciente/alimentos/extraer
 * Recibe el s3Key de una imagen ya subida y devuelve la lista estructurada de
 * alimentos detectados por Bedrock (sin análisis clínico completo).
 * Lo usa el flujo "Confirmar plato" del scan móvil.
 */
export const extraerAlimentosImagen = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
    const folderId = paciente?.numeroDocumento || pacienteId;
    const prefix   = prefixAlimentoEvaluacionParaPaciente(folderId);

    if (!s3Key.startsWith(prefix)) {
      res.status(403).json({ mensaje: 'La imagen no corresponde a tu cuenta' });
      return;
    }

    const { buffer, contentType } = await getBinaryFromKey(s3Key);
    const result = await extraerAlimentosConBedrock(buffer, contentType || 'image/jpeg');

    res.json(result);
  } catch (error) {
    console.error('[extraerAlimentosImagen]', error);
    res.status(500).json({ mensaje: 'Error al extraer los alimentos' });
  }
};

/**
 * GET /api/paciente/alimentos/historial
 * Lista las evaluaciones previas del paciente (más recientes primero).
 */
export const listarHistorialEvaluaciones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const evals = await EvaluacionAlimento.find({ pacienteId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ items: evals });
  } catch (error) {
    console.error('[listarHistorialEvaluaciones]', error);
    res.status(500).json({ mensaje: 'Error al listar el historial' });
  }
};

/**
 * POST /api/paciente/alimentos/reporte
 * Recibe la lista de alimentos confirmados y genera el reporte clínico completo
 * usando el agente de nutrición de Bedrock.
 */
export const generarReportePlatoHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const alimentos: AlimentoDetectado[] = Array.isArray(req.body?.alimentos) ? req.body.alimentos : [];
    const confianza: NivelConfianza      = req.body?.confianza ?? 'media';

    if (alimentos.length === 0) {
      res.status(400).json({ mensaje: 'Envía al menos un alimento en el array "alimentos"' });
      return;
    }

    const [paciente, ultimaFormula, ultimaHC] = await Promise.all([
      Paciente.findById(pacienteId)
        .select('nombre apellido fechaNacimiento sexoBiologico eps zonasDolor resumenIA')
        .lean(),
      (async () => {
        try {
          const FormulaMedica = (await import('../../models/FormulaMedica')).default;
          return FormulaMedica.findOne({ pacienteId }).sort({ createdAt: -1 })
            .select('medicamentos diagnostico indicaciones').lean();
        } catch { return null; }
      })(),
      (async () => {
        try {
          const HistoriaClinica = (await import('../../models/HistoriaClinica')).default;
          return HistoriaClinica.findOne({ pacienteId }).sort({ createdAt: -1 })
            .select('motivoConsulta diagnosticos planTratamiento antecedentes').lean();
        } catch { return null; }
      })(),
    ]);

    if (!paciente) { res.status(404).json({ mensaje: 'Paciente no encontrado' }); return; }

    const perfil = {
      nombre:         (paciente as any).nombre  || '',
      apellido:       (paciente as any).apellido || '',
      fechaNacimiento:(paciente as any).fechaNacimiento
        ? new Date((paciente as any).fechaNacimiento).toISOString().slice(0, 10)
        : undefined,
      sexoBiologico:  (paciente as any).sexoBiologico,
      eps:            (paciente as any).eps,
      zonasDolor:     (paciente as any).zonasDolor,
      resumenIA:      (paciente as any).resumenIA?.texto,
      formulaMedica:  ultimaFormula ? {
        medicamentos: ((ultimaFormula as any).medicamentos || [])
          .slice(0, 10)
          .map((m: any) => `${m.nombre || m.medicamento || ''} ${m.dosis || ''} ${m.frecuencia || ''}`.trim())
          .filter(Boolean),
        diagnostico:  (ultimaFormula as any).diagnostico,
        indicaciones: (ultimaFormula as any).indicaciones,
      } : undefined,
      historiaClinica: ultimaHC ? {
        motivoConsulta:  (ultimaHC as any).motivoConsulta,
        diagnosticos:    (ultimaHC as any).diagnosticos,
        planTratamiento: (ultimaHC as any).planTratamiento,
        antecedentes:    (ultimaHC as any).antecedentes,
      } : undefined,
    };

    const reporte = await generarReportePlato(alimentos, confianza, perfil);
    res.json(reporte);
  } catch (error) {
    console.error('[generarReportePlatoHandler]', error);
    res.status(500).json({ mensaje: 'Error al generar el reporte' });
  }
};

/**
 * GET /api/paciente/alimentos/:id
 * Devuelve una evaluación completa por ID (solo del paciente autenticado).
 */
export const obtenerEvaluacionPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const doc = await EvaluacionAlimento.findOne({ _id: req.params.id, pacienteId }).lean();
    if (!doc) { res.status(404).json({ mensaje: 'Evaluación no encontrada' }); return; }

    res.json({ success: true, data: doc });
  } catch (error) {
    console.error('[obtenerEvaluacionPorId]', error);
    res.status(500).json({ mensaje: 'Error al obtener la evaluación' });
  }
};

/**
 * POST /api/paciente/alimentos/guardar
 * Persiste el reporte completo del scan móvil en EvaluacionAlimento.
 */
export const guardarReportePlato = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) { res.status(401).json({ mensaje: 'No autorizado' }); return; }

    const { s3Key, urlArchivo, alimentos, nota, reporte } = req.body ?? {};

    if (!s3Key) {
      res.status(400).json({ mensaje: 'Falta s3Key' });
      return;
    }

    const doc = await EvaluacionAlimento.create({
      pacienteId,
      s3Key,
      urlArchivo,
      mensajes: [],
      alimentosConfirmados: Array.isArray(alimentos) ? alimentos : [],
      nota:    typeof nota === 'string' ? nota.trim() : undefined,
      reporte: reporte ?? undefined,
      fuente:  'scan_movil',
      simulado: reporte?.simulado ?? false,
    });

    res.status(201).json({ success: true, evaluacionId: String(doc._id) });
  } catch (error) {
    console.error('[guardarReportePlato]', error);
    res.status(500).json({ mensaje: 'Error al guardar el reporte' });
  }
};
