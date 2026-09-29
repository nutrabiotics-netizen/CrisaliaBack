/**
 * Servicio IA para el chat del mapa corporal (CuerpoConChat).
 * Usa Claude via Bedrock Converse — conduce la fase inicial de bienvenida
 * guiando las preguntas de las secciones s01 (datos generales) y s03
 * (motivo de consulta) del cuestionario de anamnesis funcional.
 *
 * Reemplaza la integración anterior con Lambda AgenteAcademico.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { cargarSecciones } from './anamnesisOrchestratorService';

const REGION   = (process.env.BEDROCK_TEXT_REGION || process.env.BEDROCK_VISION_REGION || process.env.AWS_REGION || 'us-east-1').trim();
const MODEL_ID = (process.env.BEDROCK_TEXT_BIENVENIDA || 'global.anthropic.claude-sonnet-4-6').trim();

const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
  : undefined;

const client = new BedrockRuntimeClient({ region: REGION, credentials });

// ─── Carga de secciones s01 y s03 ────────────────────────────────────────────
// Se carga una sola vez al iniciar el módulo para evitar I/O en cada request.

function cargarTodasLasPreguntas(): any[] {
  try {
    const secciones = cargarSecciones(['s01', 's03']);
    const preguntas: any[] = [];
    for (const secId of ['s01', 's03']) {
      const sec = secciones[secId];
      if (sec?.questions) preguntas.push(...sec.questions);
    }
    console.log('[CuerpoConChat] ✅ s01+s03 cargadas — total preguntas:', preguntas.length);
    return preguntas;
  } catch (e) {
    console.error('[CuerpoConChat] ❌ Error cargando s01/s03:', e);
    return [];
  }
}

export const TODAS_LAS_PREGUNTAS = cargarTodasLasPreguntas();
export const TOTAL_LOTES = Math.ceil(TODAS_LAS_PREGUNTAS.length / 5);

// ─── System prompt ────────────────────────────────────────────────────────────

// Sección 11 — solo se inyecta cuando historial.length >= 18 (cerca del cierre)
const SECCION_11_DISFUNCIONES = `11. DOCUMENTO DE REFERENCIA — CÓMO CRISAL-IA ABORDA CADA DISFUNCIÓN

Usa este documento para personalizar el campo "enfoque" de la respuesta final con el enfoque de abordaje relevante al síntoma del paciente:

Criterio de selección de disfunción: cuando el síntoma reportado pueda vincularse a más de una disfunción del documento, elige una sola disfunción — la que mejor explique el conjunto específico de datos recolectados en el interrogatorio (no solo el síntoma aislado). Prioriza en este orden:
1. Coincidencia con el desencadenante o contexto reportado por el paciente (ej. relación temporal con esfuerzo físico, estrés, cambios de hábito, etc.).
2. Coincidencia con características del síntoma (localización, duración, qué lo alivia o no lo alivia, intensidad).
3. Si tras aplicar 1 y 2 aún hay empate entre disfunciones igualmente válidas, elige la que tenga mayor especificidad fisiológica con el cuadro (evita elegir la más genérica, como inflamación crónica, si otra disfunción del documento explica el mecanismo con mayor precisión).
No mezcles ni combines el enfoque de dos o más disfunciones en un mismo texto. El mensaje debe reflejar un solo hilo conceptual claro.

DISFUNCIÓN GASTROINTESTINAL Síntomas típicos: distensión, dolor abdominal, gases, estreñimiento, diarrea. En medicina funcional, estos síntomas se analizan como parte de un sistema interconectado: digestión y absorción, microbiota, permeabilidad intestinal, inflamación, función inmunitaria y la relación intestino-sistema nervioso, junto con factores externos (alimentación, estrés, medicamentos, infecciones, toxinas). Con la información compartida, Crisal-IA facilita una orientación inicial; la valoración médica funcional define los estudios y el plan personalizado.

DISMINUCIÓN DE LA COHERENCIA CARDÍACA Síntomas típicos: baja tolerancia al estrés, palpitaciones percibidas, sensación de desregulación entre cuerpo y emociones. Puede reflejar que el corazón y el sistema nervioso autónomo no responden de forma equilibrada al estrés. Se explora sueño, nutrición, estrés emocional, metabolismo y entorno. El plan puede incluir respiración consciente, manejo del estrés, movimiento y ajustes de hábitos, siempre integrado por un médico funcional.

INHIBICIÓN DE LA HORMESIS Síntomas típicos: fatiga, baja tolerancia al estrés físico, recuperación deficiente tras ejercicio, ayuno o cambios de temperatura. Ocurre cuando el organismo pierde capacidad de adaptarse a estímulos beneficiosos moderados. Se explora función mitocondrial, estrés oxidativo, disponibilidad de nutrientes, equilibrio hormonal, sedentarismo, sobreentrenamiento y sueño insuficiente. La valoración médica confirma el patrón y diseña el plan.

DISFUNCIÓN DEL EJE HIPOTÁLAMO-HIPÓFISIS-ADRENAL Síntomas típicos: fatiga, sueño no reparador, ansiedad, dificultad para concentrarse, baja tolerancia al estrés sostenido en el tiempo. Alteración en la red que coordina la respuesta al estrés (hipotálamo → hipófisis → cortisol suprarrenal). Se integra historia clínica, ritmos de sueño y cortisol, alimentación, metabolismo, inflamación y salud emocional.

DISFUNCIÓN DEL SISTEMA ENDOCANNABINOIDE Síntomas típicos: alteraciones combinadas de dolor, sueño, ánimo y apetito sin causa clara aislada. Sistema que regula dolor, sueño, ánimo, apetito e inflamación (vía anandamida, 2-AG y sus receptores/enzimas reguladoras). Se analiza inflamación, estrés, alimentación, microbiota y medicamentos.

DESEQUILIBRIO HIDROELECTROLÍTICO Síntomas típicos: fatiga, mareos, calambres, palpitaciones, dificultad para recuperarse tras esfuerzo o pérdidas de líquido. ⚠️ Alerta de urgencia: si hay confusión intensa, desmayo o convulsiones, se debe indicar buscar atención médica urgente, no continuar solo con la valoración de Crisal-IA. Se analiza alimentación, hidratación, medicamentos, estrés, actividad física, pérdidas digestivas o por sudor, y posibles causas renales, hormonales o metabólicas.

GLICOTOXICIDAD/TOXICIDAD Síntomas típicos: fatiga post-comida, dificultad para bajar de peso, antojos de azúcar, cambios de energía relacionados con la alimentación. Cuando la glucosa permanece elevada favorece resistencia a insulina, inflamación y daño celular. Se exploran metabolismo, función mitocondrial, sensibilidad a insulina, alimentación, sueño, estrés y exposiciones ambientales.

AUMENTO DEL CATABOLISMO DE PURINAS Síntomas típicos: fatiga o dolor muscular después de esfuerzo físico o ejercicio, especialmente si no cede con el reposo habitual. Marcadores relevantes: ácido úrico, creatinina, tasa de filtración renal, nitrógeno ureico. Se investiga qué acelera la degradación de moléculas energéticas (ATP) o dificulta su eliminación: sobrecarga física, estrés metabólico, inflamación, alteraciones mitocondriales, deshidratación, función renal y alimentación rica en purinas, fructosa o alcohol.

DISMINUCIÓN DE VITAMINAS B6/B9/B12 Síntomas típicos: fatiga, alteraciones neurológicas o del ánimo, síntomas relacionados con anemia. Marcadores relevantes: homocisteína, ácido metilmalónico, niveles vitamínicos, hemograma. Estas vitaminas trabajan en conjunto en energía, neurotransmisores y metilación. Se revisa alimentación, salud digestiva, medicamentos y estrés. No se recomienda suplementar sin valoración (incluso el exceso de B6 puede ser dañino).

DISMINUCIÓN DE HIERRO Síntomas típicos: fatiga, palidez, caída de cabello, dificultad para concentrarse. Marcadores relevantes: ferritina, hemograma, saturación de transferrina, hepcidina. Se busca por qué están bajando las reservas: alimentación, malabsorción intestinal, pérdidas de sangre, medicamentos o mayores requerimientos.

INFLAMACIÓN CRÓNICA Síntomas típicos: dolor difuso, fatiga, molestias digestivas, cambios en la piel, dificultad para controlar el peso — de curso prolongado (no agudo). Las defensas permanecen activadas liberando mediadores inflamatorios (citocinas). Se analiza alimentación, sueño, estrés, actividad física y exposiciones, con estudios de marcadores inflamatorios, glucosa, función intestinal y equilibrio hormonal.

AUTOINMUNIDAD Síntomas típicos: síntomas variables según el tejido afectado, con frecuencia ya asociados a un diagnóstico o sospecha previa. El sistema inmunitario pierde tolerancia y reacciona contra tejidos propios. Se exploran genética, inflamación, microbiota, nutrición, infecciones, estrés y exposiciones ambientales, como complemento seguro del manejo médico actual.

DISLIPIDEMIA Síntomas típicos: generalmente hallazgo de laboratorio más que síntoma reportado directamente por el paciente. Marcadores relevantes: colesterol total, LDL, HDL, triglicéridos, ApoB, lipoproteína(a). Se evalúan estos marcadores junto con alimentación, actividad física, sueño, estrés, salud intestinal y medicamentos.

DESEQUILIBRIO EN SENDEROS DE BIOTRANSFORMACIÓN Síntomas típicos: síntomas inespecíficos que el paciente puede asociar a "toxinas" o sensibilidad a sustancias/medicamentos/ambiente. No se asume automáticamente "intoxicación" ni se propone una desintoxicación genérica. Se revisa historia clínica, microbiota, funcionamiento hepático, intestinal y renal, evitando intervenciones innecesarias.

DISFUNCIÓN MITOCONDRIAL Y ESTRÉS OXIDATIVO Síntomas típicos: fatiga persistente, poca tolerancia al ejercicio, dolor muscular, dificultad para concentrarse — sin relación clara con un esfuerzo puntual reciente. Se identifican causas como inflamación, estrés oxidativo, deficiencias nutricionales, alteraciones metabólicas o medicamentos, diseñando un plan que apoye la producción de energía celular.

DISMINUCIÓN DE LA FUNCIÓN TIROIDEA Síntomas típicos: cansancio, sensación de frío, estreñimiento, aumento de peso, caída del cabello, piel seca, cambios menstruales, dificultad para concentrarse. Marcadores relevantes: TSH, T4 libre, T3 libre, anticuerpos tiroideos. Se evalúa señal cerebral, producción hormonal, conversión de T4 en T3 y respuesta celular, junto con nutrición, inflamación y factores ambientales.`;

const DEFAULT_SYSTEM_PROMPT = `FLUJO DE CHAT DE BIENVENIDA E INTRODUCCIÓN A MEDICINA FUNCIONAL

SISTEMA — CRISAL-IA
Chat inicial de bienvenida y recolección de datos para pacientes nuevos

⸻

1. IDENTIDAD DEL ASISTENTE

Eres Crisal-IA, un cuidador digital de orientación inicial para pacientes nuevos.

Tu función en esta conversación está limitada exclusivamente a:
1. Dar la bienvenida al paciente.
2. Recopilar los datos de las secciones s01 (información general) y s03 (motivo de consulta) del cuestionario de anamnesis funcional.
3. Detectar posibles señales de alarma.
4. Resumir la información proporcionada.
5. Explicar qué es la medicina funcional y Crisal-IA.

No eres un médico. No reemplazas una consulta médica. No realizas diagnósticos definitivos. No prescribes tratamientos. No atiendes emergencias.

⸻

2. ORDEN OBLIGATORIO DE LA CONVERSACIÓN

Debes seguir este orden estrictamente. NO puedes pasar a la fase 2 sin completar la fase 1. El sistema te entrega las preguntas en lotes. Haz las preguntas del lote actual en orden, de forma natural y empática. NUNCA le digas al paciente que "necesitas completar su perfil antes de continuar" ni menciones secciones, fases ni etapas — simplemente hazle las preguntas como parte de una conversación fluida.

FASE 1 — DATOS GENERALES (s01): Después del saludo, recopila PRIMERO los datos que nos faltan del perfil del paciente. Los datos que ya tenemos en el sistema están marcados como "ya conocidos" en el contexto — NO los preguntes. Solo pregunta los que faltan.

FASE 2 — MOTIVO DE CONSULTA (s03): Solo después de completar los datos de s01 que faltan.

⸻

3. ESTRUCTURA DE PREGUNTAS

Tienes acceso a la estructura JSON de las secciones s01 y s03 del cuestionario de anamnesis funcional. Úsala como guía para recopilar la información, adaptando cada pregunta a lenguaje empático, sencillo y conversacional. Haz UNA pregunta a la vez. No copies las preguntas textualmente — reformúlalas de forma cercana y natural.

REGLA CRÍTICA SOBRE PREGUNTAS CON OPCIONES — APLICA SIN EXCEPCIÓN:

Revisa el JSON del cuestionario antes de formular cada pregunta. Si el campo tiene type: "single" o "checkbox", SIEMPRE debes:
1. Reformular la pregunta de forma empática y conversacional
2. Presentar las opciones INMEDIATAMENTE en ese mismo mensaje como botones en "opciones"
3. NUNCA convertir una pregunta con opciones en una pregunta abierta

Esto aplica a TODOS los campos con opciones sin excepción: s03_limitacion, s03_disposicion y cualquier otro.

Ejemplo correcto para s03_disposicion (tiene 4 opciones en el JSON):
{"texto": "¿Qué tan dispuesto/a estás para hacer cambios en tus hábitos?", "opciones": ["Muy alto: puedo cambiar todo lo necesario", "Alto: puedo hacer cambios importantes", "Medio: puedo hacer cambios graduales", "Bajo: me cuesta mucho cambiar hábitos"]}

Ejemplo INCORRECTO — nunca hagas esto:
{"texto": "¿Cuál es tu disposición para modificar hábitos?", "opciones": []}  ← pregunta abierta sin opciones

REGLA PARA PREGUNTAS type "table" — APLICA SIN EXCEPCIÓN:
Si el campo tiene type: "table" en el JSON del cuestionario, usa este formato:
{"texto": "Pregunta reformulada de forma empática", "opciones": [], "tipoOpciones": "tabla_dinamica", "columnas": ["Col1", "Col2", ...], "respuestaLibre": true}
Las columnas son EXACTAMENTE las del array "columns" del JSON — no las modifiques.

REGLA PARA PREGUNTAS type "scale":
Si el campo tiene type: "scale" en el JSON, usa este formato:
{"texto": "Pregunta reformulada", "opciones": [], "tipoOpciones": "scale", "scaleMin": min, "scaleMax": max, "scaleStep": step, "scaleMinLabel": "...", "scaleMaxLabel": "...", "respuestaLibre": true}
Toma los valores de min, max, step, minLabel y maxLabel del JSON de la pregunta.

PROHIBIDO: NUNCA menciones la palabra "tabla" en el campo "texto" ni en ningún texto visible al paciente para preguntas que NO sean type "table". Si necesitas agrupar varias preguntas de tipo text/scale/single, hazlo de forma conversacional en texto natural — nunca como tabla. NUNCA digas "completa la siguiente tabla" a menos que el campo sea explícitamente type "table".

Si el paciente ya respondió algo conversacionalmente que cubre un campo con opciones, mapea internamente su respuesta a la opción más cercana y continúa con la siguiente pregunta SIN repetir con opciones.

REGLA DE INFERENCIA — evita preguntas con respuesta obvia:
Usa la información ya recopilada para inferir respuestas cuando sean obvias. Ejemplos:
- Si el paciente dijo "llevo 5 semanas con este dolor", NO preguntes "¿cuándo fue la última vez que te sentiste bien?" — la respuesta es obvia: hace 5 semanas. Registra internamente s03_ultima_vez_bien = "hace aproximadamente 5 semanas" y pasa a la siguiente pregunta.
- Si el paciente describió un evento claro que inició el dolor, NO preguntes "¿con qué evento coincidió el inicio?" — ya lo sabes.
En general: si una pregunta tiene una respuesta que puedes deducir con certeza razonable del contexto previo, infiere el valor internamente y salta esa pregunta.

PREGUNTAS DEL LOTE ACTUAL (solo estas, en orden):
{{PREGUNTAS_LOTE}}

{{INSTRUCCION_FIN_LOTE}}

⸻

4. RECOPILACIÓN DE RESPUESTAS

A medida que el paciente responda, extrae internamente los valores para cada campo del JSON. Al finalizar la conversación incluirás estos valores en el bloque [[RESPUESTAS_S01_S03]].

Al recopilar los campos de profesión y ocupación (s01) y al valorar posibles exposiciones relacionadas con el motivo de consulta, aplica estos criterios:
 
- Diferencia profesión de ocupación actual. La profesión es la formación u oficio de base; la ocupación actual son las tareas reales que el paciente realiza hoy. Da prioridad a las tareas del trabajo actual para evaluar exposiciones vigentes, y conserva la profesión únicamente como antecedente de posibles exposiciones previas.
- Registra como "exposición confirmada" solo lo que el paciente declare explícitamente. Puedes proponer exposiciones plausibles por verificar según la actividad descrita —químicas, polvo o material particulado, humos, gases, solventes, pesticidas, metales, agentes biológicos, radiación, ruido, vibración, calor o frío, carga ergonómica, sedentarismo, turnos nocturnos, carga psicosocial—, pero preséntalas siempre como algo por confirmar con el paciente, nunca como un hecho ya establecido.
- Busca concordancia temporal entre el inicio o empeoramiento de los síntomas y cambios ocupacionales relevantes: comienzo o cambio de trabajo, cambio de jornada, cambio de lugar de trabajo, mudanza, o inicio de una exposición concreta.

⸻

5. ALCANCE PERMITIDO Y ACCIONES PROHIBIDAS

Puedes: dar bienvenida empática, formular preguntas sencillas, confirmar respuestas, resumir síntomas, identificar señales de alarma, explicar medicina funcional y Crisal-IA.

No debes: diagnosticar, recomendar medicamentos/suplementos/dietas/exámenes, interpretar resultados, prometer curación, ni mantener conversaciones clínicas fuera del flujo definido.

⸻

6. SEÑALES DE ALARMA

Si el paciente menciona: dificultad para respirar, dolor torácico opresivo, pérdida de conciencia, convulsiones, ideas de suicidio o autolesión, empeoramiento rápido — suspende el flujo e indica: "Lo que describes podría requerir atención médica inmediata. Comunícate con los servicios de emergencia o acude a urgencias."

6B. CONDICIONES QUE REQUIEREN ATENCIÓN PRESENCIAL OBLIGATORIA (Normativa colombiana)

Si el paciente menciona síntomas compatibles con alguna de las siguientes condiciones, debes incluir "alertaPresencial": true ÚNICAMENTE en el PRIMER mensaje donde la identifiques en tu respuesta JSON. En todos los mensajes posteriores NO vuelvas a incluir este campo aunque el síntoma siga presente. Explica brevemente que por normativa colombiana requiere evaluación médica presencial. El flujo continúa normalmente SOLO si entendió la alerta.

Condiciones:
- Neumonía: taquipnea, tiraje subcostal, infiltrados radiológicos con derrame pleural, o sola sospecha en lactantes.
- Enfermedades transmitidas por vectores/zoonosis: dengue, chikungunya, zika, malaria, leishmaniasis, enfermedad de Chagas, rabia (especialmente post-exposición), accidente ofídico, leptospirosis, toxoplasmosis en gestantes.
- Riesgo neonatal: factores de riesgo antenatales que comprometan al recién nacido.
- Síndromes coronarios agudos: dolor precordial con angina típica en reposo >20-30 min, angina nueva grado III (CCS), angina en crescendo, sospecha de SCA.
- IRA pediátrica (2 meses a 5 años): episodios bronco-obstructivos, cuadros respiratorios agudos, EDA, bronquiolitis, neumonía, tosferina, crisis aguda de asma.
- Dengue con signos de alarma: extravasación de plasma, sangrado espontáneo, disfunción orgánica, condiciones de mayor riesgo (embarazo, <1 año, >65 años, obesidad mórbida, HTA, diabetes, daño renal, hepatopatía crónica, anticoagulación).

⸻

7. ESTILO DE COMUNICACIÓN

- Lenguaje claro, sencillo, empático, cercano, respetuoso, no alarmista.
- Habla directamente al paciente usando "tú".
- Evita tecnicismos. Si usas uno, explícalo.
- Una pregunta principal por mensaje.
- Cuando el paciente responde con un número, acéptalo DIRECTAMENTE y pasa a la siguiente pregunta. La única excepción es si la pregunta tiene explícitamente los campos "min" y "max" definidos en el JSON del cuestionario (solo aplica a preguntas type "scale") Y el valor está FUERA de ese rango — en ese caso pide amablemente que lo corrija. NUNCA apliques validación de rango a preguntas type "text" ni a preguntas sin campos min/max en el JSON. NUNCA inventes rangos. NUNCA digas "¿quisiste decir...?", "¿hubo un error de tipeo?" ni ninguna variante de confirmación. El número es válido tal como fue escrito.
- Solo pide aclaración si la respuesta es genuinamente ambigua (ej: texto incomprensible, o respuesta a una pregunta de opciones que no corresponde a ninguna opción).
- Si el paciente responde de forma COMPLETA (número, opción seleccionada, texto claro), acepta la respuesta y continúa. Si la respuesta es INCOMPLETA (ej: solo dio nombre pero falta teléfono), pide conversacionalmente solo el dato que falta — sin repetir la pregunta completa.
- NUNCA repitas una pregunta que ya hayas hecho en esta conversación. Antes de formular cada pregunta, revisa el historial completo para verificar que no fue preguntada ni respondida ya, aunque con palabras ligeramente distintas.

⸻

8. FINALIZACIÓN

NUNCA emitas [[FIN_CONVERSACION]]. Solo usa [[FIN_LOTE]] al completar cada lote. El backend controla el cierre.`;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MensajeChat {
  rol: 'usuario' | 'ia';
  texto: string;
}

// ─── Función principal ────────────────────────────────────────────────────────

export interface DatosExistentesPaciente {
  nombre?:          string;
  email?:           string;
  telefono?:        string;
  fechaNacimiento?: string;
  edad?:            number;
  sexoBiologico?:   string;
  ocupacion?:       string;
  escolaridad?:     string;
  direccion?:       string;
}

/**
 * Genera el cierre final de fase 1: resumen de síntomas + enfoque + bloques técnicos.
 * Se llama desde el controlador cuando el último lote emite [[FIN_LOTE]].
 */
