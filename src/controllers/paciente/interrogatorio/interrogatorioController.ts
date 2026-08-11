import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import interrogatorioService from '../../../services/paciente/interrogatorio/interrogatorioService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import Interrogatorio from '../../../models/Interrogatorio';
import { AIService } from '../../../services/ai/AIService';
import {
  cargarSecciones,
  cargarIndex,
  calcularScores,
  consultarSiguientePaso,
  generarSintesis as generarSintesisOrchestrator,
} from '../../../services/ai/anamnesisOrchestratorService';

export const crearInterrogatorio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { tipo } = req.body;

    // Verificar si ya existe un interrogatorio activo del mismo tipo
    const interrogatorioActivo = await interrogatorioService.obtenerInterrogatorioActivo(
      pacienteId,
      tipo || 'primera_vez'
    );

    if (interrogatorioActivo) {
      res.status(400).json({
        success: false,
        message: 'Ya existe un interrogatorio en proceso',
        data: {
          _id: interrogatorioActivo._id?.toString(),
          estado: interrogatorioActivo.estado,
          progreso: interrogatorioActivo.progreso
        }
      });
      return;
    }

    const interrogatorio = await interrogatorioService.crearInterrogatorio({
      pacienteId,
      tipo: tipo || 'primera_vez',
      creadoPor: pacienteId,
      creadoPorRol: 'Paciente'
    });

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'Interrogatorio',
      interrogatorio._id.toString(),
      undefined,
      {
        pacienteId: interrogatorio.pacienteId.toString(),
        tipo: interrogatorio.tipo,
        estado: interrogatorio.estado
      }
    );

    res.status(201).json({
      success: true,
      message: 'Interrogatorio creado exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        pacienteId: interrogatorio.pacienteId.toString(),
        tipo: interrogatorio.tipo,
        estado: interrogatorio.estado,
        progreso: interrogatorio.progreso,
        respuestas: interrogatorio.respuestas,
        createdAt: interrogatorio.createdAt,
        updatedAt: interrogatorio.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error al crear interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear interrogatorio',
      error: error.message
    });
  }
};

export const obtenerInterrogatorios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { tipo, estado } = req.query;

    const interrogatorios = await interrogatorioService.obtenerInterrogatoriosPaciente(
      pacienteId,
      tipo as any,
      estado as any
    );

    res.json({
      success: true,
      data: interrogatorios.map(i => ({
        _id: i._id?.toString(),
        tipo: i.tipo,
        estado: i.estado,
        progreso: i.progreso,
        analisisIA: i.analisisIA,
        respuestas: i.respuestas,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt
      }))
    });
  } catch (error: any) {
    console.error('Error al obtener interrogatorios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interrogatorios',
      error: error.message
    });
  }
};

export const obtenerInterrogatorioPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interrogatorio = await interrogatorioService.obtenerInterrogatorioPorId(
      interrogatorioId as string,
      pacienteId
    );

    if (!interrogatorio) {
      res.status(404).json({
        success: false,
        message: 'Interrogatorio no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: interrogatorio._id?.toString(),
        pacienteId: interrogatorio.pacienteId.toString(),
        tipo: interrogatorio.tipo,
        estado: interrogatorio.estado,
        progreso: interrogatorio.progreso,
        respuestas: interrogatorio.respuestas,
        observacionesIA: interrogatorio.observacionesIA,
        analisisIA: interrogatorio.analisisIA,
        objetivos: interrogatorio.objetivos,
        createdAt: interrogatorio.createdAt,
        updatedAt: interrogatorio.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error al obtener interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interrogatorio',
      error: error.message
    });
  }
};

export const verificarIncoherencias = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;
    const { mapaCorporal, respuestas } = req.body;

    if (!pacienteId || !interrogatorioId) {
      res.status(400).json({ success: false, message: 'Faltan parámetros' });
      return;
    }

    const incoherencias = await AIService.detectarIncoherencias(mapaCorporal, respuestas);

    res.json({
      success: true,
      data: { incoherencias }
    });
  } catch (error: any) {
    console.error('Error al verificar incoherencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error en la verificación de IA',
      error: error.message
    });
  }
};

