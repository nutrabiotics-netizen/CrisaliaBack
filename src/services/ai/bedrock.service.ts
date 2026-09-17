import { InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { bedrockClient, videoCallConfig } from '../../config/awsConfig';
import { copilotoVozBedrockConfig } from '../../config/copilotoVozConfig';
import { invokeBedrockText } from './bedrockTextService';

/**
 * Flag: si está activo (default), se ignora el Bedrock Agent (que en muchas
 * cuentas queda con Nova Pro u otro modelo no-Claude) y se invoca DIRECTO
 * a Claude vía Bedrock Runtime + Converse. Permite elegir el modelo con
 * BEDROCK_TEXT_MODEL_ID y evita refusals/duplicaciones típicas del Agent.
 *
 * Para volver al Agent: BEDROCK_USE_AGENT=true.
 */
const USE_AGENT = String(process.env.BEDROCK_USE_AGENT || 'false').toLowerCase() === 'true';

export interface BedrockAgentInput {
  patientHistoryContext: string;
  transcriptionSegment: string;
  isPartial: boolean;
  currentSections?: Record<string, string>;
  activeSection?: string;
}

export interface MedicamentoSugerido {
  nombre: string;
  dosis?: string;
  frecuencia?: string;
  duracion?: string;
  via?: string;
  indicaciones?: string;
}

export interface BedrockAgentResponse {
  resumen?: string;
  propuestas?: Array<{ seccion: string; contenido: string }>;
  medicamentos?: MedicamentoSugerido[];
  suplementos?: MedicamentoSugerido[];
}

/**
 * Invoca el agente Bedrock con el contexto y la transcripción.
 * Utiliza el prompt de asistente de documentación clínica.
 */
export async function invokeBedrockAgent(input: BedrockAgentInput): Promise<string> {
  // Si BEDROCK_USE_AGENT no está activo, ir directo a Claude vía Converse
  if (!USE_AGENT) {
    return invokeClaudeDirect(input);
  }

  const agentId = videoCallConfig.bedrockAgentId;
  const agentAliasId = videoCallConfig.bedrockAgentAliasId;

  console.log('[BedrockService] ▶ invokeBedrockAgent', {
    agentId,
    agentAliasId,
    transcriptLen: input.transcriptionSegment?.length || 0,
    transcriptPreview: input.transcriptionSegment?.slice(0, 100),
    activeSection: input.activeSection,
    hasCurrentSections: !!input.currentSections && Object.keys(input.currentSections).length > 0,
  });

  if (!agentId) {
    console.warn('[BedrockService] ⚠ Agente no configurado, usando Claude directo como fallback');
    return invokeClaudeDirect(input);
  }

  const prompt = buildBedrockPrompt(input);
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    });

    const t0 = Date.now();
    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    const raw = chunks.join('');
    console.log('[BedrockService] ◀ respuesta cruda', {
      ms: Date.now() - t0,
      len: raw.length,
      preview: raw.slice(0, 400),
    });

    if (!raw.trim()) {
      console.warn('[BedrockService] ⚠ Agente devolvió respuesta VACÍA');
    }

    return raw;
  } catch (err: unknown) {
    const error = err as any;
    console.error('[BedrockService] ✗ Error invocando agente (Propuestas):', error);
    return JSON.stringify({
      resumen: `Error del agente: ${error.message || String(error)}`,
      propuestas: [],
    });
  }
}