export async function generarCierreFase1(params: {
  historial: MensajeChat[];
  nombrePaciente?: string;
  zonasDolorMarcadas: string[];
  datosExistentes?: DatosExistentesPaciente;
}): Promise<string> {
  const { historial, nombrePaciente, zonasDolorMarcadas, datosExistentes } = params;
  const d = datosExistentes || {};

  const nombre = nombrePaciente || d.nombre || 'paciente';
  const zonasTexto = zonasDolorMarcadas.length
    ? `Zonas de dolor marcadas: ${zonasDolorMarcadas.join(', ')}.`
    : '';

  const systemPrompt = `Eres Crisal-IA. Basándote ÚNICAMENTE en el historial de conversación que tienes, genera la respuesta de cierre de fase 1.

${zonasTexto}

DATOS DEL PACIENTE:
${d.nombre ? `- Nombre: ${d.nombre}` : ''}
${d.edad !== undefined ? `- Edad: ${d.edad} años` : ''}
${d.sexoBiologico ? `- Sexo: ${d.sexoBiologico}` : ''}

Genera EXACTAMENTE este JSON:
{
  "texto": "Gracias, ${nombre}. Antes de continuar, revisemos lo que entendí hasta ahora.",
  "resumen": ["ítem 1", "ítem 2", "ítem 3", "ítem 4"],
  "enfoque": "párrafo empático sobre el abordaje funcional",
  "opciones": [],
  "tipoOpciones": "single",
  "respuestaLibre": true
}

El campo "resumen" debe tener 4-6 ítems concretos de los síntomas del paciente.
El campo "enfoque" describe cómo Crisal-IA abordará el caso usando el catálogo de disfunciones de referencia. Elige UNA sola disfunción — la que mejor explique el conjunto de síntomas del paciente. No mezcles ni combines varias disfunciones.

${SECCION_11_DISFUNCIONES}

Después del JSON agrega obligatoriamente:
[[CAUSAS]]
[{"titulo":"...","desc":"..."},{"titulo":"...","desc":"..."},{"titulo":"...","desc":"..."}]
[[/CAUSAS]]

[[RESPUESTAS_S01_S03]]
{ "clave_id": valor, ... }
[[/RESPUESTAS_S01_S03]]

Usa EXACTAMENTE estos IDs en [[RESPUESTAS_S01_S03]] (NO inventes variaciones):
s01: s01_nombre, s01_nacimiento, s01_edad, s01_sexo, s01_educacion, s01_ocupacion, s01_anos_ocupacion, s01_jornada, s01_contacto_emergencia, s01_como_nos_conociste, s01_peso_actual, s01_talla, s01_grasa_corporal, s01_masa_muscular, s01_perimetro_abdominal, s01_diagnosticado_peso, s01_atleta, s01_peso_12meses, s01_medicion_electronica, s01_dispositivos
s03: s03_sintomas_tabla (array de objetos), s03_limitacion, s03_ultima_vez_bien, s03_que_hacias_bien, s03_evento_inicio, s03_objetivo_a, s03_objetivo_b, s03_disposicion

[[FIN_CONVERSACION]]`;

  // Usar historial completo — generarCierreFase1 es una llamada única al final
  // y necesita ver TODAS las respuestas de todos los lotes para no generar nulls
  const messages: any[] = [
    { role: 'user', content: [{ text: `Síntoma principal del paciente. ${zonasTexto} Genera el cierre.` }] },
    { role: 'assistant', content: [{ text: 'Entendido, procedo a generar el cierre.' }] },
    ...historial.map(m => ({
      role: m.rol === 'usuario' ? 'user' : 'assistant',
      content: [{ text: m.texto }],
    })),
    { role: 'user', content: [{ text: 'Genera ahora el JSON de cierre con resumen, enfoque y los bloques técnicos.' }] },
  ];

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens: 4000, temperature: 0.3 },
  });

  const resp = await client.send(command);
  return resp.output?.message?.content?.find((c: any) => c.text)?.text?.trim() ?? '';
}

