import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface AnalisisInterrogatorio {
  analisisIA: string;
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
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Eres un médico especialista en Medicina Funcional con formación clínica avanzada. Tu tarea es integrar los datos del interrogatorio con el análisis fisiopatológico ya realizado por el sistema de IA y producir un documento clínico estructurado con:
1. Un análisis clínico detallado usando terminología médica funcional precisa
2. Objetivos terapéuticos específicos, medibles y priorizados
3. Incoherencias clínicamente relevantes en los datos

La fecha actual es ${new Date().toISOString().slice(0, 10)}. Usa esta fecha para calcular edades.

Usa lenguaje médico-clínico formal. Menciona mecanismos fisiopatológicos, ejes disfuncionales y biomarcadores relevantes cuando aplique. El documento será leído por el médico tratante, no por el paciente.

IMPORTANTE: NUNCA incluyas identificadores técnicos de campo en tu análisis (como s01, s19, s22, s03, s04 u otros códigos alfanuméricos internos). Usa únicamente términos clínicos y nombres de sistemas fisiológicos.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
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
        if (typeof valor[0] === 'object') {
          // Objetos complejos: serializar compacto
          valorStr = JSON.stringify(valor).slice(0, 200);
        } else {
          valorStr = valor.join(', ');
        }
      } else if (typeof valor === 'object') {
        valorStr = JSON.stringify(valor).slice(0, 200);
      } else {
        valorStr = String(valor).slice(0, 200);
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

    const prompt = `Integra el análisis fisiopatológico con los datos del interrogatorio de Medicina Funcional.${bloqueAgent}

Los IDs siguen el formato sXX_campo (s01=datos generales, s03=motivo de consulta, s04=antecedentes familiares, s05=historia médica, s06=medicamentos, s07-s08=salud hormonal, s09=nutrición, s10=estrés/hormesis, s11=eje HPA, s12=coherencia cardíaca, s13=sueño, s14=hidratación, s15-s16=digestión, s17=evacuación, s18=salud oral, s19=disbiosis, s20-s21=permeabilidad, s22=glicotoxicidad, s23=fatiga muscular, s24=metilación, s25=hierro, s26=inflamación, s27=autoinmunidad, s28=dolor crónico, s29=vitamina D, s30=omega, s31=dislipidemia, s32=carga tóxica, s33=mitocondria, s34=neurología, s35=tiroides, s36=dimensión social/emocional).

Escala: 0=nunca/ausente, 1=leve, 2=moderado, 3=intenso/frecuente.

DATOS DEL INTERROGATORIO:
${camposClinicos.join('\n')}

Proporciona en lenguaje médico-clínico formal:
1. Análisis clínico detallado (mínimo 400 palabras): integra las disfunciones identificadas por el sistema IA con los datos del interrogatorio. Menciona mecanismos fisiopatológicos, ejes disfuncionales implicados, interacciones entre sistemas y recomendaciones de paraclínicos confirmatorios con sus biomarcadores específicos.
2. Objetivos terapéuticos: 3-5 objetivos específicos, medibles y priorizados según urgencia clínica.
3. Incoherencias clínicamente relevantes: solo datos que se contradigan entre sí de forma directa y significativa. Si no las hay, escribe exactamente: Ninguna.

Formato de respuesta (usa exactamente estos encabezados):
ANALISIS:
[tu análisis aquí]

OBJETIVOS:
- Objetivo 1
- Objetivo 2
- Objetivo 3

OBSERVACIONES:
[incoherencias reales únicamente, o "Ninguna" si no las hay]`;

    return prompt;
  }

  private parsearRespuestaIA(respuestaIA: string): AnalisisInterrogatorio {
    const analisis: AnalisisInterrogatorio = {
      analisisIA: '',
      objetivos: [],
      observacionesIA: []
    };

    // Extraer análisis
    const analisisMatch = respuestaIA.match(/ANALISIS:\s*([\s\S]*?)(?=OBJETIVOS:|OBSERVACIONES:|$)/i);
    if (analisisMatch) {
      analisis.analisisIA = analisisMatch[1].trim();
    } else {
      // Si no encuentra el formato, usar todo como análisis
      analisis.analisisIA = respuestaIA;
    }

    // Extraer objetivos
    const objetivosMatch = respuestaIA.match(/OBJETIVOS:\s*([\s\S]*?)(?=OBSERVACIONES:|$)/i);
    if (objetivosMatch) {
      const objetivosTexto = objetivosMatch[1].trim();
      // Dividir por líneas que empiecen con "-" o números
      analisis.objetivos = objetivosTexto
        .split('\n')
        .map(line => line.replace(/^[-•\d.\s]+/, '').trim())
        .filter(obj => obj.length > 0);
    }

    // Extraer observaciones
    const observacionesMatch = respuestaIA.match(/OBSERVACIONES:\s*([\s\S]*?)$/i);
    if (observacionesMatch) {
      const observacionesTexto = observacionesMatch[1].trim();
      const textoNorm = observacionesTexto.toLowerCase().trim();
      const esVacio = !observacionesTexto ||
        textoNorm === 'ninguna' || textoNorm === 'no hay' ||
        textoNorm === 'no se identificaron incoherencias' ||
        textoNorm === 'no hay incoherencias' ||
        textoNorm.startsWith('no se observan') ||
        textoNorm.startsWith('no hay incoherencias');
      if (!esVacio) {
        analisis.observacionesIA = observacionesTexto
          .split('\n')
          .map(line => line.replace(/^[-•\d.\s]+/, '').trim())
          .filter(obs => obs.length > 0);
      }
    }

    // Validar que tengamos al menos el análisis
    if (!analisis.analisisIA || analisis.analisisIA.length < 50) {
      analisis.analisisIA = respuestaIA;
    }

    // Asegurar que tengamos al menos algunos objetivos
    if (analisis.objetivos.length === 0) {
      analisis.objetivos = [
        'Mejorar el bienestar general',
        'Optimizar la función del organismo',
        'Establecer hábitos saludables'
      ];
    }

    return analisis;
  }
}

export default new OpenAIService();