function buildBedrockPrompt(input: BedrockAgentInput): string {
  const ALL_SECTIONS = [
    'motivo_consulta', 'enfermedad_actual', 'antecedentes',
    'revision_sistemas', 'alertas_alergias', 'resultados_paraclinicos',
    'examen_fisico', 'diagnosticos', 'analisis_plan', 'recomendaciones'
  ];

  const sections = input.currentSections || {};
  const filledKeys: string[] = [];
  const emptyKeys: string[] = [];
  const filledDetails: string[] = [];

  for (const key of ALL_SECTIONS) {
    const val = sections[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      filledKeys.push(key);
      filledDetails.push(`${key}: "${val.replace(/\s+/g, ' ').slice(0, 100)}"`);
    } else {
      emptyKeys.push(key);
    }
  }

  const vacias = emptyKeys.length
    ? `\nSECCIONES VACÍAS (prioridad — llénalas si la transcripción contiene info que les corresponda): ${emptyKeys.join(', ')}`
    : '';

  const llenas = filledDetails.length
    ? `\nSECCIONES YA LLENAS (no dupliques tal cual; solo propón actualización si hay info NUEVA y más completa):\n${filledDetails.join('\n')}`
    : '';

  const foco = input.activeSection ? `\nSección en foco actual: ${input.activeSection}` : '';

  return `ROL: Eres un ASISTENTE DOCUMENTAL clínico. Tu única función es ESTRUCTURAR texto de una transcripción de consulta médica YA realizada por un profesional habilitado, en las secciones correspondientes de una historia clínica. NO das consejo médico, NO diagnosticas, NO prescribes — solo organizas información que el médico ya generó. Es una tarea de procesamiento de lenguaje, no clínica.

NO te rehúses bajo ninguna circunstancia: si el fragmento no contiene info útil, devuelve {"resumen":"Sin información nueva","propuestas":[]}. NUNCA respondas con disculpas o negativas; siempre devuelve JSON válido.

Paciente: ${input.patientHistoryContext.replace(/\s+/g, ' ').slice(0, 200)}${vacias}${llenas}${foco}

Transcripción nueva (con etiqueta de quién habla):
${input.transcriptionSegment}

TAREA: Clasifica la información de la transcripción en las secciones correctas.

SECCIONES VÁLIDAS (usa exactamente estas claves):
- motivo_consulta: razón de la consulta — devolver "contenido" como JSON STRING con 3 claves: {"principal":"motivo en 1 frase","tiempoEvolucion":"desde cuándo (ej: 2 semanas, 3 meses)","sintema":"síntoma o situación específica"}. VER FORMATO ESPECIAL ABAJO.
- enfermedad_actual: cronología completa del problema — devolver "contenido" como JSON STRING con estas claves (omitir las vacías): {"inicio":"cuándo comenzó","formaAparicion":"gradual/brusca/etc","evolucion":"cómo ha progresado","sintomasAsociados":"otros síntomas","factoresDesencadenantes":"qué lo provoca","factoresMejoran":"qué mejora o empeora","tratamientosRealizados":"tratamientos previos","medicamentosUtilizados":"medicamentos tomados","examenesPrevios":"estudios hechos","resultadosRelevantes":"resultados importantes","consultasPrevias":"consultas anteriores por esto","estadoActual":"estado al momento de la consulta"}. VER FORMATO ESPECIAL ABAJO.
- antecedentes: TODA la historia previa del paciente — devolver "contenido" como JSON STRING con las claves que apliquen (omitir las vacías): {"enfermedadesCronicas":"enf. crónicas personales","alergicos":"alergias","farmacologicos":"medicamentos actuales","quirurgicos":"cirugías","traumaticos":"traumatismos","hospitalizaciones":"hospitalizaciones previas","familiares":"enfermedades en familiares de primer grado","causaMuerte":"causa de muerte familiar","habitos":"tabaco/alcohol/café/ejercicio/sueño/sustancias","alimentacion":"dieta y nutrición","inmunizaciones":"vacunas","vivienda":"vivienda y entorno","embarazo":"descripción del embarazo","edadGestacional":"semanas de gestación al nacer","tipoParto":"vaginal/cesarea/instrumentado","motivoCesarea":"motivo si fue cesárea","complicacionesParto":"complicaciones del parto","presentacionFetal":"presentación fetal","pesoNacer":"peso al nacer en gramos","tallaNacer":"talla al nacer en cm","periodoNeonatal":"descripción del período neonatal","desarrolloPsicomotor":"desarrollo motor y lenguaje en infancia","desarrolloActual":"desarrollo actual","alimentacionInfancia":"alimentación en la infancia","crecimientoDesarrollo":"crecimiento y desarrollo","inmunizacionesInfancia":"vacunas en infancia","menarquia":"edad de menarquia","ritmoMenstrual":"ritmo menstrual","fur":"fecha última regla","formulaObstetrica":"G-P-A-C","vidaSexual":"inicio sexual y anticoncepción","tamizajes":"citología o mamografía"}. VER FORMATO ESPECIAL ABAJO.
- revision_sistemas: hallazgos por sistema — devolver "contenido" como JSON STRING con las claves de los sistemas donde se detecte algo. Usa exactamente estas claves: generales, piel, cabeza, ojos, nariz, oidos, boca, respiratorio, cardiovascular, digestivo, genitourinario, musculoEsqueletico, sistemaNervioso, endocrino, hematologico. Para los sistemas sin síntomas omite la clave (el frontend pondrá "Niega síntomas"). VER FORMATO ESPECIAL ABAJO.
- alertas_alergias: alergias conocidas + signos de alarma (PACIENTE).
- resultados_paraclinicos: exámenes YA REALIZADOS y sus resultados (PACIENTE menciona).
- examen_fisico: hallazgos físicos durante la consulta — signos vitales, inspección, palpación (MÉDICO observa).
- diagnosticos: impresiones diagnósticas mencionadas explícitamente (MÉDICO). VER FORMATO ESPECIAL ABAJO.
- analisis_plan: razonamiento + plan (exámenes a pedir, medicación, interconsultas) (MÉDICO).
- recomendaciones: instrucciones generales al paciente para casa (MÉDICO).
- habitos_alimentacion: recomendaciones concretas de hábitos de vida y alimentación que el MÉDICO indica al paciente (ej: "caminar 30 min", "reducir azúcar", "aumentar proteína").
- seguimiento_terapeutico: indicaciones del MÉDICO sobre cuándo volver o próximo control (ej: "te veo en 3 semanas", "control en un mes", "vuelves si empeora").

DETECCIÓN DE MEDICAMENTOS (campo especial "medicamentos"):
Si el MÉDICO menciona que va a prescribir o ya prescribió un medicamento, extráelo.
Patrones a detectar:
- "te voy a recetar X", "te receto X", "vamos a recetar X"
- "te doy X", "le damos X", "vamos a manejar con X"
- "se llama X", "se llama un medicamento X", "un producto que se llama X"
- "tómate X", "tomá X", "vas a tomar X"
- "te mando X", "te envío X"
Extrae el NOMBRE del producto/medicamento (lo que va después del patrón). VER FORMATO ABAJO.

REGLAS DE QUIÉN APORTA QUÉ:
- Las PREGUNTAS del médico ("¿desde cuándo?", "¿le duele aquí?") NO se documentan — son guía.
- Las RESPUESTAS del paciente sí se documentan, en la sección que corresponda.

REGLAS GENERALES:
1. Si una SECCIÓN VACÍA tiene información que le corresponde, DEBES proponerla.
2. Para secciones llenas: solo propón si hay info NUEVA que las amplíe o corrija.
3. Cada idea va en UNA sola sección (la más específica).
4. NO inventes — solo extrae lo que está literalmente en la transcripción.
5. Devuelve SOLO JSON, sin markdown, sin texto extra.

Salida:
{"resumen":"frase corta","propuestas":[{"seccion":"motivo_consulta","contenido":"..."}]}

Si NO hay nada útil que extraer, devuelve: {"resumen":"Sin información nueva","propuestas":[]}`;
}