/**
 * Genera un resumen en lenguaje claro y empático para el paciente
 * al finalizar la fase 2, a partir de las disfunciones del AnamnesisAgent.
 */
export async function generarResumenPaciente(params: {
  disfunciones: Array<{ nombre: string; certeza: string; etapa?: number; evidencia?: string[] }>;
  sintomaInicial: string;
  nombrePaciente?: string;
}): Promise<string[]> {
  const { disfunciones, sintomaInicial, nombrePaciente } = params;

  const listaDisfunciones = disfunciones
    .map(d => `- ${d.nombre}`)
    .join('\n');

  const systemPrompt = `Eres Crisal-IA. Tu tarea es escribir un resumen empático y comprensible para un paciente (NO para el médico) sobre los hallazgos de su evaluación de salud funcional.

REGLAS:
1. USA lenguaje simple, cálido y esperanzador. NADA de términos médicos técnicos.
2. NUNCA menciones nombres de disfunciones como "Disbiosis", "Glicotoxicidad", "HPA", "SIBO", etc.
3. NUNCA menciones certeza, etapas, biomarcadores ni paraclínicos.
4. Describe lo que el sistema encontró en términos del IMPACTO en la vida diaria del paciente.
5. Responde SOLO con un array JSON de 4-5 frases cortas (sin markdown, sin texto antes ni después).

Ejemplo de output:
["Tu sistema digestivo muestra señales de que algo no está funcionando en equilibrio","Tu nivel de energía y recuperación pueden estar afectados por cómo tu cuerpo maneja el estrés","Se identificaron patrones que podrían explicar el cansancio que describes","El médico funcional tendrá un panorama completo para diseñar tu plan personalizado"]`;

  const userPrompt = `El paciente${nombrePaciente ? ` ${nombrePaciente}` : ''} consultó por: "${sintomaInicial}".

El sistema identificó estas áreas de atención (solo para referencia interna, NO las menciones por nombre):
${listaDisfunciones}

Genera el array JSON con el resumen para el paciente.`;

  if (!disfunciones?.length) {
    return [
      'Tu evaluación de salud funcional ha sido completada',
      'El médico funcional revisará todos los hallazgos antes de tu consulta',
      'Muy pronto recibirás un plan personalizado basado en tu caso',
    ];
  }

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: { maxTokens: 600, temperature: 0.4 },
    });
    const resp = await client.send(command);
    const raw = (resp.output?.message?.content?.[0] as any)?.text ?? '';
    console.log('[generarResumenPaciente] raw:', raw.slice(0, 200));

    // Intentar extraer array JSON aunque venga con texto antes/después
    const clean = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/m, '')
      .trim();

    // Buscar el primer [ y el último ] para extraer el array
    const start = clean.indexOf('[');
    const end   = clean.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) throw new Error('No se encontró array JSON en la respuesta');

    const arr = JSON.parse(clean.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('Array vacío o inválido');
    return arr.filter((item: any) => typeof item === 'string' && item.trim().length > 0);
  } catch (e) {
    console.warn('[generarResumenPaciente] Error, usando fallback:', (e as Error).message);
    return [
      'Tu evaluación de salud funcional ha sido completada',
      'El sistema identificó varios aspectos de tu salud que merecen atención',
      'El médico funcional revisará todos los hallazgos antes de tu consulta',
    ];
  }
}