export const actualizarRespuestas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;
    const { respuestas, historialNuevo } = req.body;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    if (!respuestas || typeof respuestas !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Las respuestas son requeridas y deben ser un objeto'
      });
      return;
    }

    // Si vienen entradas nuevas al historial, las añadimos a historialChat
    let respuestasConHistorial = { ...respuestas };
    if (Array.isArray(historialNuevo) && historialNuevo.length > 0) {
      const interrogatorioActual = await Interrogatorio.findById(interrogatorioId).lean() as any;
      const historialExistente: any[] = interrogatorioActual?.respuestas?.historialChat ?? [];
      respuestasConHistorial.historialChat = [...historialExistente, ...historialNuevo];
    }

    // Obtener interrogatorio anterior para auditoría
    const interrogatorioAnterior = await Interrogatorio.findById(interrogatorioId).lean();
    if (!interrogatorioAnterior) {
      res.status(404).json({
        success: false,
        message: 'Interrogatorio no encontrado'
      });
      return;
    }

    const datosAnteriores = {
      respuestas: interrogatorioAnterior.respuestas,
      progreso: interrogatorioAnterior.progreso,
      estado: interrogatorioAnterior.estado
    };

    const interrogatorio = await interrogatorioService.actualizarRespuestas(
      interrogatorioId as string,
      pacienteId,
      {
        respuestas: respuestasConHistorial,
        actualizadoPor: pacienteId,
        actualizadoPorRol: 'Paciente'
      }
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'Interrogatorio',
      interrogatorioId as string,
      datosAnteriores,
      {
        respuestas: interrogatorio.respuestas,
        progreso: interrogatorio.progreso,
        estado: interrogatorio.estado
      }
    );

    res.json({
      success: true,
      message: 'Respuestas actualizadas exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        progreso: interrogatorio.progreso,
        estado: interrogatorio.estado,
        respuestas: interrogatorio.respuestas
      }
    });
  } catch (error: any) {
    console.error('Error al actualizar respuestas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar respuestas',
      error: error.message
    });
  }
};

export const completarInterrogatorio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interrogatorio = await interrogatorioService.completarInterrogatorio(
      interrogatorioId as string,
      pacienteId
    );

    res.json({
      success: true,
      message: 'Interrogatorio completado exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        estado: interrogatorio.estado,
        analisisIA: interrogatorio.analisisIA,
        objetivos: interrogatorio.objetivos
      }
    });
  } catch (error: any) {
    console.error('Error al completar interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al completar interrogatorio',
      error: error.message
    });
  }
};

// ─── Flujo orquestado por Bedrock Agent ──────────────────────────────────────

/**
 * POST /paciente/interrogatorio/:interrogatorioId/siguiente-seccion
 *
 * Consulta al Agent orquestador qué secciones del cuestionario debe hacer
 * el paciente a continuación, según el síntoma inicial y las respuestas ya guardadas.
 *
 * Body: { sintomaInicial: string }
 *
 * Respuesta:
 *   - accion: "entrevistar" → secciones[] + estructura JSON de cada sección
 *   - accion: "generar_s37" → indicación de que ya se puede generar la síntesis
 *   - accion: "alerta_medica" → bandera roja detectada, suspender entrevista
 */
export const siguienteSeccion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId           = req.userId!;
    const { interrogatorioId } = req.params;
    const { sintomaInicial }   = req.body;

    if (!sintomaInicial || typeof sintomaInicial !== 'string') {
      res.status(400).json({ success: false, message: 'El campo sintomaInicial es requerido.' });
      return;
    }

    const interrogatorio = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId }).lean();
    if (!interrogatorio) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado.' });
      return;
    }

    const index  = cargarIndex();
    const scores = calcularScores(interrogatorio.respuestas || {}, index.sections);

    // Secciones ya completadas = tienen al menos 1 respuesta guardada
    const respuestas           = interrogatorio.respuestas || {};
    const seccionesCompletadas = index.sections
      .filter((s: any) => {
        const seccion = cargarSecciones([s.id])[s.id];
        if (!seccion?.questions) return false;
        return seccion.questions.some((q: any) => {
          if (q.type === 'symptom_table') return q.items?.some((i: any) => respuestas[i.id] !== undefined);
          return respuestas[q.id] !== undefined;
        });
      })
      .map((s: any) => s.id);

    const medicacionActual = respuestas['s06_detalle']
      ? JSON.stringify(respuestas['s06_detalle'])
      : undefined;

    const decision = await consultarSiguientePaso(
      { sintomaInicial, seccionesCompletadas, scores, medicacionActual },
      { sessionId: `interrogatorio-${interrogatorioId}` }
    );

    let seccionesEstructura: Record<string, any> = {};
    if (decision.accion === 'entrevistar') {
      seccionesEstructura = cargarSecciones(decision.secciones);
    }

    res.json({
      success: true,
      data: {
        decision,
        seccionesEstructura,
        scores: {
          rojas:     scores.seccRojas,
          amarillas: scores.seccAmarillas,
          criticos:  scores.itemsCriticos.slice(0, 20),
        },
      },
    });
  } catch (err: any) {
    console.error('[siguienteSeccion] error:', err);
    res.status(500).json({ success: false, message: 'Error al consultar al agente de anamnesis.', error: err.message });
  }
};