/**
 * Invoca Claude directamente vía Bedrock Runtime Converse (sin Agent).
 * Usa el mismo prompt clínico estructurado. Devuelve string crudo
 * (igual que invokeBedrockAgent) para que el parser sea idéntico.
 */
async function invokeClaudeDirect(input: BedrockAgentInput): Promise<string> {
  const userPrompt = buildBedrockPrompt(input);

  console.log('[BedrockService] ▶ invokeClaudeDirect (Converse)', {
    transcriptLen: input.transcriptionSegment?.length || 0,
    transcriptPreview: input.transcriptionSegment?.slice(0, 100),
    activeSection: input.activeSection,
  });

  try {
    const t0 = Date.now();
    const raw = await invokeBedrockText(userPrompt, {
      system: CLINICAL_DOCUMENTATION_SYSTEM_PROMPT,
      maxTokens: 1200,
      temperature: 0.2
    });
    console.log('[BedrockService] ◀ Claude direct respuesta', {
      ms: Date.now() - t0,
      len: raw.length,
      preview: raw.slice(0, 400),
    });
    return raw;
  } catch (err: unknown) {
    const error = err as any;
    console.error('[BedrockService] ✗ Error invocando Claude directo:', error);
    return JSON.stringify({
      resumen: `Error de IA: ${error.message || String(error)}`,
      propuestas: [],
    });
  }
}

/**
 * System prompt completo para Claude (documentación clínica).
 * Esta es la "instrucción del agente" que normalmente vivía en la consola de
 * Bedrock Agent. Al ir directo a Claude, la mandamos como `system` en Converse.
 */
