import { invokeAgent, invokeAgentJson } from './bedrock.service';
import type {
  IAgendaOptimizada,
  IAgendaPayload,
  IAnalisisMedico,
  IAnalisisParaclinicos,
  IAnamnesisListaDemoItem,
  IAnamnesisMedicoPayload,
  IAudioPayload,
  IContratoGenerado,
  IContratoPerfil,
  IControlPayload,
  IDiagnosticoPayload,
  IDiagnosticoSugerido,
  IETPayload,
  IETSugerida,
  IFragmentoMF,
  IMetricasImpactoDemo,
  IParaclinicosPayload,
  IResumenControl,
  ITranscripcion,
  IVersiculoNTV
} from './aiMedicoTypes';

export interface IAnamnesisPayload {
  pregunta: string;
  respuesta: string;
}

export interface IAnamnesisResponse {
  feedback: string;
  sugerencia?: string;
}

export interface ISistemaSemaforoMF {
  sistema: string;
  nivel: 'optimo' | 'moderado' | 'critico';
  puntuacion: number;
  hallazgos: string[];
}

export class AIService {

  static async obtenerFeedbackEmpatico(payload: IAnamnesisPayload): Promise<IAnamnesisResponse> {
    const prompt = `
Eres el asistente clínico de Crisal-iA para pacientes de Medicina Funcional en Colombia.
El paciente respondió la siguiente pregunta durante su interrogatorio de salud:

Pregunta: ${payload.pregunta}
Respuesta del paciente: ${payload.respuesta}

Genera un mensaje de feedback empático, cálido y motivador en español (máximo 2 oraciones).
Ten en cuenta el contexto sociocultural colombiano y el enfoque de Medicina Funcional.
Responde SOLO el texto del mensaje, sin JSON, sin comillas adicionales, sin prefijos.
`.trim();

    const feedback = await invokeAgent(prompt);
    return {
      feedback: feedback || 'Gracias por compartir esa información, es muy valiosa para tu proceso de salud.',
      sugerencia: 'Continúa con la siguiente pregunta cuando estés listo.'
    };
  }

  static async generarSemaforizacion(interrogatorioId: string): Promise<ISistemaSemaforoMF[]> {
    const fallback: ISistemaSemaforoMF[] = [];
    try {
      const { default: Interrogatorio } = await import('../../models/Interrogatorio');
      const doc = await Interrogatorio.findById(interrogatorioId).lean();
      const resumen = doc
        ? JSON.stringify({ respuestas: doc.respuestas, objetivos: doc.objetivos })
        : 'Sin datos de interrogatorio disponibles';

      const prompt = `
Eres un experto en Medicina Funcional. Analiza el siguiente interrogatorio de un paciente
y genera la semaforización de los 7 sistemas biológicos del modelo de Medicina Funcional.

Datos del interrogatorio:
${resumen}

Retorna ÚNICAMENTE un array JSON con exactamente 7 objetos con esta estructura:
[
  {
    "sistema": "Nombre del sistema",
    "nivel": "optimo",
    "puntuacion": 85,
    "hallazgos": ["hallazgo relevante 1", "hallazgo relevante 2"]
  }
]

Los 7 sistemas son exactamente estos (usa estos nombres):
1. Asimilación (Digestivo)
2. Defensa y Reparación (Inmune)
3. Energía (Mitocondrial)
4. Biotransformación (Entorno)
5. Transporte (Cardiovascular)
6. Comunicación (Hormonal)
7. Integridad Estructural

Valores de nivel: "optimo" (puntuacion 70-100), "moderado" (40-69), "critico" (0-39).
No incluyas texto fuera del array JSON.
`.trim();

      return invokeAgentJson<ISistemaSemaforoMF[]>(prompt, fallback);
    } catch (err) {
      console.error('[AIService] generarSemaforizacion:', err);
      return fallback;
    }
  }

