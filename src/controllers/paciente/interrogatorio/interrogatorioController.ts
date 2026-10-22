import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import interrogatorioService from '../../../services/paciente/interrogatorio/interrogatorioService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import Interrogatorio from '../../../models/Interrogatorio';
import { AIService } from '../../../services/ai/AIService';
import { calcularProgresoFase1 } from '../../../services/ai/fase1Flow';
import { guardarRDAInicial } from '../../../services/paciente/registroRDAInicialService';
import { cancelarPreparacionFase2, responderFase2 } from '../fase2Controller';
import { filtroGeneracionFase2, solicitudDeGeneracionActual } from '../../../services/paciente/reinicioFase2Flow';

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
        fase1: interrogatorio.fase1 ? { estado: interrogatorio.fase1.estado, version: interrogatorio.fase1.version, preguntaId: interrogatorio.fase1.preguntaId } : undefined,
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

    // Recuperar la sincronización pendiente de la entrevista más reciente.
    const reciente = [...interrogatorios].filter(i => i.tipo === 'primera_vez' && i.fase1)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (reciente) await guardarRDAInicial(reciente);

    res.json({
      success: true,
      data: interrogatorios.map(i => ({
        _id: i._id?.toString(),
        tipo: i.tipo,
        estado: i.estado,
        progreso: i.progreso,
        analisisIA: i.analisisIA,
        respuestas: i.respuestas,
        fase1: i.fase1,
        fase2: i.fase2,
        fase2Generacion: i.fase2Generacion || 0,
        progresoFase1: i.fase1 ? calcularProgresoFase1(i.fase1, i.respuestas || {}) : undefined,
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
        fase1: interrogatorio.fase1 ? { estado: interrogatorio.fase1.estado, version: interrogatorio.fase1.version, preguntaId: interrogatorio.fase1.preguntaId } : undefined,
        observacionesIA: interrogatorio.observacionesIA,
        analisisIA: interrogatorio.analisisIA,
        historiaClinica: (interrogatorio as any).historiaClinica,
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
        fase1: interrogatorio.fase1 ? { estado: interrogatorio.fase1.estado, version: interrogatorio.fase1.version, preguntaId: interrogatorio.fase1.preguntaId } : undefined,
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
  if (!req.userId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
  const doc = await Interrogatorio.findOne({ _id: req.params.interrogatorioId, pacienteId: req.userId }).lean();
  if (doc?.tipo === 'control') {
    try {
      const resultado = await interrogatorioService.completarInterrogatorio(String(req.params.interrogatorioId), req.userId,
        req.body?.analisisIA, req.body?.objetivos, req.body?.alertaMedica);
      res.json({ success: true, data: { _id: resultado._id.toString(), estado: resultado.estado, analisisIA: resultado.analisisIA, objetivos: resultado.objetivos } });
    } catch { res.status(500).json({ success: false, message: 'No se pudo completar el control.' }); }
    return;
  }
  req.body = { ...req.body, interrogatorioId: String(req.params.interrogatorioId), accion: 'confirmar' };
  await responderFase2(req, res);
};

export const siguienteSeccion = async (req: AuthRequest, res: Response): Promise<void> => {
  req.body = { ...req.body, interrogatorioId: String(req.params.interrogatorioId), accion: 'continuar' };
  await responderFase2(req, res);
};

export const generarSintesis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await Interrogatorio.findOne({ _id: req.params.interrogatorioId, pacienteId: req.userId }).lean();
    if (!doc) { res.status(404).json({ success: false, message: 'Interrogatorio no encontrado.' }); return; }
    if (!doc.fase2 || !['resumen', 'confirmada'].includes(doc.fase2.estado) || doc.fase2.decision?.accion !== 'generar_s37') {
      res.status(409).json({ success: false, message: 'El Agent todavía no ha generado el informe de esta entrevista.' }); return;
    }
    res.json({ success: true, data: { _id: doc._id.toString(), analisisFisiologicoIA: doc.analisisFisiologicoIA,
      recomendacionAutomatica: doc.recomendacionAutomatica, resumenPaciente: doc.fase2.resumenPaciente,
      paraclinicos: doc.fase2.decision.disfunciones_a_descartar_con_paraclinicos, ordenAbordaje: doc.fase2.decision.orden_abordaje } });
  } catch (err: any) { res.status(500).json({ success: false, message: 'No se pudo recuperar el informe guardado.' }); }
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
        historiaClinica: (interrogatorio as any).historiaClinica,
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

// ─── POST /:id/perfil-radar ───────────────────────────────────────────────────
// Llama al Crisal Agent en background para generar el perfil de radar de
// disfunciones a partir de las respuestas s01 y s03. Guarda el resultado en
// el interrogatorio. Fire-and-forget desde el frontend.
/**
 * POST /paciente/interrogatorio/:interrogatorioId/paraclinicos-ocr
 * Recibe los ocrValores de los paraclinicos subidos y los guarda en
 * interrogatorio.respuestas.examenes_paraclinicos para que el Agent los use.
 */
export const agregarParaclinicosOcr = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;
    const { interrogatorioId } = req.params;
    const { paraclinicos, reemplazarPreparacion } = req.body as {
      reemplazarPreparacion?: boolean;
      paraclinicos: Array<{ nombre: string; ocrValores: Array<{ nombre: string; valor: string; unidad?: string; referencia?: string }> }>;
    };

    if (!Array.isArray(paraclinicos) || paraclinicos.length === 0 || paraclinicos.length > 30 || paraclinicos.some(p =>
      !p || typeof p.nombre !== 'string' || !p.nombre.trim() || p.nombre.length > 255 || !Array.isArray(p.ocrValores) || p.ocrValores.length > 1000 ||
      p.ocrValores.some(v => !v || typeof v.nombre !== 'string' || v.nombre.length > 255 || !['string', 'number'].includes(typeof v.valor)))) {
      res.status(400).json({ success: false, message: 'paraclinicos requerido' });
      return;
    }

    for (let intento = 0; intento < 3; intento++) {
      const interrogatorio = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId }).lean();
      if (!interrogatorio) {
        res.status(404).json({ success: false, message: 'Interrogatorio no encontrado.' });
        return;
      }

      if (interrogatorio.fase2Reinicio?.pendiente || !solicitudDeGeneracionActual(interrogatorio, req.body.generacion)) {
        res.status(409).json({ success: false, message: 'La entrevista fue reiniciada o tiene un reinicio pendiente. Recarga la página.' }); return;
      }

      const preparacionActiva = interrogatorio.fase2Operacion?.preparandoExamenes === true;
      if (interrogatorio.estado === 'completado' || (!interrogatorio.fase2?.examenesPendientes && ['resumen', 'confirmada', 'alerta'].includes(interrogatorio.fase2?.estado || ''))) {
        res.status(409).json({ success: false, message: 'La entrevista ya tiene un informe. No se pueden añadir resultados sin una nueva valoración.' }); return;
      }
      // Guardar por archivo: cada entrada tiene nombre del archivo + sus valores OCR
      const examenesOcr = paraclinicos
        .map(p => ({
          archivo: p.nombre,
          valores: (p.ocrValores || []).filter(v => v.nombre || v.valor),
        }))
        .filter(p => p.valores.length > 0);
      if (!examenesOcr.length) { res.status(400).json({ success: false, message: 'No hay resultados que guardar.' }); return; }

      // Merge con los archivos ya guardados (evita pisar subidas anteriores)
      const previos: typeof examenesOcr = interrogatorio.respuestas?.examenes_paraclinicos || [];
      const archivosNuevos = new Set(examenesOcr.map(e => e.archivo));
      const merged = [...previos.filter((p: any) => !archivosNuevos.has(p.archivo)), ...examenesOcr];
      const campos: Record<string, any> = { 'respuestas.examenes_paraclinicos': merged };
      const eliminar: Record<string, 1> = {};
      const prepararConResultados = reemplazarPreparacion === true && !interrogatorio.fase2 && interrogatorio.fase1?.confirmada;
      if ((interrogatorio.fase2?.examenesPendientes || preparacionActiva || prepararConResultados) && JSON.stringify(previos) !== JSON.stringify(merged)) {
        // La primera decisión anticipada ya no tiene todo el contexto: el Agent debe revisarla.
        const inicial = interrogatorio.fase2 || { version: 0, estado: 'decidiendo' as const, ronda: 0,
          preguntas: [], preguntaId: null, respondidas: [], historial: [], turnos: [], progreso: interrogatorio.progreso || 0 };
        const fase2 = { ...inicial, examenesPendientes: true, version: inicial.version + 1,
          estado: 'decidiendo' as const, preguntaId: null, preguntas: [], turnos: [], progreso: Math.min(95, inicial.progreso) };
        delete fase2.decision; delete fase2.resumenPaciente;
        fase2.ultimaRespuesta = { interrogatorioId, fase2Version: fase2.version, fase2Estado: 'decidiendo',
          questionId: null, guardado: true, examenesPendientes: true, progreso: fase2.progreso, finRonda: true };
        campos.fase2 = fase2; campos.progreso = fase2.progreso;
        Object.assign(eliminar, { analisisFisiologicoIA: 1, recomendacionAutomatica: 1, alertaMedica: 1 });
      }
      if (preparacionActiva) eliminar.fase2Operacion = 1;

      const guardado = await Interrogatorio.findOneAndUpdate({ _id: interrogatorioId, pacienteId, estado: { $ne: 'completado' },
        ...filtroGeneracionFase2(interrogatorio), 'fase2Reinicio.pendiente': { $ne: true },
        ...(preparacionActiva ? { 'fase2Operacion.token': interrogatorio.fase2Operacion!.token } : { fase2Operacion: { $exists: false } }),
        ...(interrogatorio.fase2 ? { 'fase2.version': interrogatorio.fase2.version } : { fase2: { $exists: false } }), updatedAt: interrogatorio.updatedAt },
        { $set: campos, ...(Object.keys(eliminar).length ? { $unset: eliminar } : {}) }, { new: true }).lean();
      if (!guardado) continue;
      if (preparacionActiva) cancelarPreparacionFase2(interrogatorio.fase2Operacion!.token);

      const totalValores = examenesOcr.reduce((sum, p) => sum + p.valores.length, 0);
      console.log('[paraclinicosOcr] Guardados', examenesOcr.length, 'archivos,', totalValores, 'valores OCR para interrogatorio', interrogatorioId);

      res.json({ success: true, data: { valoresGuardados: examenesOcr.length,
        ...(guardado.fase2 ? { fase2Version: guardado.fase2.version, questionId: guardado.fase2.preguntaId } : {}) } });
      return;
    }
    res.status(409).json({ success: false, message: 'La entrevista está cambiando. Reintenta guardar los resultados.' });
  } catch (err: any) {
    console.error('[paraclinicosOcr] error:', err.message);
    res.status(500).json({ success: false, message: 'Error al guardar paraclínicos.' });
  }
};