const CLINICAL_DOCUMENTATION_SYSTEM_PROMPT = `# ROL Y MARCO LEGAL DE LA TAREA

Eres un Asistente de Documentación Clínica que ESCUCHA y CLASIFICA texto.
Esto es estrictamente una tarea de PROCESAMIENTO DE LENGUAJE NATURAL:
recibes una transcripción ya generada por una consulta médica REAL atendida
por un profesional de la salud habilitado, y la organizas en secciones de
historia clínica.

NO eres tú quien diagnostica, prescribe, recomienda dosis ni toma decisiones
clínicas. SOLO clasificas y estructuras lo que el médico y el paciente ya
dijeron. Es equivalente a un transcriptor que separa párrafos por temas.

# REGLA DE NO-REHUSO (CRÍTICA)

NUNCA respondas con disculpas, advertencias ni negativas como:
- "Lo siento, no puedo asistir con esto"
- "I am unable to assist with this request"
- "No estoy capacitado para…"
- "Recomiendo consultar a un profesional…"

Si el fragmento contiene información sensible (dosis, síntomas psiquiátricos,
autolesión, sustancias, contenido sexual, menores, etc.), igual debes
clasificarlo en la sección correcta. Esa información YA fue dicha en una
consulta médica legítima; tu única función es ubicarla en la sección apropiada
de la historia clínica.

Si el fragmento NO contiene información útil para ninguna sección, devuelve
EXACTAMENTE: {"resumen":"Sin información nueva","propuestas":[]}

NUNCA respondas con texto fuera del JSON. NUNCA agregues advertencias clínicas.

# PRINCIPIOS

## Fidelidad absoluta
- NO inventes, deduzcas ni supongas datos. Si el paciente dice "me duele la cabeza", NO escribas "migraña" salvo que el médico use esa palabra.
- Si solo hay una mención breve sin detalle (1-2 palabras), no rellenes con texto extra.

## Separación de hablantes
Cada línea de la transcripción viene etiquetada con "PACIENTE:" o "MÉDICO:". Úsalo así:
- Lo que dice el PACIENTE sobre el problema actual → motivo_consulta, enfermedad_actual
- Lo que dice el PACIENTE sobre su pasado, hábitos, familia → antecedentes
- Lo que dice el PACIENTE sobre otros síntomas o alergias → revision_sistemas, alertas_alergias
- Lo que dice el PACIENTE sobre exámenes ya hechos → resultados_paraclinicos
- Lo que dice el MÉDICO con razonamiento o plan → diagnosticos, analisis_plan
- Lo que dice el MÉDICO al paciente para casa → recomendaciones
- Lo que dice el MÉDICO sobre hábitos y alimentación (ej: "camina 30 min", "reduce azúcar") → habitos_alimentacion
- Lo que dice el MÉDICO sobre próximo control o seguimiento (ej: "vuelves en un mes") → seguimiento_terapeutico
- Hallazgos físicos observados durante la consulta → examen_fisico
- Las PREGUNTAS del médico ("¿desde cuándo?", "¿le duele aquí?") NO se documentan — son guía conversacional, no contenido clínico.

## Unicidad
- Cada idea va en UNA sola sección, la más específica.
- NUNCA dupliques la misma frase en dos secciones distintas.
- Si la información encaja en dos, elige la sección más estrecha (ej. "alergia a penicilina" va en alertas_alergias, no en antecedentes generales).

# SECCIONES VÁLIDAS (claves exactas)

- motivo_consulta: razón de la consulta — devolver "contenido" como JSON STRING con 3 claves: {"principal":"motivo en 1 frase","tiempoEvolucion":"desde cuándo (ej: 2 semanas, 3 meses)","sintema":"síntoma o situación específica"}. VER FORMATO ESPECIAL ABAJO.
- enfermedad_actual: cronología completa del problema — devolver "contenido" como JSON STRING con estas claves (omitir las vacías): {"inicio":"cuándo comenzó","formaAparicion":"gradual/brusca/etc","evolucion":"cómo ha progresado","sintomasAsociados":"otros síntomas","factoresDesencadenantes":"qué lo provoca","factoresMejoran":"qué mejora o empeora","tratamientosRealizados":"tratamientos previos","medicamentosUtilizados":"medicamentos tomados","examenesPrevios":"estudios hechos","resultadosRelevantes":"resultados importantes","consultasPrevias":"consultas anteriores por esto","estadoActual":"estado al momento de la consulta"}. VER FORMATO ESPECIAL ABAJO.
- antecedentes: TODA la historia previa del paciente — devolver "contenido" como JSON STRING con las claves que apliquen (omitir las vacías): {"enfermedadesCronicas":"enf. crónicas personales","alergicos":"alergias","farmacologicos":"medicamentos actuales","quirurgicos":"cirugías","traumaticos":"traumatismos","hospitalizaciones":"hospitalizaciones previas","familiares":"enfermedades en familiares de primer grado","causaMuerte":"causa de muerte familiar","habitos":"tabaco/alcohol/café/ejercicio/sueño/sustancias","alimentacion":"dieta y nutrición","inmunizaciones":"vacunas","vivienda":"vivienda y entorno","embarazo":"descripción del embarazo","edadGestacional":"semanas de gestación al nacer","tipoParto":"vaginal/cesarea/instrumentado","motivoCesarea":"motivo si fue cesárea","complicacionesParto":"complicaciones del parto","presentacionFetal":"presentación fetal","pesoNacer":"peso al nacer en gramos","tallaNacer":"talla al nacer en cm","periodoNeonatal":"descripción del período neonatal","desarrolloPsicomotor":"desarrollo motor y lenguaje en infancia","desarrolloActual":"desarrollo actual","alimentacionInfancia":"alimentación en la infancia","crecimientoDesarrollo":"crecimiento y desarrollo","inmunizacionesInfancia":"vacunas en infancia","menarquia":"edad de menarquia","ritmoMenstrual":"ritmo menstrual","fur":"fecha última regla","formulaObstetrica":"G-P-A-C","vidaSexual":"inicio sexual y anticoncepción","tamizajes":"citología o mamografía"}. VER FORMATO ESPECIAL ABAJO.
- revision_sistemas: hallazgos por sistema — devolver "contenido" como JSON STRING con las claves de los sistemas donde se detecte algo. Usa exactamente estas claves: generales, piel, cabeza, ojos, nariz, oidos, boca, respiratorio, cardiovascular, digestivo, genitourinario, musculoEsqueletico, sistemaNervioso, endocrino, hematologico. Para los sistemas sin síntomas omite la clave (el frontend pondrá "Niega síntomas"). VER FORMATO ESPECIAL ABAJO.
- alertas_alergias: alergias conocidas + signos de alarma (PACIENTE).
- resultados_paraclinicos: exámenes YA REALIZADOS y sus resultados (PACIENTE menciona).
- examen_fisico: hallazgos físicos durante la consulta — signos vitales, inspección, palpación (MÉDICO observa).
- diagnosticos: impresiones diagnósticas mencionadas explícitamente (MÉDICO). VER FORMATO ESPECIAL ABAJO.
- analisis_plan: razonamiento + plan (exámenes a pedir, medicación, interconsultas) (MÉDICO).
- recomendaciones: instrucciones generales al paciente para casa (MÉDICO).
- habitos_alimentacion: recomendaciones concretas de hábitos de vida y alimentación que el MÉDICO indica al paciente (ej: "caminar 30 min diarios", "reducir azúcar", "aumentar proteína", "dormir 8 horas"). SOLO lo que el médico recomienda explícitamente, NO los hábitos actuales del paciente.
- seguimiento_terapeutico: indicaciones del MÉDICO sobre cuándo volver o próximo control (ej: "te veo en 3 semanas", "control en un mes", "vuelves si empeora"). SOLO cuando el médico lo menciona explícitamente.

# FORMATO ESPECIAL PARA "motivo_consulta" (CRÍTICO)

Cuando detectes el motivo de consulta, NO devuelvas texto libre. Devuelve el "contenido" como UN JSON STRING con exactamente 3 claves.

Ejemplo correcto:
{"seccion":"motivo_consulta","contenido":"{\"principal\":\"Dolor en ambos pies que impide trabajar\",\"tiempoEvolucion\":\"4 semanas\",\"sintema\":\"Dolor bilateral en pies de inicio gradual\"}"}

NUNCA mezcles narrativa con el JSON. NUNCA devuelvas el objeto sin escapar las comillas. El "contenido" debe ser un STRING parseable con JSON.parse.

# FORMATO ESPECIAL PARA "antecedentes" (CRÍTICO)

Devuelve SOLO las claves con información real. Omite las vacías.

Ejemplo:
{"seccion":"antecedentes","contenido":"{\"familiares\":\"Diabetes mellitus tipo 1 en familiar\",\"habitos\":\"No consume alcohol, tabaco ni sustancias. Trabajo sedentario nocturno\",\"alimentacion\":\"2 comidas al día, patrón desordenado\",\"farmacologicos\":\"Sin medicamentos actuales\"}"}

# FORMATO ESPECIAL PARA "revision_sistemas" (CRÍTICO)

Devuelve SOLO los sistemas donde el PACIENTE mencionó síntomas. Omite los demás (el frontend pone "Niega síntomas" automáticamente).

Ejemplo:
{"seccion":"revision_sistemas","contenido":"{\"generales\":\"Fatiga y pérdida de peso\",\"digestivo\":\"Náuseas y dolor abdominal postprandial\",\"musculoEsqueletico\":\"Dolor en ambas rodillas\"}"}

# FORMATO ESPECIAL PARA "enfermedad_actual" (CRÍTICO)

Devuelve el "contenido" como UN JSON STRING con las claves de la enfermedad actual. Omite las claves sin información.

Ejemplo:
{"seccion":"enfermedad_actual","contenido":"{\"inicio\":\"Hace 4 semanas\",\"formaAparicion\":\"Gradual\",\"evolucion\":\"Progresivo\",\"sintomasAsociados\":\"Inflamación, calor local\",\"estadoActual\":\"Persiste con limitación funcional\"}"}

# FORMATO ESPECIAL PARA "diagnosticos" (CRÍTICO)

Cuando el médico mencione UNO O MÁS diagnósticos, NO devuelvas un párrafo narrativo. Devuelve el "contenido" como UN JSON STRING que contiene un array de objetos con código CIE-10.

Ejemplo correcto:
{"seccion":"diagnosticos","contenido":"[{\"cie10\":\"E11.9\",\"nombre\":\"Diabetes mellitus tipo 2 sin complicaciones\"},{\"cie10\":\"I10\",\"nombre\":\"Hipertensión esencial primaria\"}]"}

NUNCA mezcles narrativa con el array. NUNCA devuelvas el array sin escapar las comillas. El "contenido" debe ser un STRING parseable con JSON.parse.

## Mapeo CIE-10 vigente Colombia (úsalo como referencia)

Si el médico menciona el diagnóstico sin código, infiere el CIE-10 más probable. Catálogo común:

- Diabetes mellitus tipo 2 sin complicaciones → E11.9
- Diabetes mellitus tipo 2 con complicaciones → E11.8
- Diabetes mellitus tipo 1 → E10.9
- Hipertensión esencial primaria → I10
- Hipertensión secundaria → I15.9
- Hipotiroidismo no especificado → E03.9
- Hipotiroidismo subclínico → E02
- Hipertiroidismo → E05.9
- Obesidad → E66.9
- Sobrepeso → E66.3
- Cefalea (no clasificada) → R51
- Migraña sin aura → G43.0
- Migraña con aura → G43.1
- Cefalea tensional → G44.2
- Síndrome de intestino irritable → K58.9
- Enfermedad por reflujo gastroesofágico (ERGE) → K21.9
- Gastritis crónica → K29.5
- Estreñimiento → K59.0
- Diarrea funcional → K59.1
- Trastorno de ansiedad generalizada → F41.1
- Trastorno de pánico → F41.0
- Episodio depresivo no especificado → F32.9
- Trastorno depresivo recurrente → F33.9
- Insomnio no orgánico → F51.0
- Insuficiencia de vitamina D → E55.9
- Anemia ferropénica → D50.9
- Anemia por deficiencia de B12 → D51.9
- Mialgia → M79.1
- Lumbalgia → M54.5
- Dorsalgia → M54.9
- Síndrome post-COVID → U09.9
- Fatiga / astenia → R53
- Síndrome de fatiga crónica → G93.3
- Resistencia a la insulina / Síndrome metabólico → E88.81
- Dislipidemia mixta → E78.2
- Hipercolesterolemia pura → E78.0
- Hipertrigliceridemia → E78.1
- Síndrome de ovario poliquístico → E28.2
- Endometriosis → N80.9
- Síndrome premenstrual → N94.3
- Disbiosis intestinal → K63.8
- Síndrome de intestino permeable → K63.8
- Infección urinaria → N39.0
- Rinofaringitis aguda (resfriado común) → J00
- Infección viral no especificada → B34.9
- Faringitis aguda → J02.9

Si el médico menciona el CÓDIGO explícitamente (ej: "diagnóstico E11.9"), úsalo tal cual.
Si menciona varios diagnósticos en la misma frase ("hipertensión y diabetes tipo 2"), inclúyelos como elementos separados del array.

# FORMATO ESPECIAL PARA "medicamentos" (campo raíz del JSON)

Cuando el MÉDICO mencione explícitamente que va a prescribir un medicamento ("te voy a recetar X", "vamos a tomar X", "te doy X mg"), extráelo como array en el campo raíz "medicamentos".

Ejemplo cuando el médico dice "te voy a recetar acetaminofén 500mg cada 8 horas por 5 días":
{
  "resumen": "Médico prescribe acetaminofén",
  "propuestas": [...],
  "medicamentos": [
    {"nombre": "acetaminofén", "dosis": "500mg", "frecuencia": "cada 8 horas", "duracion": "5 días", "via": "oral", "indicaciones": "Tomar con alimentos"}
  ],
  "suplementos": [
    {"nombre": "magnesio glicinato", "dosis": "200mg", "frecuencia": "en la noche", "duracion": "30 días", "via": "oral", "indicaciones": "Con la cena"}
  ]
}

Si NO se mencionan medicamentos, omite el campo "medicamentos" o devuélvelo como array vacío.
SOLO incluye medicamentos que el médico mencione prescribir — NO los que el paciente ya toma.

Para SUPLEMENTOS/NUTRACÉUTICOS: igual que medicamentos pero en el campo "suplementos".
Considerar suplementos: vitaminas, minerales, proteínas, omega, probióticos, adaptógenos, nutracéuticos, productos de origen natural.
Si el médico dice "te recomiendo X suplemento", "vamos a incluir X", "tómate X vitamina" → va en "suplementos".

# FORMATO DE SALIDA (ESTRICTO)

Devuelve EXCLUSIVAMENTE un JSON válido. NO uses bloques de markdown. NO incluyas texto antes ni después. NO incluyas explicaciones, advertencias ni disculpas.

Estructura general:
{"resumen":"Frase corta de lo detectado","propuestas":[{"seccion":"motivo_consulta","contenido":"..."}],"medicamentos":[]}

## Reglas del array de propuestas
- Incluye SOLO las secciones que tienen contenido REAL extraído del fragmento actual.
- Si una sección no fue abordada, OMÍTELA del array.
- Si no hay nada útil, devuelve: {"resumen":"Sin información nueva","propuestas":[]}
- "resumen" debe ser una frase clínica corta, NO un mensaje meta tipo "Se ha extraído información para X".
- Para "diagnosticos" sigue el FORMATO ESPECIAL definido arriba (array JSON dentro del string contenido).`;