  static async calcularMatchMedico(
    pacienteObjetivos: string[],
    medicoPerfil: any,
    pacienteUbicacion?: string
  ): Promise<number> {
    if (!pacienteObjetivos?.length) return 0;

    const prompt = `
Evalúa la compatibilidad entre un paciente y un médico de Medicina Funcional.

Objetivos del paciente: ${pacienteObjetivos.join(', ')}
Especialidad del médico: ${medicoPerfil.especialidad || 'Medicina Funcional'}
Descripción del médico: ${medicoPerfil.bio || medicoPerfil.descripcion || 'No disponible'}
Ciudad del médico: ${medicoPerfil.lugarResidencia || medicoPerfil.perfilVerificacion?.ciudadVivienda || 'No especificada'}
Ciudad del paciente: ${pacienteUbicacion || 'No especificada'}

Retorna ÚNICAMENTE un número entero entre 0 y 100 que representa el porcentaje de compatibilidad.
Sin texto adicional, solo el número.
`.trim();

    const raw = await invokeAgent(prompt);
    const num = parseInt(raw.replace(/\D/g, ''), 10);
    return isNaN(num) ? 50 : Math.min(100, Math.max(0, num));
  }

  static async detectarIncoherencias(mapaCorporal: any, respuestas: any): Promise<string[]> {
    const prompt = `
Analiza si hay contradicciones entre el mapa corporal y las respuestas del interrogatorio de este paciente.

Mapa corporal (zonas con dolor o molestia marcadas):
${JSON.stringify(mapaCorporal)}

Respuestas del interrogatorio:
${JSON.stringify(respuestas)}

Retorna ÚNICAMENTE un array JSON de strings. Cada string describe una incoherencia encontrada.
Si no hay incoherencias, retorna un array vacío: []
Ejemplo: ["El paciente marcó dolor en rodilla pero indica no tener dolor articular en el chat."]
`.trim();

    return invokeAgentJson<string[]>(prompt, []);
  }

