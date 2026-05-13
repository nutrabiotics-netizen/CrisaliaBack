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
    objetivos?: string[]
  ): Promise<IInterrogatorio> {
    const interrogatorio = await Interrogatorio.findOne({
      _id: interrogatorioId,
      pacienteId
    });

    if (!interrogatorio) {
      throw new Error('Interrogatorio no encontrado');
    }

    // Si no se proporciona análisis IA, generarlo automáticamente
    if (!analisisIA && Object.keys(interrogatorio.respuestas).length > 0) {
      try {
        const analisis = await openaiService.analizarInterrogatorio(interrogatorio.respuestas);
        interrogatorio.analisisIA = analisis.analisisIA;
        interrogatorio.objetivos = analisis.objetivos;
        if (analisis.observacionesIA && analisis.observacionesIA.length > 0) {
          interrogatorio.observacionesIA = analisis.observacionesIA;
        }
      } catch (error: any) {
        console.error('Error al generar análisis con IA:', error);
        // No guardar mensaje de error, dejar sin análisis para poder reintentar
      }
    } else {
      // Usar los valores proporcionados si existen
      if (analisisIA) {
        interrogatorio.analisisIA = analisisIA;
      }
      
      if (objetivos && objetivos.length > 0) {
        interrogatorio.objetivos = objetivos;
      }
    }

    interrogatorio.estado = 'completado';
    interrogatorio.progreso = 100;

    await interrogatorio.save();

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
      // Generar el análisis con la IA (Texto + Objetivos)
      const analisis = await openaiService.analizarInterrogatorio(interrogatorioExistente.respuestas);
      
      // A4: Generar Semaforización Fisiológica
      const semaforizacion = await AIService.generarSemaforizacion(interrogatorioId);

      // Actualizar usando findByIdAndUpdate para evitar conflictos de versión
      const interrogatorioActualizado = await Interrogatorio.findByIdAndUpdate(
        interrogatorioId,
        {
          analisisIA: analisis.analisisIA,
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