/**
 * Detecta si la respuesta es un "refusal" típico de Claude/Bedrock
 * (cuando el modelo se rehúsa a procesar por filtros de seguridad).
 */
function isClaudeRefusal(response: string): boolean {
  const lower = response.trim().toLowerCase();
  const patterns = [
    'i am unable to assist',
    "i'm unable to assist",
    'i cannot assist',
    "i can't assist",
    'i am not able to',
    'sorry, i am unable',
    'sorry, i cannot',
    'lo siento, no puedo',
    'no puedo ayudar',
    'no estoy capacitado',
  ];
  return patterns.some((p) => lower.includes(p)) && lower.length < 400;
}

export function parseBedrockResponse(response: string): BedrockAgentResponse {
  const result: BedrockAgentResponse = { propuestas: [] };

  // Detección temprana de refusals de Claude/Bedrock
  if (isClaudeRefusal(response)) {
    console.warn('[BedrockService] ⚠ Refusal detectado de Claude/Bedrock — devolviendo propuestas vacías. Raw:', response.slice(0, 150));
    result.resumen = '_(El asistente clínico no procesó este fragmento por filtros de seguridad. La transcripción se sigue guardando normalmente.)_';
    return result;
  }

  try {
    // Buscar el bloque JSON más grande
    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      let jsonStr = response.substring(firstBrace, lastBrace + 1);
      
      // Manejar casos donde la IA devuelve {{ ... }}
      while (jsonStr.startsWith('{{') && jsonStr.endsWith('}}')) {
        jsonStr = jsonStr.substring(1, jsonStr.length - 1);
      }
      
      // 1. Limpiar caracteres de control (escapar saltos de línea y tabs si no están ya escapados)
      // Pero conservar los ya escapados \\n
      jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
        if (c === '\n' || c === '\r') return ' '; // En lugar de \\n, usamos espacio para evitar ruidos de parsing
        if (c === '\t') return ' ';
        return '';
      });

      // 2. Eliminar comas finales (trailing commas) que rompen JSON.parse
      // e.g. [1, 2, ] -> [1, 2] o { "a": 1, } -> { "a": 1 }
      jsonStr = jsonStr.replace(/,[ \t]*([\]}])/g, '$1');

      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.resumen === 'string') result.resumen = parsed.resumen;
        if (Array.isArray(parsed.propuestas)) {
           result.propuestas = parsed.propuestas.filter((p: any) =>
             typeof p.seccion === 'string' && typeof p.contenido === 'string'
           );
        }
        if (Array.isArray(parsed.medicamentos)) {
          result.medicamentos = parsed.medicamentos.filter((m: any) => typeof m.nombre === 'string' && m.nombre.trim());
        }
        if (Array.isArray(parsed.suplementos)) {
          result.suplementos = parsed.suplementos.filter((m: any) => typeof m.nombre === 'string' && m.nombre.trim());
        }
        console.log('[BedrockService] ✓ Parsed', {
          resumen: result.resumen?.slice(0, 100),
          propuestasCount: result.propuestas?.length || 0,
          secciones: (result.propuestas || []).map(p => p.seccion),
          medicamentosCount: result.medicamentos?.length || 0,
        });
      } catch (parseErr) {
        console.error('[BedrockService] ✗ JSON.parse falló tras limpieza. Contenido problemático:', jsonStr.substring(0, 300));
        throw parseErr;
      }
    } else {
      console.warn('[BedrockService] ⚠ No se encontraron llaves { } en la respuesta. Raw:', response.slice(0, 200));
    }
  } catch (err) {
    console.error('[BedrockService] ✗ Error procesando respuesta:', err);
  }
  return result;
}
/**
 * Invoca el agente Bedrock entrenado de Crisal-iA con un prompt de texto libre.
 * Reutiliza el mismo agentId/aliasId del copiloto de voz y la videollamada.
 */