  static async analizarAnamnesisCompleta(interrogatorioId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { default: Interrogatorio } = await import('../../models/Interrogatorio');
      const doc = await Interrogatorio.findById(interrogatorioId).lean();
      if (!doc) return { success: false, message: 'Interrogatorio no encontrado' };

      const prompt = `
Realiza un análisis completo del siguiente interrogatorio de Medicina Funcional.
Identifica los patrones principales, disfunciones probables y prioridades terapéuticas.

Datos del interrogatorio:
${JSON.stringify({ respuestas: doc.respuestas, tipo: doc.tipo, progreso: doc.progreso })}

Proporciona un análisis ejecutivo en español con 3 párrafos:
1. Principales disfunciones detectadas y sus sistemas afectados
2. Patrones y correlaciones relevantes entre síntomas
3. Prioridades terapéuticas sugeridas desde Medicina Funcional

Responde en texto plano, sin JSON, sin encabezados markdown.
`.trim();

      const message = await invokeAgent(prompt);
      return { success: true, message: message || 'Análisis generado por el agente.' };
    } catch (err) {
      console.error('[AIService] analizarAnamnesisCompleta:', err);
      return { success: false, message: 'Error al analizar el interrogatorio.' };
    }
  }

  static async generarContrato(payload: IContratoPerfil): Promise<IContratoGenerado> {
    const fallback: IContratoGenerado = {
      versionPlantilla: 'bedrock-1.0',
      clausulas: [],
      textoPlano: '',
      advertenciaLegal: 'Revisar con asesor jurídico antes de firmar.'
    };

    const prompt = `
Genera las cláusulas principales de un contrato de uso de software médico (SaaS)
para el siguiente médico en Colombia.

Perfil del médico:
- Nombre: ${payload.nombreCompleto || 'No especificado'}
- Especialidad: ${payload.especialidad || 'Medicina Funcional'}
- Jurisdicción: ${payload.jurisdiccion || 'Colombia'}

Retorna ÚNICAMENTE un objeto JSON con esta estructura:
{
  "versionPlantilla": "bedrock-1.0",
  "clausulas": [
    "Cláusula 1: ...",
    "Cláusula 2: ...",
    "Cláusula 3: ...",
    "Cláusula 4: ...",
    "Cláusula 5: ..."
  ],
  "textoPlano": "Texto completo del contrato en español con todas las cláusulas desarrolladas",
  "advertenciaLegal": "Advertencia legal aplicable para Colombia"
}

Las cláusulas deben cubrir: confidencialidad (Ley 1581/2012), uso adecuado del software,
responsabilidad clínica del médico, habeas data, jurisdicción colombiana y propiedad intelectual.
`.trim();

    return invokeAgentJson<IContratoGenerado>(prompt, fallback);
  }

  static async analizarAnamnesisMedico(payload: IAnamnesisMedicoPayload): Promise<IAnalisisMedico> {
    const fallback: IAnalisisMedico = {
      resumenViñetas: [],
      hallazgosPorSemaforo: { rojo: [], amarillo: [], verde: [] },
      objetivosPaciente: [],
      notasIA: ''
    };

    try {
      let contexto = payload.fragmentoContexto || '';

      // Enriquecer con datos reales del interrogatorio si se provee el ID
      if (payload.interrogatorioId) {
        const { default: Interrogatorio } = await import('../../models/Interrogatorio');
        const doc = await Interrogatorio.findById(payload.interrogatorioId).lean();
        if (doc) {
          contexto = JSON.stringify({
            respuestas: doc.respuestas,
            objetivos: doc.objetivos,
            observacionesIA: doc.observacionesIA
          });
        }
      }

      const prompt = `
Eres el asistente clínico de Crisal-iA. Analiza la siguiente anamnesis de un paciente
para preparar al médico antes de la consulta. Usa el enfoque de Medicina Funcional.

Datos del interrogatorio del paciente:
${contexto || 'No se proporcionaron datos adicionales'}

Retorna ÚNICAMENTE un objeto JSON con esta estructura exacta:
{
  "resumenViñetas": [
    "Punto clave 1 del paciente",
    "Punto clave 2 del paciente",
    "Punto clave 3 del paciente"
  ],
  "hallazgosPorSemaforo": {
    "rojo": ["Hallazgo crítico que requiere atención inmediata"],
    "amarillo": ["Hallazgo moderado a monitorear"],
    "verde": ["Aspecto positivo del paciente"]
  },
  "objetivosPaciente": ["Objetivo principal 1", "Objetivo principal 2"],
  "notasIA": "Nota general para el médico sobre este paciente y cómo abordar la consulta"
}
`.trim();

      return invokeAgentJson<IAnalisisMedico>(prompt, fallback);
    } catch (err) {
      console.error('[AIService] analizarAnamnesisMedico:', err);
      return fallback;
    }
  }

  static async sugerirDiagnosticos(payload: IDiagnosticoPayload): Promise<IDiagnosticoSugerido[]> {
    try {
      let contexto = payload.contextoBreve || '';

      if (payload.pacienteId) {
        const { default: Interrogatorio } = await import('../../models/Interrogatorio');
        const interrog = await Interrogatorio.findOne({ pacienteId: payload.pacienteId })
          .sort({ createdAt: -1 })
          .lean();
        if (interrog) {
          contexto += `\nAnamnesis: ${JSON.stringify({ respuestas: interrog.respuestas, objetivos: interrog.objetivos })}`;
        }
      }

      const prompt = `
Eres un experto en Medicina Funcional y CIE-10. Basándote en la siguiente información clínica,
sugiere diagnósticos funcionales y convencionales para orientar al médico tratante.

Información clínica del paciente:
${contexto || 'Sin información clínica adicional'}

Retorna ÚNICAMENTE un array JSON con máximo 5 sugerencias ordenadas de mayor a menor confianza:
[
  {
    "tipo": "disfuncion_fisiologica",
    "titulo": "Nombre del diagnóstico funcional",
    "detalle": "Explicación clínica breve de por qué se sospecha",
    "confianza": 0.85,
    "obligatorioPorDefecto": true,
    "hiloRazonamiento": "Correlación entre síntomas y este diagnóstico"
  }
]

Tipos válidos: "disfuncion_fisiologica", "cie10_sugerido", "paraclinico"
Para "paraclinico": el titulo es el nombre del examen sugerido y el detalle explica por qué.
`.trim();

      return invokeAgentJson<IDiagnosticoSugerido[]>(prompt, []);
    } catch (err) {
      console.error('[AIService] sugerirDiagnosticos:', err);
      return [];
    }
  }

  static async generarEstrategiasTerapeuticas(payload: IETPayload): Promise<IETSugerida[]> {
    const prompt = `
Genera estrategias terapéuticas de Medicina Funcional para un paciente.

Diagnósticos clave identificados: ${(payload.diagnosticosClave || []).join(', ') || 'No especificados'}
Contexto adicional: ${payload.pacienteId ? `Paciente ID: ${payload.pacienteId}` : 'Sin contexto adicional'}

Retorna ÚNICAMENTE un array JSON con máximo 4 estrategias ordenadas por prioridad:
[
  {
    "nombre": "Nombre descriptivo de la estrategia",
    "categoria": "Nutrición",
    "prioridad": "alta",
    "pasos": [
      "Paso 1 concreto y accionable",
      "Paso 2 concreto y accionable",
      "Paso 3 concreto y accionable"
    ],
    "referenciaMF": "Referencia AMF/IFM si aplica, o vacío"
  }
]

Categorías válidas: "Nutrición", "Suplementación", "Estilo de vida",
"Manejo del estrés", "Movimiento", "Sueño", "Detox", "Mente-Cuerpo"
Prioridades válidas: "alta", "media", "baja"
`.trim();

    return invokeAgentJson<IETSugerida[]>(prompt, []);
  }

  static async transcribirConsulta(_payload: IAudioPayload): Promise<ITranscripcion> {
    // La transcripción real se maneja vía AWS Transcribe Streaming en transcriptionWs.ts
    // Esta función es un fallback para cuando se solicita transcripción sin stream activo.
    return {
      texto: 'Transcripción disponible solo durante videollamada activa (AWS Transcribe Streaming).',
      segmentos: [],
      sugerenciasExamenFisico: []
    };
  }

  static async analizarParaclinicos(payload: IParaclinicosPayload): Promise<IAnalisisParaclinicos> {
    const fallback: IAnalisisParaclinicos = {
      lineaTemporal: [],
      correlacionAnamnesis: [],
      conversionesAplicadas: []
    };

    try {
      let valoresTexto = '';

      if (payload.pacienteId) {
        const { default: Paraclinico } = await import('../../models/Paraclinico');
        const docs = await (Paraclinico as any)
          .find({ pacienteId: payload.pacienteId })
          .sort({ createdAt: 1 })
          .lean();
        if (docs?.length) {
          valoresTexto = JSON.stringify(docs.map((d: any) => ({
            fecha: d.createdAt,
            nombre: d.nombre || d.tipo,
            valores: d.ocrValores || d.valores,
            textoPlano: d.ocrTextoPlano
          })));
        }
      } else if (payload.valoresEjemplo?.length) {
        valoresTexto = JSON.stringify(payload.valoresEjemplo);
      }

      const prompt = `
Analiza los siguientes resultados de laboratorio de un paciente con enfoque de Medicina Funcional.
Usa rangos funcionales (más estrictos que los convencionales) para la semaforización.

Resultados de laboratorio:
${valoresTexto || 'Sin resultados disponibles'}

Retorna ÚNICAMENTE un objeto JSON:
{
  "lineaTemporal": [
    {
      "fecha": "YYYY-MM-DD",
      "examen": "Nombre del examen",
      "hallazgo": "Valor numérico con unidades",
      "semaforo": "verde"
    }
  ],
  "correlacionAnamnesis": [
    "Correlación entre resultado de lab y síntoma del paciente"
  ],
  "conversionesAplicadas": [
    "Descripción de conversión de unidades si aplica"
  ]
}

Semáforo: "verde" (dentro de rango funcional), "amarillo" (limítrofe o subóptimo), "rojo" (fuera de rango funcional).
`.trim();

      return invokeAgentJson<IAnalisisParaclinicos>(prompt, fallback);
    } catch (err) {
      console.error('[AIService] analizarParaclinicos:', err);
      return fallback;
    }
  }

  static async generarResumenControl(payload: IControlPayload): Promise<IResumenControl> {
    const fallback: IResumenControl = {
      evolucionClinica: '',
      adherenciaEstimada: 0,
      semaforoGeneral: 'amarillo',
      sugerenciaProximaConsultaSemanas: 4,
      puntosAtencion: []
    };

    try {
      let contexto = `Tipo de control: ${payload.tipoControl || 'seguimiento'}`;

      if (payload.pacienteId) {
        const { default: Interrogatorio } = await import('../../models/Interrogatorio');
        const ultimo = await Interrogatorio.findOne({ pacienteId: payload.pacienteId })
          .sort({ createdAt: -1 })
          .lean();
        if (ultimo) {
          contexto += `\nÚltimo interrogatorio: ${JSON.stringify({ respuestas: ultimo.respuestas, objetivos: ultimo.objetivos })}`;
        }
      }

      const prompt = `
Genera un resumen de control clínico para un paciente de Medicina Funcional.

Información disponible:
${contexto}

Retorna ÚNICAMENTE un objeto JSON:
{
  "evolucionClinica": "Descripción de la evolución del paciente en 2-3 oraciones",
  "adherenciaEstimada": 75,
  "semaforoGeneral": "amarillo",
  "sugerenciaProximaConsultaSemanas": 8,
  "puntosAtencion": [
    "Punto concreto a reforzar o monitorear 1",
    "Punto concreto a reforzar o monitorear 2"
  ]
}

adherenciaEstimada: número entre 0 y 100.
semaforoGeneral: "verde" (buena evolución), "amarillo" (evolución moderada), "rojo" (requiere atención urgente).
sugerenciaProximaConsultaSemanas: número entero de semanas recomendadas hasta la próxima cita.
`.trim();

      return invokeAgentJson<IResumenControl>(prompt, fallback);
    } catch (err) {
      console.error('[AIService] generarResumenControl:', err);
      return fallback;
    }
  }

  static async buscarRepositorioMF(query: string): Promise<IFragmentoMF[]> {
    const q = (query || '').trim() || 'medicina funcional';

    const prompt = `
Busca en tu base de conocimiento de Medicina Funcional (AMF/IFM) los fragmentos más relevantes
sobre el siguiente tema clínico: "${q}"

Retorna ÚNICAMENTE un array JSON con máximo 3 resultados ordenados por relevancia:
[
  {
    "id": "mf-001",
    "titulo": "Título del material o protocolo",
    "conferencista": "Nombre del autor o conferencista si está disponible",
    "tipo": "documento",
    "extracto": "Resumen de 2-3 oraciones con el contenido más relevante sobre el tema",
    "etiquetas": ["etiqueta1", "etiqueta2"],
    "relevancia": 0.92
  }
]

Tipos válidos: "video", "audio", "documento"
Si no encuentras resultados relevantes en tu base de conocimiento, retorna []
`.trim();

    return invokeAgentJson<IFragmentoMF[]>(prompt, []);
  }

  static async optimizarAgenda(payload: IAgendaPayload): Promise<IAgendaOptimizada> {
    const fallback: IAgendaOptimizada = {
      mensaje: 'No se pudo optimizar la agenda en este momento.',
      slotsSugeridos: [],
      reubicaciones: []
    };

    const prompt = `
Analiza la siguiente agenda médica y sugiere optimizaciones concretas para reducir
tiempos muertos y mejorar la experiencia del paciente.

Resumen de agenda y contexto:
- Médico ID: ${payload.medicoId || 'No especificado'}
- Sedes: ${(payload.sedesResumen || []).join(', ') || 'No especificadas'}
- Cancelaciones recientes: ${(payload.cancelacionesIds || []).length} citas canceladas

Retorna ÚNICAMENTE un objeto JSON:
{
  "mensaje": "Resumen ejecutivo de la propuesta de optimización en 1-2 oraciones",
  "slotsSugeridos": [
    {
      "fecha": "YYYY-MM-DD",
      "horaInicio": "HH:MM",
      "horaFin": "HH:MM",
      "motivo": "Razón por la que se sugiere este slot"
    }
  ],
  "reubicaciones": [
    {
      "pacienteRef": "Referencia del paciente",
      "de": "Slot original",
      "a": "Nuevo slot sugerido"
    }
  ]
}
`.trim();

    return invokeAgentJson<IAgendaOptimizada>(prompt, fallback);
  }

  static async listarAnamnesisMedico(medicoId: string): Promise<IAnamnesisListaDemoItem[]> {
    try {
      const { default: Cita } = await import('../../models/Cita');
      const { default: Interrogatorio } = await import('../../models/Interrogatorio');

      // Buscar citas recientes del médico con paciente
      const citas = await Cita.find({ medicoId })
        .populate('pacienteId', 'nombre primerNombre primerApellido')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      if (!citas.length) return [];

      const pacienteIds = citas.map((c: any) => c.pacienteId?._id).filter(Boolean);

      // Buscar interrogatorios de esos pacientes
      const interrogatorios = await Interrogatorio.find({ pacienteId: { $in: pacienteIds } })
        .sort({ createdAt: -1 })
        .lean();

      const interrPorPaciente = new Map<string, any>();
      for (const i of interrogatorios) {
        const pid = i.pacienteId.toString();
        if (!interrPorPaciente.has(pid)) interrPorPaciente.set(pid, i);
      }

      return citas.map((c: any): IAnamnesisListaDemoItem => {
        const paciente = c.pacienteId as any;
        const nombre = paciente?.nombre
          || `${paciente?.primerNombre || ''} ${paciente?.primerApellido || ''}`.trim()
          || 'Paciente';
        const pid = paciente?._id?.toString();
        const interr = pid ? interrPorPaciente.get(pid) : null;

        const semaforo = { rojo: 0, amarillo: 0, verde: 0 };
        if (interr?.analisisFisiologicoIA?.length) {
          for (const s of interr.analisisFisiologicoIA) {
            if (s.nivel === 'critico') semaforo.rojo++;
            else if (s.nivel === 'moderado') semaforo.amarillo++;
            else semaforo.verde++;
          }
        }

        return {
          id: c._id.toString(),
          paciente: nombre,
          porcentaje: interr?.progreso ?? 0,
          fecha: (interr?.updatedAt ?? c.createdAt)?.toISOString().split('T')[0] ?? '',
          semaforo,
          objetivos: interr?.objetivos ?? [],
          estado: interr?.estado === 'completado' ? 'completa' : 'en-proceso'
        };
      });
    } catch (err) {
      console.error('[AIService] listarAnamnesisMedico:', err);
      return [];
    }
  }

  static async metricasImpacto(payload?: any): Promise<IMetricasImpactoDemo> {
    const fallback: IMetricasImpactoDemo = { disfunciones: [], estrategias: [] };

    const contexto = payload
      ? JSON.stringify(payload)
      : 'Paciente sin datos específicos disponibles';

    const prompt = `
Basándote en el siguiente contexto clínico de un paciente de Medicina Funcional,
genera métricas de impacto de las disfunciones y efectividad de las estrategias terapéuticas.

Contexto clínico:
${contexto}

Retorna ÚNICAMENTE un objeto JSON:
{
  "disfunciones": [
    {
      "nombre": "Nombre de la disfunción identificada",
      "severidad": "Alta",
      "impacto": 85
    }
  ],
  "estrategias": [
    {
      "estrategia": "Nombre de la estrategia terapéutica",
      "efectividad": 90,
      "evidencia": "Alta"
    }
  ]
}

severidad válidas: "Alta", "Media", "Baja"
impacto y efectividad: número entre 0 y 100
evidencia válida: "Alta", "Media", "Baja"
Máximo 4 disfunciones y 4 estrategias.
`.trim();

    return invokeAgentJson<IMetricasImpactoDemo>(prompt, fallback);
  }

  static async versiculos(tema?: string): Promise<IVersiculoNTV[]> {
    const topico = tema || 'salud y bienestar integral';

    const prompt = `
Sugiere versículos bíblicos relevantes para acompañar espiritualmente una consulta médica
sobre el tema: "${topico}"

Retorna ÚNICAMENTE un array JSON con 2 o 3 versículos:
[
  {
    "referencia": "Libro Capítulo:Versículo (ej: Juan 3:16)",
    "texto": "Texto completo del versículo en español",
    "relacionado": "Cómo se relaciona este versículo con el tema clínico del paciente"
  }
]
`.trim();

    return invokeAgentJson<IVersiculoNTV[]>(prompt, []);
  }
}