export async function responderCuerpoConChat(params: {
  zonasDolorMarcadas: string[];
  historial: MensajeChat[];
  mensajeUsuario: string;
  nombrePaciente?: string;
  datosExistentes?: DatosExistentesPaciente;
  loteIndex?: number;
}): Promise<string> {
  const { zonasDolorMarcadas, historial, mensajeUsuario, nombrePaciente } = params;
  const d = params.datosExistentes || {};
  const loteIndex = params.loteIndex ?? 0;

  const zonasTexto = zonasDolorMarcadas.length
    ? `El paciente ha marcado las siguientes zonas de dolor en el mapa corporal: ${zonasDolorMarcadas.join(', ')}.`
    : 'El paciente aún no ha marcado zonas de dolor.';

  // Datos ya conocidos — solo se envían en el PRIMER mensaje (no en el system prompt)
  // para evitar repetirlos en cada turno.
  const camposConocidos: string[] = [];
  if (d.nombre)             camposConocidos.push(`- Nombre completo: ${d.nombre}`);
  if (d.email)              camposConocidos.push(`- Email: ${d.email}`);
  if (d.telefono)           camposConocidos.push(`- Teléfono/Celular: ${d.telefono}`);
  if (d.fechaNacimiento)    camposConocidos.push(`- Fecha de nacimiento: ${d.fechaNacimiento}`);
  if (d.edad !== undefined) camposConocidos.push(`- Edad: ${d.edad} años`);
  if (d.sexoBiologico)      camposConocidos.push(`- Sexo biológico: ${d.sexoBiologico}`);
  if (d.ocupacion)          camposConocidos.push(`- Ocupación: ${d.ocupacion}`);
  if (d.escolaridad)        camposConocidos.push(`- Nivel educativo: ${d.escolaridad}`);
  if (d.direccion)          camposConocidos.push(`- Dirección: ${d.direccion}`);

  const datosConocidosTexto = camposConocidos.length > 0
    ? `\n\nDATOS YA DISPONIBLES EN EL SISTEMA (NO preguntes estos campos, ya los tenemos):\n${camposConocidos.join('\n')}`
    : '';

  // Contexto completo para el system prompt y el primer mensaje
  const contextoSistema = [
    nombrePaciente ? `Nombre del paciente: ${nombrePaciente}.` : '',
    zonasTexto,
    datosConocidosTexto,
  ].filter(Boolean).join(' ');

  // Filtrar preguntas ya conocidas del modelo Paciente
  const IDS_CONOCIDOS: Record<string, boolean> = {
    s01_nombre:    !!d.nombre,
    s01_nacimiento: !!d.fechaNacimiento,
    s01_edad:      d.edad !== undefined,
    s01_sexo:      !!d.sexoBiologico,
    s01_educacion: !!d.escolaridad,
    s01_ocupacion: !!d.ocupacion,
  };
  // file_upload se maneja aparte (fase 2 loading), no entra al sistema de lotes.
  // adultoOnly se omite si la edad del paciente es conocida y es menor de 18.
  const esMenor = d.edad !== undefined && d.edad < 18;
  const preguntasPendientes = TODAS_LAS_PREGUNTAS.filter((q: any) =>
    !IDS_CONOCIDOS[q.id] &&
    q.type !== 'file_upload' &&
    !(esMenor && q.adultoOnly)
  );

  // Construir preguntas del lote actual (5 preguntas sobre pendientes)
  const inicio = loteIndex * 5;
  const esUltimoLote = inicio + 5 >= preguntasPendientes.length;
  const lote = preguntasPendientes.slice(inicio, inicio + 5);
  const preguntasLoteTexto = lote.map((q: any, i: number) => {
    let linea = `${i + 1}. [${q.id}] ${q.text || q.title || ''} (tipo: ${q.type}`;
    if ((q.type === 'single' || q.type === 'checkbox') && Array.isArray(q.options))
      linea += `, opciones: ${q.options.map((o: any) => o.label).join(' / ')}`;
    if (q.type === 'symptom_table' && Array.isArray(q.items)) {
      linea += `, escala: ${q.scale_type || 'frequency'}, ítems: ${q.items.map((it: any) => it.label).join(', ')}`;
    }
    if (q.type === 'table' && Array.isArray(q.columns))
      linea += `, columnas: ${q.columns.join(' | ')}`;
    if (q.type === 'file_upload') linea += ', subida de archivos';
    if (q.type === 'scale') {
      linea += `, min: ${q.min ?? 0}, max: ${q.max ?? 10}, step: ${q.step ?? 1}`;
      if (q.minLabel) linea += `, minLabel: "${q.minLabel}"`;
      if (q.maxLabel) linea += `, maxLabel: "${q.maxLabel}"`;
      linea += `, required: ${q.required !== false ? 'true' : 'false'}`;
    }
    linea += ')';
    if (q.nota_clinica) linea += `\n   ⚠ NOTA CLÍNICA: ${q.nota_clinica}`;
    return linea;
  }).join('\n') || '(sin preguntas en este lote)';

  // Instrucción de fin de lote: cuando es el último lote, solo mencionamos
  // [[FIN_CONVERSACION]]; para lotes intermedios, solo mencionamos [[FIN_LOTE]]
  // y NO mencionamos [[FIN_CONVERSACION]] para que Claude no lo use por cuenta propia.
  const instruccionFinLote = `RESTRICCIÓN CRÍTICA DE LOTE — APLICA SIN EXCEPCIÓN:
Solo puedes hacer las preguntas listadas arriba en "PREGUNTAS DEL LOTE ACTUAL". NO hagas ninguna pregunta que no esté en esa lista, aunque parezca lógica o relacionada con el síntoma. Las preguntas de otros lotes llegarán en turnos posteriores.
Cuando hayas obtenido respuesta de TODAS las preguntas de este lote (o puedas inferirlas del contexto), confirma brevemente ("Anotado.") y emite [[FIN_LOTE]] INMEDIATAMENTE en el mismo mensaje. NUNCA emitas [[FIN_CONVERSACION]] — el backend controlará el cierre.`;

  const DEFAULT_PROMPT_CON_LOTE = DEFAULT_SYSTEM_PROMPT
    .replace('{{PREGUNTAS_LOTE}}', preguntasLoteTexto)
    .replace('{{INSTRUCCION_FIN_LOTE}}', instruccionFinLote);

  const systemPrompt = process.env.CUERPO_CHAT_SYSTEM_PROMPT?.trim() || DEFAULT_PROMPT_CON_LOTE;

  const historialTruncado = historial.length > 24 ? historial.slice(-24) : historial;

  const messages: any[] = [];

  if (historial.length === 0) {
    messages.push({
      role: 'user',
      content: [{ text: contextoSistema + '\n\nSalúdame y empieza la conversación.' }]
    });
    messages.push({
      role: 'assistant',
      content: [{ text: '¡Hola! Bienvenido a Crisalia.' }]
    });
  } else {
    for (const m of historialTruncado) {
      messages.push({
        role: m.rol === 'usuario' ? 'user' : 'assistant',
        content: [{ text: m.texto }]
      });
    }
  }

  messages.push({
    role: 'user',
    content: [{ text: mensajeUsuario }]
  });

  const contextoCompleto = `${systemPrompt}\n\nContexto del paciente: ${contextoSistema}\n\nRECUERDA — FORMATO OBLIGATORIO: Tu respuesta debe ser SIEMPRE un JSON válido que empiece con {"texto": y NUNCA texto libre. Ejemplos según el tipo de pregunta:
- type "text" / "single" / "checkbox": {"texto":"...","opciones":[...],"tipoOpciones":"single","respuestaLibre":true}
- type "scale": {"texto":"...","opciones":[],"tipoOpciones":"scale","scaleMin":min,"scaleMax":max,"scaleStep":step,"scaleMinLabel":"...","scaleMaxLabel":"...","scaleRequired":true_o_false,"respuestaLibre":true} — OBLIGATORIO para preguntas de escala numérica. Usa "scaleRequired":false si el campo tiene "required":false en el JSON, "scaleRequired":true si no tiene el campo o es true.
- type "table": {"texto":"...","opciones":[],"tipoOpciones":"tabla_dinamica","columnas":["Col1","Col2"],"respuestaLibre":true}
- type "file_upload": {"texto":"...","opciones":[],"tipoOpciones":"file_upload","respuestaLibre":true}
NUNCA respondas en texto libre. SIEMPRE JSON.`;

  console.log('[CuerpoConChat] ▶ invoke Claude', {
    modelId:          MODEL_ID,
    region:           REGION,
    historialLen:     historial.length,
    mensajeUsuario:   mensajeUsuario.slice(0, 80),
    loteIndex,
    preguntasEnLote:  lote.map((q: any) => q.id),
    esUltimoLote,
    systemPromptLen:  contextoCompleto.length,
  });
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: contextoCompleto }],
    messages,
    inferenceConfig: { maxTokens: 4000, temperature: 0.1 }
  });

  const resp = await client.send(command);
  const text = resp.output?.message?.content?.find((c: any) => c.text)?.text ?? '';

  console.log('[CuerpoConChat] ◀ respuesta Claude', {
    len:                text.length,
    preview:            text.slice(0, 200),
    tieneFIN:           text.includes('[[FIN_CONVERSACION]]'),
    tieneRESPUESTAS:    text.includes('[[RESPUESTAS_S01_S03]]'),
    tieneCAUSAS:        text.includes('[[CAUSAS]]'),
  });

  return text.trim();
}

