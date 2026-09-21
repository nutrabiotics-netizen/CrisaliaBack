import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface HistoriaClinica {
  motivoConsulta: {
    motivoPrincipal: string;
    tiempoEvolucion: string;
    sintomaConsulta: string;
  };
  enfermedadActual: {
    inicio: string;
    formaAparicion: string;
    evolucion: string;
    sintomasAsociados: string;
    factoresDesencadenantes: string;
    factoresMejoranEmpeoran: string;
    tratamientosRealizados: string;
    medicamentosUtilizados: string;
    examenesPrevios: string;
    resultadosRelevantes: string;
    consultasAnteriores: string;
    estadoActual: string;
  };
  antecedentes: {
    patologicos: string;
    farmacologicos: string;
    quirurgicos: string;
    alergicos: string;
    familiares: string;
    ginecologicos: string;
    toxicos: string;
  };
}

export interface AnalisisInterrogatorio {
  analisisIA: string;
  historiaClinica?: HistoriaClinica;
  objetivos: string[];
  observacionesIA?: string[];
}

class OpenAIService {
  async analizarInterrogatorio(
    respuestas: Record<string, any>,
    contextoAgent?: {
      disfuncionesAgent?: any[];
      notaMedico?: string;
      ordenAbordaje?: any[];
    }
  ): Promise<AnalisisInterrogatorio> {
    try {
      // Construir el prompt con las respuestas del paciente y la síntesis del AnamnesisAgent
      const prompt = this.construirPrompt(respuestas, contextoAgent);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un médico especialista en Medicina Funcional. Tu tarea es construir una Historia Clínica estructurada a partir de los datos del interrogatorio funcional.

La fecha actual es ${new Date().toISOString().slice(0, 10)}. Usa esta fecha para calcular edades.

Usa lenguaje médico-clínico formal. El documento será leído por el médico tratante, no por el paciente.

IMPORTANTE: NUNCA incluyas identificadores técnicos de campo (como s01, s19, s22, s03, s04 u otros códigos alfanuméricos internos). Usa únicamente términos clínicos. Si un dato no está disponible en el interrogatorio, escribe "No reportado".`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 4000
      });

      const respuestaIA = completion.choices[0]?.message?.content || '';
      
      // Parsear la respuesta de la IA
      return this.parsearRespuestaIA(respuestaIA);
    } catch (error: any) {
      console.error('Error al analizar con OpenAI:', error);
      throw new Error(`Error al analizar el interrogatorio: ${error.message}`);
    }
  }

  private construirPrompt(respuestas: Record<string, any>, contextoAgent?: { disfuncionesAgent?: any[]; notaMedico?: string; ordenAbordaje?: any[] }): string {
    // Campos internos que no aportan valor clínico al análisis
    const EXCLUIR = new Set([
      'historialChat', 'mensajeFinal', 'causas', 'zonasDolor',
      'estado_confirmado', 'historialChat'
    ]);

    // Escala de intensidad para valores numéricos 0-3
    const escala: Record<number, string> = { 0: 'nunca/ausente', 1: 'leve', 2: 'moderado', 3: 'intenso/frecuente' };

    const camposClinicos: string[] = [];

    Object.entries(respuestas).forEach(([id, valor]) => {
      if (EXCLUIR.has(id)) return;
      if (valor === null || valor === undefined || valor === '') return;
      if (Array.isArray(valor) && valor.length === 0) return;

      let valorStr: string;
      if (typeof valor === 'number') {
        valorStr = `${valor} (${escala[valor] ?? valor})`;
      } else if (Array.isArray(valor)) {
        if (valor.length > 0 && typeof valor[0] === 'object') {
          // Arrays de objetos (ej: s03_sintomas_tabla): expandir cada campo en líneas legibles
          valorStr = valor.map((obj: Record<string, any>, idx: number) =>
            `[${idx + 1}] ` + Object.entries(obj)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          ).join(' | ');
        } else {
          valorStr = valor.join(', ');
        }
      } else if (typeof valor === 'object') {
        valorStr = Object.entries(valor as Record<string, any>)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
      } else {
        valorStr = String(valor).slice(0, 500);
      }

      camposClinicos.push(`${id}: ${valorStr}`);
    });

    // Helper para limpiar IDs de campo (s01_, s19_sifo, (s04), etc.) de los textos
    const limpiarIds = (texto: string): string =>
      texto
        .replace(/\bs\d{2}_\w+\s*/g, '')      // s19_sifo, s26_infecciones_cronicas, etc.
        .replace(/\(s\d{2}[_\w]*\)\s*/g, '')  // (s04), (s19_sifo), etc.
        .replace(/\s{2,}/g, ' ')
        .trim();

    // Síntesis del AnamnesisAgent como contexto clínico base
    let bloqueAgent = '';
    if (contextoAgent?.disfuncionesAgent?.length) {
      const disfs = contextoAgent.disfuncionesAgent.map((d: any) => {
        const evidenciaLimpia = (d.evidencia || [])
          .slice(0, 3)
          .map((e: string) => limpiarIds(e))
          .filter(Boolean)
          .join('; ');
        return `- ${d.nombre || ''} (certeza: ${d.certeza || ''}, etapa: ${d.etapa || ''})${evidenciaLimpia ? ': ' + evidenciaLimpia : ''}`;
      }).join('\n');
      bloqueAgent = `\n\nANÁLISIS DEL SISTEMA IA FUNCIONAL (úsalo como base clínica):\n${disfs}`;
      if (contextoAgent.notaMedico) bloqueAgent += `\n\nNOTA AL MÉDICO: ${limpiarIds(contextoAgent.notaMedico)}`;
    }

    const prompt = `Construye una Historia Clínica detallada y completa a partir del interrogatorio de Medicina Funcional.${bloqueAgent}

Los IDs siguen el formato sXX_campo (s01=datos generales, s03=motivo de consulta, s04=antecedentes familiares, s05=historia médica, s06=medicamentos, s07-s08=salud hormonal, s09=nutrición, s10=estrés/hormesis, s11=eje HPA, s12=coherencia cardíaca, s13=sueño, s14=hidratación, s15-s16=digestión, s17=evacuación, s18=salud oral, s19=disbiosis, s20-s21=permeabilidad, s22=glicotoxicidad, s23=fatiga muscular, s24=metilación, s25=hierro, s26=inflamación, s27=autoinmunidad, s28=dolor crónico, s29=vitamina D, s30=omega, s31=dislipidemia, s32=carga tóxica, s33=mitocondria, s34=neurología, s35=tiroides, s36=dimensión social/emocional).

Escala síntomas: 0=nunca/ausente, 1=leve, 2=moderado, 3=intenso/frecuente.

INSTRUCCIONES PARA REDACCIÓN:
- Escribe en prosa clínica completa, no en listas ni frases sueltas. Mínimo 2-4 oraciones por subcampo cuando haya datos disponibles.
- Integra los datos del interrogatorio con razonamiento clínico funcional. No te limites a transcribir — interpreta, correlaciona y contextualiza.
- Si hay datos de múltiples secciones relevantes para un subcampo, incorpóralos todos (ej: Síntomas asociados puede incluir datos de digestión, sueño, energía, etc.).
- Si un dato no está disponible, escribe "No reportado" — no inventes ni supongas.
- Usa terminología médico-clínica formal. El documento es para el médico tratante.

DATOS DEL INTERROGATORIO:
${camposClinicos.join('\n')}

Genera la Historia Clínica usando EXACTAMENTE estos encabezados y subencabezados (no los modifiques):

MOTIVO_CONSULTA:
Motivo principal: [Descripción detallada del síntoma o situación principal que motiva la consulta, incluyendo su naturaleza, localización y características principales]
Tiempo de evolución: [Duración exacta o aproximada, fecha o contexto de inicio, si es continuo o intermitente]
Síntoma o situación que genera la consulta: [Descripción amplia del impacto funcional, laboral y de calidad de vida que llevó al paciente a consultar]

ENFERMEDAD_ACTUAL:
Inicio: [Circunstancias, contexto y momento de aparición del cuadro. Factores asociados al inicio]
Forma de aparición: [Si fue súbita, gradual, relacionada con un evento específico, estrés, cambio de hábitos, etc.]
Evolución: [Curso temporal del cuadro: si ha mejorado, empeorado, fluctuado. Hitos relevantes en la evolución]
Síntomas asociados: [Todos los síntomas acompañantes reportados en el interrogatorio, organizados por sistemas. Incluir intensidad y frecuencia cuando estén disponibles]
Factores desencadenantes: [Situaciones, actividades, alimentos, emociones u otros factores que desencadenan o precipitan los síntomas]
Factores que mejoran o empeoran: [Descripción detallada de qué alivia y qué agrava el cuadro]
Tratamientos realizados: [Tratamientos previos o actuales para este motivo de consulta: farmacológicos, no farmacológicos, alternativos]
Medicamentos utilizados: [Medicamentos actuales con dosis y frecuencia si se reportaron. Medicamentos previos relevantes]
Exámenes previos: [Paraclínicos, imágenes u otros estudios realizados relacionados con el motivo de consulta]
Resultados relevantes: [Hallazgos significativos de los exámenes previos. Valores fuera de rango o patológicos]
Consultas anteriores por el mismo motivo: [Si ha consultado previamente, con quién, diagnósticos recibidos, respuesta a tratamientos]
Estado actual: [Descripción del estado actual del paciente: nivel de control del síntoma, funcionalidad, impacto en actividades diarias]

ANTECEDENTES:
Patológicos: [Enfermedades diagnosticadas, condiciones crónicas, episodios relevantes pasados con fechas aproximadas cuando estén disponibles]
Farmacológicos: [Medicamentos de uso regular actuales, suplementos, fitoterapia. Incluir dosis si se reportaron]
Quirúrgicos: [Procedimientos quirúrgicos previos con año aproximado si está disponible]
Alérgicos: [Alergias a medicamentos, alimentos, ambientales. Tipo de reacción si se reportó]
Familiares: [Enfermedades relevantes en familiares de primer y segundo grado con parentesco]
Ginecológicos: [Para pacientes femeninas: ciclo menstrual, paridad, anticonceptivos, menopausia, etc. Escribir "No aplica" solo si es masculino]
Tóxicos: [Tabaco (cantidad, años), alcohol (frecuencia, cantidad), otras sustancias, exposiciones ocupacionales o ambientales relevantes]

OBJETIVOS:
- [Objetivo terapéutico 1: específico, medible, priorizado por urgencia clínica]
- [Objetivo terapéutico 2]
- [Objetivo terapéutico 3]
- [Objetivo terapéutico 4 si aplica]
- [Objetivo terapéutico 5 si aplica]

OBSERVACIONES:
[Incoherencias clínicamente relevantes entre los datos del interrogatorio — solo si se contradicen de forma directa y significativa. Si no las hay, escribe exactamente: Ninguna]`;

    return prompt;
  }

  private parsearRespuestaIA(respuestaIA: string): AnalisisInterrogatorio {
    // Helper: extrae el bloque entre un encabezado y el siguiente encabezado en mayúsculas
    const extraerBloque = (texto: string, encabezado: string, siguiente?: string): string => {
      const patron = siguiente
        ? new RegExp(`${encabezado}:\\s*([\\s\\S]*?)(?=${siguiente}:|$)`, 'i')
        : new RegExp(`${encabezado}:\\s*([\\s\\S]*)$`, 'i');
      const m = texto.match(patron);
      return m ? m[1].trim() : '';
    };

    // Helper: extrae subcampo "Label: valor" de un bloque
    const extraerSubcampo = (bloque: string, label: string): string => {
      const m = bloque.match(new RegExp(`${label}:\\s*(.+?)(?=\\n[A-ZÁÉÍÓÚa-záéíóú][^:]*:|$)`, 's'));
      return m ? m[1].trim() : 'No reportado';
    };

    // Helper: lista de bullets
    const extraerLista = (bloque: string): string[] =>
      bloque.split('\n')
        .map(l => l.replace(/^[-•\d.\s]+/, '').trim())
        .filter(l => l.length > 0);

    // ── Extraer bloques principales ───────────────────────────────────────────
    const bloqueMotivo    = extraerBloque(respuestaIA, 'MOTIVO_CONSULTA',    'ENFERMEDAD_ACTUAL');
    const bloqueEnfActual = extraerBloque(respuestaIA, 'ENFERMEDAD_ACTUAL',  'ANTECEDENTES');
    const bloqueAntec     = extraerBloque(respuestaIA, 'ANTECEDENTES',       'OBJETIVOS');
    const bloqueObjetivos = extraerBloque(respuestaIA, 'OBJETIVOS',          'OBSERVACIONES');
    const bloqueObs       = extraerBloque(respuestaIA, 'OBSERVACIONES');

    // ── Construir historiaClinica estructurada ───────────────────────────────
    const historiaClinica: HistoriaClinica = {
      motivoConsulta: {
        motivoPrincipal:   extraerSubcampo(bloqueMotivo, 'Motivo principal'),
        tiempoEvolucion:   extraerSubcampo(bloqueMotivo, 'Tiempo de evolución'),
        sintomaConsulta:   extraerSubcampo(bloqueMotivo, 'Síntoma o situación que genera la consulta'),
      },
      enfermedadActual: {
        inicio:                    extraerSubcampo(bloqueEnfActual, 'Inicio'),
        formaAparicion:            extraerSubcampo(bloqueEnfActual, 'Forma de aparición'),
        evolucion:                 extraerSubcampo(bloqueEnfActual, 'Evolución'),
        sintomasAsociados:         extraerSubcampo(bloqueEnfActual, 'Síntomas asociados'),
        factoresDesencadenantes:   extraerSubcampo(bloqueEnfActual, 'Factores desencadenantes'),
        factoresMejoranEmpeoran:   extraerSubcampo(bloqueEnfActual, 'Factores que mejoran o empeoran'),
        tratamientosRealizados:    extraerSubcampo(bloqueEnfActual, 'Tratamientos realizados'),
        medicamentosUtilizados:    extraerSubcampo(bloqueEnfActual, 'Medicamentos utilizados'),
        examenesPrevios:           extraerSubcampo(bloqueEnfActual, 'Exámenes previos'),
        resultadosRelevantes:      extraerSubcampo(bloqueEnfActual, 'Resultados relevantes'),
        consultasAnteriores:       extraerSubcampo(bloqueEnfActual, 'Consultas anteriores por el mismo motivo'),
        estadoActual:              extraerSubcampo(bloqueEnfActual, 'Estado actual'),
      },
      antecedentes: {
        patologicos:   extraerSubcampo(bloqueAntec, 'Patológicos'),
        farmacologicos: extraerSubcampo(bloqueAntec, 'Farmacológicos'),
        quirurgicos:   extraerSubcampo(bloqueAntec, 'Quirúrgicos'),
        alergicos:     extraerSubcampo(bloqueAntec, 'Alérgicos'),
        familiares:    extraerSubcampo(bloqueAntec, 'Familiares'),
        ginecologicos: extraerSubcampo(bloqueAntec, 'Ginecológicos'),
        toxicos:       extraerSubcampo(bloqueAntec, 'Tóxicos'),
      },
    };

    // ── analisisIA: texto completo para compatibilidad con vistas existentes ──
    const analisisIA = [bloqueMotivo, bloqueEnfActual, bloqueAntec].filter(Boolean).join('\n\n') || respuestaIA;

    // ── Objetivos ────────────────────────────────────────────────────────────
    const objetivos = extraerLista(bloqueObjetivos);

    // ── Observaciones ────────────────────────────────────────────────────────
    let observacionesIA: string[] | undefined;
    if (bloqueObs) {
      const norm = bloqueObs.toLowerCase().trim();
      const esVacio = norm === 'ninguna' || norm === 'no hay' || norm.startsWith('no se observan') || norm.startsWith('no hay incoherencias') || norm.startsWith('no se identificaron');
      if (!esVacio) observacionesIA = extraerLista(bloqueObs);
    }

    return {
      analisisIA,
      historiaClinica,
      objetivos: objetivos.length > 0 ? objetivos : ['Mejorar el bienestar general', 'Optimizar la función del organismo', 'Establecer hábitos saludables'],
      observacionesIA,
    };
  }
}

export default new OpenAIService();

