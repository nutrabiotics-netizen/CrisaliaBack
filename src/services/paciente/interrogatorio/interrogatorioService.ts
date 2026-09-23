import Interrogatorio, { IInterrogatorio } from '../../../models/Interrogatorio';
import openaiService from '../../openai/openaiService';
import { AIService } from '../../ai/AIService';
import { notificarMedicoProgresoAnamnesis } from '../../notifications/medicoNotificacionService';

export interface RespuestaInterrogatorio {
  preguntaId: string;
  respuesta: any;
  observaciones?: string;
}

export interface CrearInterrogatorioData {
  pacienteId: string;
  tipo?: 'primera_vez' | 'control';
  creadoPor?: string;
  creadoPorRol?: string;
}

export interface ActualizarRespuestasData {
  respuestas: Record<string, any>;
  actualizadoPor?: string;
  actualizadoPorRol?: string;
}

class InterrogatorioService {
  async crearInterrogatorio(data: CrearInterrogatorioData): Promise<IInterrogatorio> {
    const interrogatorio = await Interrogatorio.create({
      pacienteId: data.pacienteId,
      tipo: data.tipo || 'primera_vez',
      estado: 'en_proceso',
      progreso: 0,
      respuestas: {},
      creadoPor: data.creadoPor ? data.pacienteId : undefined,
      creadoPorRol: data.creadoPorRol || 'Paciente'
    });

    return interrogatorio;
  }

  async obtenerInterrogatorioPorId(interrogatorioId: string, pacienteId: string): Promise<IInterrogatorio | null> {
    const interrogatorio = await Interrogatorio.findOne({
      _id: interrogatorioId,
      pacienteId
    }).lean();

    return interrogatorio as IInterrogatorio | null;
  }

  async obtenerInterrogatoriosPaciente(
    pacienteId: string,
    tipo?: 'primera_vez' | 'control',
    estado?: 'en_proceso' | 'completado' | 'pendiente'
  ): Promise<IInterrogatorio[]> {
    const query: any = { pacienteId };
    
    if (tipo) {
      query.tipo = tipo;
    }
    
    if (estado) {
      query.estado = estado;
    }

    const interrogatorios = await Interrogatorio.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return interrogatorios as unknown as IInterrogatorio[];
  }

  async obtenerInterrogatorioActivo(pacienteId: string, tipo?: 'primera_vez' | 'control'): Promise<IInterrogatorio | null> {
    const query: any = {
      pacienteId,
      estado: { $in: ['en_proceso', 'pendiente'] }
    };

    if (tipo) {
      query.tipo = tipo;
    }

    const interrogatorio = await Interrogatorio.findOne(query)
      .sort({ createdAt: -1 })
      .lean();

    return interrogatorio as IInterrogatorio | null;
  }

  async actualizarRespuestas(
    interrogatorioId: string,
    pacienteId: string,
    data: ActualizarRespuestasData
  ): Promise<IInterrogatorio> {
    const interrogatorio = await Interrogatorio.findOne({
      _id: interrogatorioId,
      pacienteId
    });

    if (!interrogatorio) {
      throw new Error('Interrogatorio no encontrado');
    }

    // Actualizar respuestas
    interrogatorio.respuestas = {
      ...interrogatorio.respuestas,
      ...data.respuestas
    };

    // Calcular progreso basado en el número de respuestas
    const totalPreguntas = this.obtenerTotalPreguntas(interrogatorio.tipo);
    const respuestasCompletadas = Object.keys(interrogatorio.respuestas).length;
    interrogatorio.progreso = Math.min(100, Math.round((respuestasCompletadas / totalPreguntas) * 100));

    // Actualizar estado si está completo
    const progresoAnterior = interrogatorio.progreso;
    if (interrogatorio.progreso === 100) {
      interrogatorio.estado = 'completado';
    } else if (interrogatorio.estado === 'pendiente') {
      interrogatorio.estado = 'en_proceso';
    }

    // Actualizar campos de auditoría
    if (data.actualizadoPor) {
      interrogatorio.actualizadoPor = interrogatorio.pacienteId;
      interrogatorio.actualizadoPorRol = data.actualizadoPorRol || 'Paciente';
    }

    await interrogatorio.save();

    // Notificación proactiva al médico en umbrales 50% y 100%
    const nuevoProgreso = interrogatorio.progreso;
    const cruzaUmbral = (umbral: number) =>
      progresoAnterior < umbral && nuevoProgreso >= umbral;

    if (cruzaUmbral(50) || cruzaUmbral(100)) {
      notificarMedicoProgresoAnamnesis(
        String(interrogatorio.pacienteId),
        nuevoProgreso
      ).catch((e) => console.warn('[Interrogatorio] notifMedico error (no crítico):', e));
    }

    return interrogatorio;
  }