// ─── Extrae respuestas estructuradas del bloque [[RESPUESTAS_S01_S03]] ────────

export function extraerRespuestasS01S03(respuesta: string): Record<string, any> {
  const match = respuesta.match(/\[\[RESPUESTAS_S01_S03\]\]([\s\S]*?)\[\[\/RESPUESTAS_S01_S03\]\]/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1].trim());

    // Normalizar: si Claude devuelve {"s01": {...}, "s03": {...}} (anidado),
    // aplananarlo a {"s01_campo": valor, "s03_campo": valor} (plano)
    const resultado: Record<string, any> = {};
    for (const [clave, valor] of Object.entries(parsed)) {
      if ((clave === 's01' || clave === 's03') && typeof valor === 'object' && valor !== null && !Array.isArray(valor)) {
        // Formato anidado: aplanar prefijando con la sección
        for (const [subclave, subvalor] of Object.entries(valor as Record<string, any>)) {
          const key = subclave.startsWith(`${clave}_`) ? subclave : `${clave}_${subclave}`;
          resultado[key] = subvalor;
        }
      } else {
        // Formato plano: conservar tal cual
        resultado[clave] = valor;
      }
    }
    return resultado;
  } catch {
    return {};
  }
}

// ─── Extrae sintomaInicial limpio para el orquestador ─────────────────────────

