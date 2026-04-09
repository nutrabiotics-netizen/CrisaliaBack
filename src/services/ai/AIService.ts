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

/**
 * Servicio centralizado para interacciones con IA.
 * Datos simulados únicamente; sin modelos de persistencia ni LLM externos en esta capa.
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
  static async generarSemaforizacion(_interrogatorioId: string): Promise<ISistemaSemaforoMF[]> {
    const sistemas: ISistemaSemaforoMF[] = [
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
  static async analizarAnamnesisCompleta(_interrogatorioId: string): Promise<{ success: boolean; message: string }> {
    // TODO: conectar con LLM — payload: interrogatorioId para síntesis completa
    return { success: true, message: 'Análisis en proceso (simulado)' };
  }

  static async generarContrato(_payload: IContratoPerfil): Promise<IContratoGenerado> {
    // TODO: conectar con LLM — payload: perfil legal del médico y jurisdicción
    return {
      versionPlantilla: 'sim-mock-1.0',
      clausulas: [
        'Confidencialidad de datos personales (Ley 1581/2012, Colombia).',
        'Uso adecuado del software y no sustitución del criterio clínico.',
        'Exoneración de responsabilidad sobre decisiones clínicas del profesional.'
      ],
      textoPlano:
        'CONTRATO DE USO (SIMULADO). El presente texto es generado con datos de demostración y no tiene validez legal hasta integrar firma y plantilla aprobada.',
      advertenciaLegal: 'Documento simulado — no firmar en producción sin validación jurídica.'
    };
  }

  static async analizarAnamnesisMedico(payload: IAnamnesisMedicoPayload): Promise<IAnalisisMedico> {
    // TODO: conectar con LLM — payload: respuestas de anamnesis y objetivos del paciente
    const ctx = (payload.fragmentoContexto || '').slice(0, 80);
    return {
      resumenViñetas: [
        'Patrón inflamatorio de bajo grado referido (simulado).',
        'Posible compromiso eje intestino-cerebro (simulado).',
        ctx ? `Contexto recibido (${ctx}…)` : 'Sin fragmento adicional; análisis genérico demo.'
      ],
      hallazgosPorSemaforo: {
        rojo: ['Fatiga persistente con impacto funcional (demo)', 'Dolor abdominal recurrente (demo)'],
        amarillo: ['Sueño fragmentado', 'Consumo variable de ultraprocesados'],
        verde: ['Actividad física ocasional', 'Hidratación adecuada referida']
      },
      objetivosPaciente: ['Mejorar energía', 'Reducir síntomas digestivos', 'Optimizar sueño'],
      notasIA: 'Resumen generado con datos simulados para pruebas de flujo médico.'
    };
  }

  static async sugerirDiagnosticos(_payload: IDiagnosticoPayload): Promise<IDiagnosticoSugerido[]> {
    // TODO: conectar con LLM — payload: historia, anamnesis y paraclínicos
    return [
      {
        tipo: 'disfuncion_fisiologica',
        titulo: 'Disfunción de metilación (hipótesis)',
        detalle: 'Correlación tentativa con fatiga y tolerancia al estrés (demo).',
        confianza: 0.62,
        obligatorioPorDefecto: true,
        hiloRazonamiento: 'Patrón sintomático + ausencia de datos contradictorios en demo.'
      },
      {
        tipo: 'cie10_sugerido',
        titulo: 'R53 — Malestar y fatiga',
        detalle: 'Código orientativo para documentación; validar con criterio clínico.',
        confianza: 0.41,
        obligatorioPorDefecto: false,
        hiloRazonamiento: 'Coincidencia léxica con quejas de cansancio en texto simulado.'
      },
      {
        tipo: 'paraclinico',
        titulo: 'Perfil lipídico + hemograma',
        detalle: 'Solicitud sugerida para descartar causas orgánicas frecuentes.',
        confianza: 0.55,
        obligatorioPorDefecto: true,
        hiloRazonamiento: 'Baseline estándar en enfoque funcional (demo).'
      }
    ];
  }

  static async generarEstrategiasTerapeuticas(_payload: IETPayload): Promise<IETSugerida[]> {
    // TODO: conectar con LLM — payload: diagnósticos y restricciones del médico
    return [
      {
        nombre: 'Intervención nutricional antiinflamatoria',
        categoria: 'Nutrición',
        prioridad: 'alta',
        pasos: ['Eliminación guiada 21 días', 'Reintroducción sistemática', 'Seguimiento síntomas'],
        referenciaMF: 'AMF / IFM — marco simulado'
      },
      {
        nombre: 'Sueño y ritmo circadiano',
        categoria: 'Estilo de vida',
        prioridad: 'media',
        pasos: ['Higiene del sueño', 'Luz matutina', 'Regularidad horaria'],
        referenciaMF: 'Demo'
      }
    ];
  }

  static async transcribirConsulta(_payload: IAudioPayload): Promise<ITranscripcion> {
    // TODO: conectar con LLM/STT — payload: audio o stream de consulta
    return {
      texto:
        '[SIMULADO] Médico: ¿Cómo ha evolucionado el dolor? Paciente: Mejor algunos días, pero regresa con el estrés laboral.',
      segmentos: [
        { tInicio: 0, tFin: 6, rol: 'medico', texto: '¿Cómo ha evolucionado el dolor?' },
        { tInicio: 6, tFin: 14, rol: 'paciente', texto: 'Mejor algunos días, pero regresa con el estrés laboral.' }
      ],
      sugerenciasExamenFisico: ['Palpación abdominal cuadrantes', 'Auscultación cardíaca', 'Evaluación tiroides']
    };
  }

  static async analizarParaclinicos(_payload: IParaclinicosPayload): Promise<IAnalisisParaclinicos> {
    // TODO: conectar con LLM — payload: resultados de laboratorio y rangos funcionales
    return {
      lineaTemporal: [
        { fecha: '2025-11-01', examen: 'Glucosa', hallazgo: '92 mg/dL', semaforo: 'verde' },
        { fecha: '2025-12-10', examen: 'hsPCR', hallazgo: '3.2 mg/L', semaforo: 'amarillo' },
        { fecha: '2026-01-05', examen: 'Vitamina D', hallazgo: '24 ng/mL', semaforo: 'amarillo' }
      ],
      correlacionAnamnesis: [
        'Elevación leve de PCR coherente con fatiga referida (simulado).',
        'Vitamina D subóptima alineada con quejas musculares (simulado).'
      ],
      conversionesAplicadas: ['Unidades mostradas en sistema métrico (demo).']
    };
  }

  static async generarResumenControl(_payload: IControlPayload): Promise<IResumenControl> {
    // TODO: conectar con LLM — payload: cuestionario de control y labs recientes
    const tipo = _payload.tipoControl || 'seguimiento';
    return {
      evolucionClinica: `[SIMULADO] Control tipo "${tipo}": mejoría parcial de síntomas digestivos, persistencia leve de fatiga.`,
      adherenciaEstimada: 72,
      semaforoGeneral: 'amarillo',
      sugerenciaProximaConsultaSemanas: 8,
      puntosAtencion: ['Reforzar hidratación', 'Revisar suplementación', 'Validar sueño 7h+']
    };
  }

  static async buscarRepositorioMF(query: string): Promise<IFragmentoMF[]> {
    // TODO: conectar con RAG/vector store — query: texto médico
    const q = (query || '').trim() || 'medicina funcional';
    return [
      {
        id: 'mf-demo-1',
        titulo: `Fragmento relacionado con “${q.slice(0, 40)}”`,
        conferencista: 'Dr. Demo Funcional',
        tipo: 'video',
        extracto:
          'Extracto simulado: se discuten intervenciones sobre eje HPA y nutrición antiinflamatoria en paciente con fatiga crónica.',
        etiquetas: ['HPA', 'inflamación', 'nutrición'],
        relevancia: 0.88
      },
      {
        id: 'mf-demo-2',
        titulo: 'Charla: microbiota y permeabilidad intestinal',
        conferencista: 'Dra. Demo',
        tipo: 'documento',
        extracto: 'Resumen simulado de 3 párrafos sobre disbiosis y protocolo de 5R (demo).',
        etiquetas: ['digestivo', 'microbiota'],
        relevancia: 0.76
      }
    ];
  }

  static async optimizarAgenda(_payload: IAgendaPayload): Promise<IAgendaOptimizada> {
    // TODO: conectar con LLM + datos reales de agenda — payload: citas y restricciones
    return {
      mensaje:
        'Propuesta simulada: reagrupar huecos de la tarde y ofrecer dos slots alternativos a pacientes en lista de espera (demo).',
      slotsSugeridos: [
        { fecha: '2026-04-15', horaInicio: '15:00', horaFin: '15:30', motivo: 'Llenar cancelación reciente' },
        { fecha: '2026-04-16', horaInicio: '09:00', horaFin: '09:45', motivo: 'Bloque libre mañana' }
      ],
      reubicaciones: [{ pacienteRef: 'Paciente demo A', de: 'Sede Centro 10:00', a: 'Virtual 16:00' }]
    };
  }

  /** Lista demo para pantalla de anamnesis del médico (sin persistencia). */
  static async listarAnamnesisDemoMedico(): Promise<IAnamnesisListaDemoItem[]> {
    // TODO: conectar con LLM/DB — reemplazar por datos reales de interrogatorios
    return [
      {
        id: '1',
        paciente: 'María González',
        porcentaje: 100,
        fecha: '2025-11-26',
        semaforo: { rojo: 3, amarillo: 5, verde: 12 },
        objetivos: ['Mejorar digestión', 'Reducir inflamación', 'Aumentar energía'],
        estado: 'completa'
      },
      {
        id: '2',
        paciente: 'Juan Pérez',
        porcentaje: 50,
        fecha: '2025-11-25',
        semaforo: { rojo: 2, amarillo: 3, verde: 8 },
        objetivos: ['Control de peso', 'Mejorar sueño'],
        estado: 'en-proceso'
      },
      {
        id: '3',
        paciente: 'Ana López',
        porcentaje: 100,
        fecha: '2025-11-24',
        semaforo: { rojo: 1, amarillo: 4, verde: 15 },
        objetivos: ['Optimizar hormonas', 'Mejorar estado de ánimo'],
        estado: 'completa'
      }
    ];
  }

  static async metricasImpactoDemo(): Promise<IMetricasImpactoDemo> {
    // TODO: conectar con LLM — payload: disfunciones del paciente activo
    return {
      disfunciones: [
        { nombre: 'Disfunción digestiva', severidad: 'Alta', impacto: 85 },
        { nombre: 'Desequilibrio hormonal', severidad: 'Media', impacto: 70 },
        { nombre: 'Inflamación crónica', severidad: 'Alta', impacto: 90 }
      ],
      estrategias: [
        { estrategia: 'Probióticos específicos', efectividad: 90, evidencia: 'Alta' },
        { estrategia: 'Dieta de eliminación', efectividad: 85, evidencia: 'Alta' },
        { estrategia: 'Suplementación de magnesio', efectividad: 75, evidencia: 'Media' }
      ]
    };
  }

  static async versiculosDemo(_tema?: string): Promise<IVersiculoNTV[]> {
    // TODO: conectar con LLM — payload: hallazgos del interrogatorio
    return [
      {
        referencia: 'Proverbios 17:22',
        texto: 'El corazón alegre es una buena medicina, pero el espíritu quebrantado seca los huesos.',
        relacionado: _tema || 'Estrés y bienestar emocional'
      },
      {
        referencia: '1 Corintios 6:19-20',
        texto:
          '¿No saben que su cuerpo es templo del Espíritu Santo, quien está en ustedes y al que han recibido de parte de Dios?',
        relacionado: 'Cuidado del cuerpo'
      },
      {
        referencia: 'Salmos 103:2-3',
        texto:
          'Alaba, alma mía, al Señor y no olvides ninguno de sus beneficios. Él perdona todos tus pecados y sana todas tus dolencias.',
        relacionado: 'Sanación y restauración'
      }
    ];
  }
}