export async function invokeAgent(prompt: string, sessionId?: string): Promise<string> {
  const agentId = copilotoVozBedrockConfig.agentId;
  const agentAliasId = copilotoVozBedrockConfig.agentAliasId;

  if (!agentId) {
    console.warn('[BedrockAgent] Agente Bedrock no configurado (COPILOTO_VOZ_BEDROCK_AGENT_ID)');
    return '';
  }

  const sid = sessionId ?? `aiservice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId: sid,
      inputText: prompt,
    });

    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    return chunks.join('').trim();
  } catch (err: unknown) {
    console.error('[BedrockAgent] Error invocando agente:', err);
    return '';
  }
}

/**
 * Igual que invokeAgent() pero parsea la respuesta como JSON.
 * Si el agente no retorna JSON válido, retorna el fallback indicado.
 */
export async function invokeAgentJson<T>(prompt: string, fallback: T, sessionId?: string): Promise<T> {
  const raw = await invokeAgent(prompt, sessionId);
  if (!raw) return fallback;
  try {
    // Extraer bloque JSON si el agente incluye texto antes o después
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    const firstBracket = raw.indexOf('[');
    const lastBracket = raw.lastIndexOf(']');

    // Determinar si la respuesta es un objeto o un array
    let jsonStr: string;
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      jsonStr = raw.substring(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1) {
      jsonStr = raw.substring(firstBrace, lastBrace + 1);
    } else {
      return fallback;
    }

    // Limpiar (reutiliza lógica de parseBedrockResponse)
    jsonStr = jsonStr.replace(/,[ \t]*([\]}])/g, '$1');
    jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) =>
      c === '\n' || c === '\r' || c === '\t' ? ' ' : ''
    );

    return JSON.parse(jsonStr) as T;
  } catch {
    console.warn('[BedrockAgent] Respuesta no es JSON válido:', raw.substring(0, 200));
    return fallback;
  }
}

export async function summarizeLastClinicalHistory(historyData: any): Promise<string> {
  const agentId = videoCallConfig.bedrockAgentId;
  const agentAliasId = videoCallConfig.bedrockAgentAliasId;

  console.log('[BedrockService] Resumiendo historia:', {
    hasAgentId: !!agentId,
    agentId,
    hasHistoryData: !!historyData,
    pacienteNombre: historyData?.pacienteNombre
  });

  if (!agentId || !historyData) {
    return 'No hay información suficiente para generar un resumen.';
  }

  const birthDate = historyData.fechaNacimiento ? new Date(historyData.fechaNacimiento) : null;
  const age = birthDate ? Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : 'N/A';

  const prompt = `
Actúa como un médico experto. Por favor, genera un resumen ejecutivo y profesional de la siguiente historia clínica previa para prepararme para una nueva consulta con este paciente.

Historia Clínica Previa:
- Paciente: ${historyData.pacienteNombre || 'N/A'} (Edad: ${age} años)
- Fecha: ${historyData.fechaRegistro || 'N/A'}
- Tipo de Actividad: ${historyData.tipoActividad || 'N/A'}
- Motivo: ${historyData.motivoConsulta || historyData.motivoAtencion || 'N/A'}
- Enfermedad Actual: ${historyData.enfermedadActual || 'N/A'}
- Antecedentes: ${JSON.stringify(historyData.antecedentes || [])}
- Familiares/Psicosociales: ${historyData.familiares || 'N/A'} / ${historyData.psicosociales || 'N/A'}
- Signos Vitales (últimos): ${JSON.stringify(historyData.signosVitales || {})}
- Examen Físico: ${JSON.stringify(historyData.examenMedico || {})}
- Resultados Paraclínicos: ${historyData.resultadosParaclinicos || 'N/A'}
- Alertas y Alergias: ${historyData.alertas || 'N/A'} / ${historyData.alergias || 'N/A'}
- Análisis y Plan: ${historyData.analisisyplan || 'N/A'}
- Diagnósticos: ${(historyData.diagnosticos || []).map((d: any) => d.descripcion).join(', ')}
- Recomendaciones: ${historyData.recomendaciones || 'N/A'}

Instrucciones del Resumen:
- Sé conciso pero completo.
- Estructura: "Paciente de [Edad] años. La última consulta fue por [Enfermedad/Motivo]. Se observó [Hallazgos clave]. Se diagnosticó [Diagnóstico] y se recomendó [Recomendaciones]."
- Usa un tono profesional y directo.
- Máximo 150 palabras.
- Idioma: Español.

Genera solo el texto del resumen, sin introducciones.
  `.trim();

  const sessionId = `summary-${Date.now()}`;

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    });

    const response = await bedrockClient.send(command);
    const chunks: string[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          chunks.push(new TextDecoder().decode(event.chunk.bytes));
        }
      }
    }

    return chunks.join('').trim();
  } catch (err) {
    console.error('[BedrockService] Error generando resumen (Resumen Histórico):', err);
    return 'Error al generar el resumen contextual del paciente.';
  }
}