export function extraerSintomaInicial(
  zonasDolorMarcadas: string[],
  respuestasS01S03: Record<string, any>
): string {
  const partes: string[] = [];

  if (respuestasS01S03.s03_sintoma_principal) {
    partes.push(respuestasS01S03.s03_sintoma_principal);
  }
  if (zonasDolorMarcadas.length) {
    partes.push(`Zonas afectadas: ${zonasDolorMarcadas.join(', ')}`);
  }
  if (respuestasS01S03.s03_tiempo_evolucion) {
    partes.push(`Tiempo de evolución: ${respuestasS01S03.s03_tiempo_evolucion}`);
  }
  if (respuestasS01S03.s03_intensidad) {
    partes.push(`Intensidad: ${respuestasS01S03.s03_intensidad}`);
  }

  return partes.length > 0
    ? partes.join('. ')
    : zonasDolorMarcadas.length > 0
      ? `Dolor en: ${zonasDolorMarcadas.join(', ')}`
      : 'Consulta general';
}

// ─── Adaptar preguntas del interrogatorio con Claude ─────────────────────────
/**
 * Toma las preguntas crudas del JSON de secciones y pide a Claude que las
 * reformule en lenguaje empático y conversacional, conservando id, type y options.
 *
 * Devuelve las mismas preguntas con el campo "text" reemplazado por la versión
 * adaptada. Si Claude falla, devuelve las preguntas originales sin modificar.
 */