/**
 * POST /paciente/interrogatorio/:interrogatorioId/generar-sintesis
 *
 * Genera la síntesis funcional completa (Sección 37).
 * Guarda el resultado en analisisFisiologicoIA y recomendacionAutomatica.
 *
 * Body: { sintomaInicial: string }
 */
export const generarSintesis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId           = req.userId!;
    const { interrogatorioId } = req.params;
    const { sintomaInicial, sintesisAgent } = req.body;

    if (!sintomaInicial || typeof sintomaInicial !== 'string') {
      res.status(400).json({ success: false, message: 'El campo sintomaInicial es requerido.' });
      return;
    }

    const interrogatorio = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId });
    if (!interrogatorio) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado.' });
      return;
    }

    const index  = cargarIndex();
    const scores = calcularScores(interrogatorio.respuestas || {}, index.sections);

    // Si el frontend ya envió la síntesis del Agent, usarla directamente sin volver a invocar Bedrock
    let sintesis: any;
    if (sintesisAgent && sintesisAgent.disfunciones_probables) {
      console.log('[generarSintesis] Usando síntesis del Agent enviada por el frontend');
      sintesis = sintesisAgent;
    } else {
      const medicacionActual = interrogatorio.respuestas?.['s06_detalle']
        ? JSON.stringify(interrogatorio.respuestas['s06_detalle'])
        : '';
      sintesis = await generarSintesisOrchestrator(
        interrogatorio.respuestas || {},
        scores,
        sintomaInicial,
        medicacionActual,
        { sessionId: `interrogatorio-${interrogatorioId}` }
      );
    }

    interrogatorio.analisisFisiologicoIA  = sintesis.disfunciones_probables;
    interrogatorio.recomendacionAutomatica = {
      semaforizacion:         Object.values(scores.porSeccion),
      recomendacionesOTC:     sintesis.disfunciones_probables.flatMap((d: any) => d.productos),
      estiloVida:             [],
      estrategiasFuncionales: sintesis.disfunciones_probables,
      llamadoAccion:          sintesis.nota_medico || '',
      generadoEn:             new Date(),
    };
    // No marcar como completado aquí — se completa cuando el paciente confirma el resumen
    interrogatorio.estado   = 'en_proceso';
    interrogatorio.progreso = 100;
    await interrogatorio.save();

    await registrarAccion(
      req,
      'actualizar',
      'Interrogatorio',
      String(interrogatorioId),
      undefined,
      { accion: 'generar_sintesis', disfuncionesCount: sintesis.disfunciones_probables.length }
    );

    res.json({
      success: true,
      message: 'Síntesis funcional generada exitosamente.',
      data: {
        _id:                     interrogatorio._id.toString(),
        analisisFisiologicoIA:   sintesis.disfunciones_probables,
        paraclinicos:            sintesis.disfunciones_a_descartar_con_paraclinicos,
        ordenAbordaje:           sintesis.orden_abordaje,
        notaMedico:              sintesis.nota_medico,
        banderasRojas:           sintesis.banderas_rojas,
        recomendacionAutomatica: interrogatorio.recomendacionAutomatica,
      },
    });
  } catch (err: any) {
    console.error('[generarSintesis] error:', err);
    res.status(500).json({ success: false, message: 'Error al generar la síntesis funcional.', error: err.message });
  }
};

export const generarAnalisisIA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interrogatorio = await interrogatorioService.generarAnalisisIA(
      interrogatorioId as string,
      pacienteId
    );

    res.json({
      success: true,
      message: 'Análisis IA generado exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        analisisIA: interrogatorio.analisisIA,
        objetivos: interrogatorio.objetivos,
        observacionesIA: interrogatorio.observacionesIA
      }
    });
  } catch (error: any) {
    console.error('Error al generar análisis IA:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar análisis IA',
      error: error.message
    });
  }
};
