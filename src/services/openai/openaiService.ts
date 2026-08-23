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
  async analizarInterrogatorio(respuestas: Record<string, any>): Promise<AnalisisInterrogatorio> {
    try {
      // Construir el prompt con las respuestas del paciente
      const prompt = this.construirPrompt(respuestas);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente médico especializado en Medicina Funcional. Tu tarea es analizar las respuestas de un interrogatorio médico y proporcionar:
1. Un análisis detallado de posibles disfunciones identificadas
2. Objetivos de salud específicos y alcanzables
3. Observaciones sobre posibles incoherencias en las respuestas

La fecha actual es ${new Date().toISOString().slice(0, 10)}. Usa esta fecha para calcular edades a partir de fechas de nacimiento — NO uses ninguna otra referencia temporal.

Responde siempre en español y con un enfoque profesional y empático.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
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

  private construirPrompt(respuestas: Record<string, any>): string {
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

    const prompt = `Analiza las siguientes respuestas de un interrogatorio de Medicina Funcional.

Los IDs siguen el formato sXX_campo donde XX es la sección del formulario (s01=datos generales, s03=motivo de consulta, s04=antecedentes familiares, s05=historia médica, s06=medicamentos, s07-s08=salud hormonal, s09=nutrición, s10=estrés positivo/hormesis, s11=tolerancia al estrés/eje HPA, s12=coherencia cardíaca, s13=sueño, s14=hidratación, s15-s16=digestión, s17=evacuación, s18=salud oral, s19=disbiosis, s20-s21=permeabilidad, s22=glicotoxicidad, s23=fatiga muscular, s24=metilación, s25=hierro, s26=inflamación, s27=autoinmunidad, s28=dolor crónico, s29=vitamina D, s30=omega, s31=dislipidemia, s32=carga tóxica, s33=mitocondria, s34=neurología, s35=tiroides, s36=dimensión social/emocional).

Los valores numéricos siguen la escala: 0=nunca/ausente, 1=leve, 2=moderado, 3=intenso/frecuente.

RESPUESTAS DEL PACIENTE:
${camposClinicos.join('\n')}

Por favor, proporciona:
1. Un análisis detallado (mínimo 300 palabras) sobre posibles disfunciones identificadas, rutas terapéuticas recomendadas y observaciones importantes basadas en Medicina Funcional.
2. Una lista de 3-5 objetivos de salud específicos y alcanzables para el paciente.
3. Incoherencias reales en las respuestas: solo datos que se contradigan entre sí de forma directa y clínicamente significativa (por ejemplo, sexo femenino pero embarazos = 0 con historial inconsistente). NO reportes como incoherencia: valores que coinciden aunque provengan de campos distintos (ej. edad calculada = edad declarada), ausencia de síntomas, respuestas dentro de rangos normales, ni ninguna observación trivial. Si no existe ninguna incoherencia real, escribe exactamente: Ninguna.

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