export async function adaptarPreguntasConClaude(params: {
  preguntas: any[];
  sintomaInicial: string;
  nombrePaciente?: string;
  resumenRespuestas?: string;
}): Promise<any[]> {
  const { preguntas, sintomaInicial, nombrePaciente, resumenRespuestas } = params;

  if (preguntas.length === 0) return preguntas;

  const preguntasSimplificadas = preguntas.map(q => ({
    id: q.id,
    text: q.text || q.title || '',
  }));

  const contextoRespuestas = resumenRespuestas
    ? `\n\nRESPUESTAS YA RECOPILADAS DEL PACIENTE:\n${resumenRespuestas}`
    : '';

  const systemPrompt = `Eres Crisal-IA. Adapta preguntas clínicas técnicas a lenguaje empático y conversacional, usando el contexto del paciente para ser inteligente.

REGLAS ESTRICTAS:
1. Adapta el "text" a tono cercano, usando "tú". Máximo 2 frases por pregunta.
2. Usa las respuestas ya recopiladas para contextualizar: si el paciente ya respondió algo relevante, menciona su respuesta al formular la pregunta siguiente ("Mencionaste que no haces ejercicio, ¿hubo algún momento en que sí lo hacías?").
3. Si la respuesta a una pregunta ya se deduce CLARAMENTE de lo que el paciente respondió (ej: dijo "no hago ejercicio" y la pregunta es "¿a qué intensidad entrenas?"), marca esa pregunta como OMITIR poniendo "text": "OMITIR".
4. NO omitas preguntas si solo puedes inferir parcialmente la respuesta.
5. Devuelve ÚNICAMENTE un JSON array de objetos {"id":"...","text":"..."}.
6. El array debe tener EXACTAMENTE el mismo número de elementos que el input.
7. Sin texto antes ni después del JSON. Sin markdown.`;

  const userPrompt = `Paciente: ${nombrePaciente || 'paciente'}, consulta por "${sintomaInicial}".${contextoRespuestas}

Adapta estas ${preguntasSimplificadas.length} preguntas con inteligencia contextual:
${JSON.stringify(preguntasSimplificadas)}`;

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: { maxTokens: 6000, temperature: 0.3 },
    });

    const response = await client.send(command);
    const raw = (response.output?.message?.content?.[0] as any)?.text ?? '';

    // Limpiar markdown fences
    const clean = raw.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim();

    // Extraer el array JSON aunque haya texto extra antes/después
    const arrStart = clean.indexOf('[');
    const arrEnd   = clean.lastIndexOf(']');
    if (arrStart === -1 || arrEnd === -1) throw new Error('No se encontró array JSON en la respuesta');

    const adaptadas: { id: string; text: string }[] = JSON.parse(clean.slice(arrStart, arrEnd + 1));

    // Mapa id → text adaptado para merge seguro (no depende del orden)
    const mapaAdaptado = new Map(adaptadas.map(a => [a.id, a.text]));

    return preguntas.map(q => ({
      ...q,
      text: mapaAdaptado.get(q.id) || q.text,
    }));
  } catch (e) {
    console.warn('[adaptarPreguntasConClaude] Error — usando preguntas originales:', (e as Error).message);
    return preguntas;
  }
}

// ─── Conversación de interrogatorio fase 2 ───────────────────────────────────
/**
 * Claude conduce la segunda fase del interrogatorio usando las secciones que el
 * Agent Bedrock indicó como guía — igual que la fase 1 pero con un system prompt
 * que incluye el JSON de esas secciones específicas.
 *
 * Devuelve el string crudo de Claude (mismo formato que responderCuerpoConChat).
 * El controller extrae: texto, opciones, tipoOpciones, [[FIN_RONDA]], [[RESPUESTAS_RONDA]].
 */
/**
 * Construye el array de messages para Bedrock garantizando alternancia user/assistant.
 * - Inserta un mensaje user neutro entre dos assistant consecutivos (turnos ia,ia de BD).
 * - El array siempre empieza con user y termina con el mensajeUsuario actual.
 */
function construirMessages(
  primedUserMsg: string,
  historial: MensajeChat[],
  mensajeUsuario: string
): any[] {
  const msgs: any[] = [];

  // Mensaje de priming inicial (siempre user)
  msgs.push({ role: 'user', content: [{ text: primedUserMsg }] });

  // Construir desde historial garantizando alternancia
  let ultimoRol: 'user' | 'assistant' = 'user';
  for (const m of historial) {
    const rol = m.rol === 'usuario' ? 'user' : 'assistant';
    // Si hay dos assistant seguidos, insertar user neutro
    if (rol === 'assistant' && ultimoRol === 'assistant') {
      msgs.push({ role: 'user', content: [{ text: 'Continuemos.' }] });
    }
    msgs.push({ role: rol, content: [{ text: m.texto }] });
    ultimoRol = rol;
  }

  // Añadir el mensaje actual del usuario (siempre al final)
  if (ultimoRol === 'user') {
    // Dos user seguidos: insertar assistant neutro
    msgs.push({ role: 'assistant', content: [{ text: '{"texto":"Entendido.","opciones":[],"tipoOpciones":"single","respuestaLibre":true}' }] });
  }
  msgs.push({ role: 'user', content: [{ text: mensajeUsuario }] });

  return msgs;
}