  async completarInterrogatorio(
    interrogatorioId: string,
    pacienteId: string,
    analisisIA?: string,
    objetivos?: string[],
    alertaMedica?: { motivo: string; instruccion: string; mensajeUrgencias: string; banderasRojas: string[] }
  ): Promise<IInterrogatorio> {
    const interrogatorio = await Interrogatorio.findOne({
      _id: interrogatorioId,
      pacienteId
    });

    if (!interrogatorio) {
      throw new Error('Interrogatorio no encontrado');
    }

    // Marcar completado inmediatamente para que el dashboard no muestre "Completar Preconsulta"
    // mientras OpenAI sigue procesando en segundo plano
    interrogatorio.estado   = 'completado';
    interrogatorio.progreso = 100;

    if (alertaMedica) {
      interrogatorio.alertaMedica = { ...alertaMedica, registradoEn: new Date() };
      interrogatorio.markModified('alertaMedica');
    }

    // Usar valores proporcionados si existen
    if (analisisIA) interrogatorio.analisisIA = analisisIA;
    if (objetivos && objetivos.length > 0) interrogatorio.objetivos = objetivos;

    await interrogatorio.save();

    // Generar análisis IA en segundo plano (no bloquea la respuesta al cliente)
    if (!analisisIA && Object.keys(interrogatorio.respuestas).length > 0) {
      openaiService.analizarInterrogatorio(
        interrogatorio.respuestas,
        {
          disfuncionesAgent: interrogatorio.analisisFisiologicoIA,
          notaMedico: (interrogatorio.recomendacionAutomatica as any)?.llamadoAccion,
          ordenAbordaje: (interrogatorio.recomendacionAutomatica as any)?.estrategiasFuncionales,
        }
      ).then(async (analisis) => {
        try {
          const update: Record<string, any> = {
            analisisIA:    analisis.analisisIA,
            objetivos:     analisis.objetivos,
          };
          if (analisis.historiaClinica) update.historiaClinica = analisis.historiaClinica;
          if (analisis.observacionesIA && analisis.observacionesIA.length > 0) {
            update.observacionesIA = analisis.observacionesIA;
          }
          await Interrogatorio.findByIdAndUpdate(interrogatorio._id, update);
          console.info('[completarInterrogatorio] análisis OpenAI guardado para', interrogatorio._id.toString());
        } catch (e) {
          console.error('[completarInterrogatorio] error guardando análisis OpenAI:', e);
        }
      }).catch(err => {
        console.error('[completarInterrogatorio] error generando análisis OpenAI:', err);
      });
    }

    return interrogatorio;
  }

  async generarAnalisisIA(interrogatorioId: string, pacienteId: string): Promise<IInterrogatorio> {
    // Verificar que el interrogatorio existe y tiene respuestas
    const interrogatorioExistente = await Interrogatorio.findOne({
      _id: interrogatorioId,
      pacienteId
    });

    if (!interrogatorioExistente) {
      throw new Error('Interrogatorio no encontrado');
    }

    if (Object.keys(interrogatorioExistente.respuestas).length === 0) {
      throw new Error('El interrogatorio no tiene respuestas para analizar');
    }

    try {
      // Generar el análisis con la IA (Historia Clínica + Objetivos)
      const analisis = await openaiService.analizarInterrogatorio(
        interrogatorioExistente.respuestas,
        {
          disfuncionesAgent: interrogatorioExistente.analisisFisiologicoIA,
          notaMedico: (interrogatorioExistente.recomendacionAutomatica as any)?.llamadoAccion,
          ordenAbordaje: (interrogatorioExistente.recomendacionAutomatica as any)?.estrategiasFuncionales,
        }
      );

      // A4: Generar Semaforización Fisiológica
      const semaforizacion = await AIService.generarSemaforizacion(interrogatorioId);

      // Actualizar usando findByIdAndUpdate para evitar conflictos de versión
      const interrogatorioActualizado = await Interrogatorio.findByIdAndUpdate(
        interrogatorioId,
        {
          analisisIA: analisis.analisisIA,
          historiaClinica: analisis.historiaClinica,
          objetivos: analisis.objetivos,
          analisisFisiologicoIA: semaforizacion,
          observacionesIA: analisis.observacionesIA && analisis.observacionesIA.length > 0
            ? analisis.observacionesIA
            : interrogatorioExistente.observacionesIA || []
        },
        { new: true, runValidators: true }
      );

      if (!interrogatorioActualizado) {
        throw new Error('Error al actualizar el interrogatorio');
      }

      return interrogatorioActualizado;
    } catch (error: any) {
      console.error('Error al generar análisis con IA:', error);
      throw new Error(`Error al generar análisis: ${error.message}`);
    }
  }

  private obtenerTotalPreguntas(tipo: 'primera_vez' | 'control'): number {
    // Número aproximado de preguntas según el tipo
    // Esto debería venir de una configuración o base de datos
    return tipo === 'primera_vez' ? 50 : 30;
  }
}

export default new InterrogatorioService();

