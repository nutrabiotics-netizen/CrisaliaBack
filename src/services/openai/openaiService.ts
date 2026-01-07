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

Responde siempre en español y con un enfoque profesional y empático.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
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
    let prompt = `Analiza las siguientes respuestas de un interrogatorio médico de Medicina Funcional:\n\n`;

    // Mapeo de IDs de preguntas a descripciones legibles
    const mapeoPreguntas: Record<string, string> = {
      motivo_consulta: 'Motivo principal de consulta',
      sintomas_principales: 'Síntomas principales',
      duracion_sintomas: 'Duración de los síntomas',
      enfermedades_previas: 'Enfermedades previas',
      medicamentos_actuales: 'Medicamentos actuales',
      alergias: 'Alergias conocidas',
      alimentacion: 'Alimentación',
      horas_sueno: 'Horas de sueño',
      calidad_sueno: 'Calidad del sueño',
      ejercicio: 'Ejercicio físico',
      nivel_estres: 'Nivel de estrés',
      digestion: 'Problemas digestivos',
      sintomas_digestivos: 'Síntomas digestivos específicos',
      nivel_energia: 'Nivel de energía',
      estado_animo: 'Estado de ánimo',
      cambios_peso: 'Cambios de peso',
      apetito: 'Apetito',
      objetivos_salud: 'Objetivos de salud'
    };

    // Agregar cada respuesta al prompt
    Object.entries(respuestas).forEach(([id, respuesta]) => {
      const descripcion = mapeoPreguntas[id] || id;
      if (respuesta !== undefined && respuesta !== null && respuesta !== '') {
        if (Array.isArray(respuesta)) {
          prompt += `${descripcion}: ${respuesta.join(', ')}\n`;
        } else {
          prompt += `${descripcion}: ${respuesta}\n`;
        }
      }
    });

    prompt += `\nPor favor, proporciona:
1. Un análisis detallado (mínimo 300 palabras) sobre posibles disfunciones identificadas, rutas terapéuticas recomendadas y observaciones importantes basadas en Medicina Funcional.
2. Una lista de 3-5 objetivos de salud específicos y alcanzables para el paciente.
3. Cualquier observación sobre posibles incoherencias o información que requiera aclaración.

Formato de respuesta (usa exactamente estos encabezados):
ANALISIS:
[tu análisis aquí]

OBJETIVOS:
- Objetivo 1
- Objetivo 2
- Objetivo 3

OBSERVACIONES:
[observaciones sobre incoherencias o información que requiera aclaración, si las hay]`;

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
      if (observacionesTexto && observacionesTexto.toLowerCase() !== 'ninguna' && observacionesTexto.toLowerCase() !== 'no hay') {
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