export async function responderInterrogatorioConClaude(params: {
  historial: MensajeChat[];
  mensajeUsuario: string;
  sintomaInicial: string;
  preguntasFiltradas: any[];
  resumenRespuestas: string;
  nombrePaciente?: string;
}): Promise<string> {
  const { historial, mensajeUsuario, sintomaInicial, preguntasFiltradas, resumenRespuestas, nombrePaciente } = params;

  // Serializar preguntas — incluye valores de opciones y datos de scale
  const preguntasTexto = preguntasFiltradas.map((q, i) => {
    let linea = `${i + 1}. [${q.id}] ${q.text || q.title || ''} (tipo: ${q.type}`;
    if ((q.type === 'single' || q.type === 'checkbox') && q.options?.length) {
      const etiqueta = q.type === 'checkbox' ? 'opciones múltiples' : 'opciones';
      linea += `, ${etiqueta}: ${q.options.map((o: any) => `${o.label}=${o.value ?? o.label}`).join(' / ')}`;
    } else if (q.type === 'scale') {
      linea += `, min: ${q.min ?? 0}, max: ${q.max ?? 10}, step: ${q.step ?? 1}`;
      if (q.minLabel) linea += `, minLabel: "${q.minLabel}"`;
      if (q.maxLabel) linea += `, maxLabel: "${q.maxLabel}"`;
    } else if (q.type === 'symptom_table' && q.items?.length) {
      linea += `, escala: ${q.scale_type || 'frequency'}, ítems con escala 0-3: ${q.items.map((it: any) => `${it.id}="${it.label}"`).join(', ')}`;
    } else if (q.type === 'table' && q.columns?.length) {
      linea += `, columnas: ${q.columns.join(' | ')}`;
    }
    linea += ')';
    return linea;
  }).join('\n');

  // IDs válidos para [[RESPUESTAS_RONDA]] (lista blanca)
  const idsPermitidos = new Set<string>();
  for (const q of preguntasFiltradas) {
    idsPermitidos.add(q.id);
    if (q.type === 'symptom_table' && q.items?.length) {
      for (const it of q.items) idsPermitidos.add(it.id);
    }
  }

  const systemPrompt = `FASE 2 DEL INTERROGATORIO CLÍNICO — CRISAL-IA

Eres Crisal-IA, recopilando información clínica del paciente para el médico funcional.

━━━ DATOS YA CONOCIDOS DEL PACIENTE ━━━
${resumenRespuestas || 'Sin datos previos.'}

━━━ PREGUNTAS DE ESTA RONDA (en orden, una a la vez) ━━━
${preguntasTexto}

━━━ REGLAS ━━━

1. INFERENCIA — usa los datos conocidos para evitar preguntas redundantes:
   Antes de cada turno, compara CADA pregunta pendiente con los DATOS YA CONOCIDOS y con el historial. Si la respuesta puede deducirse con certeza (ej: está registrado que trabaja en turnos rotativos → NO preguntes tipo de jornada; registrado que no hace ejercicio → NO preguntes tipo de ejercicio), regístrala en [[RESPUESTAS_RONDA]] y pasa a la siguiente SIN formularla. PROHIBIDO: mencionar un dato que ya conoces y luego preguntarlo en el mismo turno. Ante duda razonable, pregunta.

2. PREGUNTAS: Solo de la lista de esta ronda. Una por turno. Si la respuesta ya se conoce o se puede inferir, omítela. Si no queda ninguna por hacer, cierra con un JSON breve (sin opciones) y emite [[FIN_RONDA]] en ese mismo mensaje.

3. FORMATO DE RESPUESTA:
   CADA respuesta es ÚNICAMENTE el JSON, sin texto antes ni después:
   {"texto":"Comentario empático breve (opcional) + la siguiente pregunta","opciones":[...],"tipoOpciones":"single","respuestaLibre":true}
   Los bloques técnicos van SIEMPRE DESPUÉS del JSON.

4. TIPOS DE PREGUNTAS:
   IMPORTANTE: el array "opciones" en el JSON de respuesta SIEMPRE contiene strings de etiquetas visibles (lo que el paciente ve), NUNCA objetos. Los values van únicamente en [[RESPUESTAS_RONDA]].
   - single → "opciones": ["Etiqueta 1", "Etiqueta 2", ...], tipoOpciones: "single". En [[RESPUESTAS_RONDA]] guarda el value (ej: "diurna_fija"), no la etiqueta.
   - checkbox → "opciones": ["Etiqueta 1", "Etiqueta 2", ...], tipoOpciones: "checkbox". En [[RESPUESTAS_RONDA]] guarda array de values.
   - scale → {"texto":"...","opciones":[],"tipoOpciones":"scale","scaleMin":min,"scaleMax":max,"scaleStep":step,"scaleMinLabel":"...","scaleMaxLabel":"...","respuestaLibre":true}
   - text → opciones: []
   - symptom_table → {"texto":"...","opciones":[],"tipoOpciones":"tabla","tabla":[{"id":"item_id","label":"etiqueta"},...],"escala":"frecuencia|intensidad","respuestaLibre":true}. NUNCA listes ítems como texto. NO expliques la escala numérica en el texto.
   - table → {"texto":"...","opciones":[],"tipoOpciones":"tabla_dinamica","columnas":["Col1","Col2",...],"respuestaLibre":true}

5. EXTRACCIÓN — OBLIGATORIO EN CADA TURNO:
   [[RESPUESTAS_RONDA]]
   {"campo_id": valor}
   [[/RESPUESTAS_RONDA]]
   Solo incluye respuestas NUEVAS de este turno. IDs exactos de la lista de preguntas.
   Valores: scale_0_3 → número; single → value; checkbox → array de values; tabla → {item_id: valor}; text → string.
   SOLO los IDs de la lista de esta ronda — no inventes campos.

6. SEÑALES DE ALARMA: Si el paciente menciona síntomas graves, indica: "Lo que describes podría requerir atención médica urgente."`;

  const intro = nombrePaciente
    ? `Soy ${nombrePaciente}. Continúa el interrogatorio.`
    : 'Continúa el interrogatorio.';
  const primedUserMsg = `Síntoma principal: "${sintomaInicial}". ${intro}`;

  const messages = construirMessages(primedUserMsg, historial, mensajeUsuario);

  console.log('[responderInterrogatorioConClaude] messages enviados:', JSON.stringify(messages.map(m => ({ role: m.role, text: m.content[0].text.slice(0, 80) }))));

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens: 2048, temperature: 0.2 },
  });

  const response = await client.send(command);
  const raw = response.output?.message?.content?.find((c: any) => c.text)?.text ?? '';

  console.log('[responderInterrogatorioConClaude] ◀', {
    historialLen: historial.length,
    preguntasCount: preguntasFiltradas.length,
    rawLen: raw.length,
    tieneFIN: raw.includes('[[FIN_RONDA]]'),
    stopReason: (response as any).stopReason,
  });

  // Advertir si el modelo cortó por max_tokens (puede dejar el JSON incompleto)
  if ((response as any).stopReason === 'max_tokens') {
    console.warn('[responderInterrogatorioConClaude] ⚠ Respuesta cortada por max_tokens — puede haber JSON incompleto');
  }

  return raw;
}