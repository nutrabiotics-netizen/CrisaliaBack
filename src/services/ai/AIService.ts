export interface IAnamnesisPayload {
  pregunta: string;
  respuesta: string;
}

export interface IAnamnesisResponse {
  feedback: string;
  sugerencia?: string;
}

/**
 * Servicio centralizado para interacciones con IA.
 * Sigue la regla de devolver mocks tipados en esta fase.
 */
export class AIService {
  /**
   * Genera un feedback empático basado en la respuesta del paciente a una pregunta específica.
   */
  static async obtenerFeedbackEmpatico(_payload: IAnamnesisPayload): Promise<IAnamnesisResponse> {
    // TODO: conectar con LLM — payload: pregunta y respuesta para generar empatía
    // El feedback debe ser adaptado al contexto sociocultural y Medicina Funcional.
    
    const mockResponses = [
      "Entiendo perfectamente lo que mencionas. Es una señal importante que exploraremos a fondo.",
      "Gracias por tu sinceridad. En Medicina Funcional, este detalle nos ayuda a ver la raíz del problema.",
      "Aprecio que lo compartas. Muchos pacientes experimentan algo similar y hay rutas claras para abordarlo.",
      "Comprendo. Vamos a tener esto muy en cuenta para el diseño de tu plan terapéutico."
    ];

    const randomFeedback = mockResponses[Math.floor(Math.random() * mockResponses.length)];

    return {
      feedback: randomFeedback,
      sugerencia: "Continúa con la siguiente pregunta cuando estés listo."
    };
  }

  /**
   * Genera el análisis semafórico de los sistemas biológicos.
   * Basado en el modelo de Medicina Funcional.
   */
  static async generarSemaforizacion(_interrogatorioId: string): Promise<any[]> {
    const sistemas = [
      { sistema: "Asimilación (Digestivo)", nivel: 'moderado', puntuacion: 65, hallazgos: ["Posible permeabilidad intestinal", "Disbiosis leve"] },
      { sistema: "Defensa y Reparación (Inmune)", nivel: 'critico', puntuacion: 35, hallazgos: ["Inflamación crónica activa", "Reactividad alimentaria"] },
      { sistema: "Energía (Mitocondrial)", nivel: 'optimo', puntuacion: 85, hallazgos: ["Producción de energía estable"] },
      { sistema: "Biotransformación (Entorno)", nivel: 'moderado', puntuacion: 50, hallazgos: ["Carga tóxica elevada", "Metilación comprometida"] },
      { sistema: "Transporte (Cardiovascular)", nivel: 'optimo', puntuacion: 90, hallazgos: ["Microcirculación adecuada"] },
      { sistema: "Comunicación (Hormonal)", nivel: 'critico', puntuacion: 20, hallazgos: ["Eje HPA desregulado", "Resistencia a la insulina"] },
      { sistema: "Integridad Estructural", nivel: 'optimo', puntuacion: 95, hallazgos: ["Sin hallazgos significativos"] }
    ];

    return sistemas;
  }

  /**
   * Calcula el nivel de coincidencia entre un paciente y un médico.
   * Cruza objetivos del paciente con especialidades y ubicación.
   */
  static async calcularMatchMedico(
    pacienteObjetivos: string[], 
    medicoPerfil: any,
    pacienteUbicacion?: string
  ): Promise<number> {
    if (!pacienteObjetivos || pacienteObjetivos.length === 0) return 0;
    
    let score = 0;
    const especialidad = (medicoPerfil.especialidad || "").toLowerCase();
    const lMedico = (medicoPerfil.lugarResidencia || medicoPerfil.perfilVerificacion?.ciudadVivienda || "").toLowerCase();
    const lPaciente = (pacienteUbicacion || "").toLowerCase();
    
    // 1. Lógica por Especialidad (60% del peso total)
    pacienteObjetivos.forEach(obj => {
      const o = obj.toLowerCase();
      if (especialidad.includes('gastro') && (o.includes('digestiv') || o.includes('colon') || o.includes('estomag'))) score += 30;
      if (especialidad.includes('endocrino') && (o.includes('hormon') || o.includes('tiroid') || o.includes('metabol'))) score += 30;
      if (especialidad.includes('inmuno') && (o.includes('alerg') || o.includes('defens') || o.includes('autoinmune'))) score += 30;
      if (especialidad.includes('funcional')) score += 15;
    });

    // 2. Lógica por Ubicación (40% del peso total)
    if (lPaciente && lMedico && (lMedico.includes(lPaciente) || lPaciente.includes(lMedico))) {
      score += 40;
    }

    return Math.min(score, 100);
  }

  /**
   * Detecta discrepancias entre el mapa corporal y las respuestas verbales.
   */
  static async detectarIncoherencias(mapaCorporal: any, respuestas: any): Promise<string[]> {
    const incoherencias: string[] = [];
    
    // Ejemplo: Dolor en espalda vs respuesta en chat
    if (mapaCorporal?.zonas?.includes('espalda_baja')) {
      const rPalpacion = JSON.stringify(respuestas).toLowerCase();
      if (rPalpacion.includes('no tengo dolor') || rPalpacion.includes('ningún dolor')) {
        incoherencias.push("El paciente marcó dolor en espalda baja en el mapa corporal, pero niega dolor en las respuestas del chat.");
      }
    }

    return incoherencias;
  }

  /**
   * Analiza la anamnesis completa para extraer disfunciones y objetivos.
   * (Placeholder para la integración existente con OpenAI/Bedrock)
   */
  static async analizarAnamnesisCompleta(_interrogatorioId: string): Promise<any> {
    // TODO: migrar lógica de OpenAIService/BedrockService a este punto centralizado
    return { success: true, message: "Análisis en proceso" };
  }
}