export const generarPerfilRadarInterrogatorio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;
    const { interrogatorioId } = req.params;

    const interrogatorio = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId });
    if (!interrogatorio) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado.' });
      return;
    }

    // El cierre de fase 2 envía su generación; una petición tardía no inicia un radar tras reiniciar.
    if (req.body?.generacion !== undefined && (!solicitudDeGeneracionActual(interrogatorio, req.body.generacion)
      || interrogatorio.fase2Reinicio?.pendiente || interrogatorio.fase2?.estado !== 'confirmada'
      || interrogatorio.estado !== 'completado')) {
      res.status(409).json({ success: false, message: 'La fase 2 debe estar confirmada y corresponder al intento actual.' });
      return;
    }

    // Responder inmediatamente — el proceso continúa en background
    res.json({ success: true, message: 'Generando perfil de radar en background.' });

    // Separar respuestas por sección
    const respuestas = interrogatorio.respuestas || {};
    const respuestasS01: Record<string, any> = {};
    const respuestasS03: Record<string, any> = {};

    Object.entries(respuestas).forEach(([k, v]) => {
      if (k.startsWith('s01_')) respuestasS01[k] = v;
      else if (k.startsWith('s03_')) respuestasS03[k] = v;
    });

    // Fallback: si no hay campos s03_*, buscar campos sin prefijo (IDs antiguos de Claude)
    if (Object.keys(respuestasS03).length === 0) {
      const FALLBACK_MAP: Record<string, string> = {
        sintoma_principal:      's03_sintoma_principal',
        zona_dolor:             's03_zona_dolor',
        intensidad:             's03_intensidad',
        frecuencia_semanal:     's03_frecuencia',
        hora_agravamiento:      's03_hora_agravacion',
        tiempo_evolucion:       's03_duracion',
        factores_agravantes:    's03_factores_agravantes',
        factores_aliviantes:    's03_factores_aliviantes',
        limitacion_vida_diaria: 's03_limitacion',
        epoca_bienestar:        's03_ultima_vez_bien',
        habitos_bienestar:      's03_que_hacias_bien',
        eventos_coincidentes:   's03_evento_inicio',
        objetivo_principal:     's03_objetivo_a',
        objetivos_secundarios:  's03_objetivo_b',
        disposicion_cambios:    's03_disposicion',
        examenes_disponibles:   's03_examenes_previos',
      };
      Object.entries(respuestas).forEach(([k, v]) => {
        const mapped = FALLBACK_MAP[k];
        if (mapped) respuestasS03[mapped] = v;
      });
      if (Object.keys(respuestasS03).length > 0) {
        console.log('[perfilRadar] Fallback s03 aplicado — campos sin prefijo mapeados:', Object.keys(respuestasS03));
      }
    }

    // Si el interrogatorio tiene secciones más allá de s03 (fase 2 completa),
    // pasar todas las respuestas para un análisis más completo
    const tieneDataFase2 = Object.keys(respuestas).some(k =>
      /^s(0[4-9]|[1-9]\d)_/.test(k)
    );

    // Importar dinámicamente para no bloquear
    const { generarPerfilRadar } = await import('../../../services/ai/crisaliaAgentService');

    const { textoAnalisis, perfilRadar } = await generarPerfilRadar({
      respuestasS01,
      respuestasS03,
      respuestasCompletas: tieneDataFase2 ? respuestas : undefined,
      interrogatorioId: String(interrogatorioId),
      timeoutMs: 300000, // 5 minutos
    });

    // Guardar en el interrogatorio
    const radarGuardado = {
      textoAnalisis,
      json: perfilRadar,
      generadoEn: new Date(),
    };
    await Interrogatorio.findOneAndUpdate({ _id: interrogatorio._id, pacienteId, ...filtroGeneracionFase2(interrogatorio),
      'fase2Reinicio.pendiente': { $ne: true } }, { $set: { perfilRadar: radarGuardado } });

    console.log('[perfilRadar] Guardado para interrogatorio', interrogatorioId,
      '| ejes:', perfilRadar?.ejes?.length ?? 0);

  } catch (error: any) {
    console.error('[perfilRadar] Error:', error.message);
    // No propagar — la respuesta ya fue enviada
  }
};
