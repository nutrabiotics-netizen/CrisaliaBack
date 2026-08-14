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

function cargarEstructuraInicial(): string {
  try {
    const secciones = cargarSecciones(['s01', 's03']);
    const json = JSON.stringify(secciones, null, 2);
    console.log('[CuerpoConChat] ✅ s01/s03 cargadas — bytes:', json.length,
      '| s01 preguntas:', secciones['s01']?.questions?.length ?? 'N/A',
      '| s03 preguntas:', secciones['s03']?.questions?.length ?? 'N/A');
    return json;
  } catch (e) {
    console.error('[CuerpoConChat] ❌ Error cargando s01/s03:', e);
    return '';
  }
}

const ESTRUCTURA_S01_S03 = cargarEstructuraInicial();
console.log('[CuerpoConChat] ESTRUCTURA_S01_S03 vacía:', ESTRUCTURA_S01_S03.length === 0);

// ─── System prompt ────────────────────────────────────────────────────────────

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

Debes seguir este orden estrictamente. NO puedes pasar a la fase 2 sin completar la fase 1.

FASE 1 — DATOS GENERALES (s01): Después del saludo, recopila PRIMERO los datos que nos faltan del perfil del paciente. Los datos que ya tenemos en el sistema están marcados como "ya conocidos" en el contexto — NO los preguntes. Solo pregunta los que faltan.

FASE 2 — MOTIVO DE CONSULTA (s03): Solo después de completar los datos de s01 que faltan

Aunque el paciente ya mencionó espontáneamente su síntoma (por ejemplo al marcar zonas de dolor), IGUAL debes completar los datos de s01 que faltan ANTES de profundizar en el síntoma.

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

Si el paciente ya respondió algo conversacionalmente que cubre un campo con opciones, mapea internamente su respuesta a la opción más cercana y continúa con la siguiente pregunta SIN repetir con opciones.

REGLA DE INFERENCIA — evita preguntas con respuesta obvia:
Usa la información ya recopilada para inferir respuestas cuando sean obvias. Ejemplos:
- Si el paciente dijo "llevo 5 semanas con este dolor", NO preguntes "¿cuándo fue la última vez que te sentiste bien?" — la respuesta es obvia: hace 5 semanas. Registra internamente s03_ultima_vez_bien = "hace aproximadamente 5 semanas" y pasa a la siguiente pregunta.
- Si el paciente describió un evento claro que inició el dolor, NO preguntes "¿con qué evento coincidió el inicio?" — ya lo sabes.
En general: si una pregunta tiene una respuesta que puedes deducir con certeza razonable del contexto previo, infiere el valor internamente y salta esa pregunta.

Para las tablas de síntomas (type: "symptom_table"), agrupa los ítems de forma conversacional y usa la escala 0-3: 0=Nunca, 1=Leve/esporádico, 2=Moderado/frecuente, 3=Intenso/permanente.

ESTRUCTURA DEL CUESTIONARIO (s01 y s03):
${ESTRUCTURA_S01_S03}

⸻

4. RECOPILACIÓN DE RESPUESTAS

A medida que el paciente responda, extrae internamente los valores para cada campo del JSON. Al finalizar la conversación incluirás estos valores en el bloque [[RESPUESTAS_S01_S03]].

⸻

5. ALCANCE PERMITIDO Y ACCIONES PROHIBIDAS

Puedes: dar bienvenida empática, formular preguntas sencillas, confirmar respuestas, resumir síntomas, identificar señales de alarma, explicar medicina funcional y Crisal-IA.

No debes: diagnosticar, recomendar medicamentos/suplementos/dietas/exámenes, interpretar resultados, prometer curación, ni mantener conversaciones clínicas fuera del flujo definido.

⸻

6. SEÑALES DE ALARMA

Si el paciente menciona: dificultad para respirar, dolor torácico opresivo, pérdida de conciencia, convulsiones, ideas de suicidio o autolesión, empeoramiento rápido — suspende el flujo e indica: "Lo que describes podría requerir atención médica inmediata. Comunícate con los servicios de emergencia o acude a urgencias."

⸻

7. ESTILO DE COMUNICACIÓN

- Lenguaje claro, sencillo, empático, cercano, respetuoso, no alarmista.
- Habla directamente al paciente usando "tú".
- Evita tecnicismos. Si usas uno, explícalo.
- Una pregunta principal por mensaje.
- Confirma brevemente cada respuesta antes de avanzar.

⸻

8. RESPUESTA FINAL OBLIGATORIA

Cuando hayas recopilado información suficiente de s01 y s03, genera la respuesta final con DOS mensajes separados:

MENSAJE A — texto empático corto (máx 2 frases):
Algo como: "Gracias, {nombre}. Antes de continuar, revisemos lo que entendí hasta ahora."

MENSAJE B — JSON con el resumen estructurado. El campo "resumen" debe contener entre 4 y 6 ítems concretos extraídos de lo que el paciente describió. Cada ítem es una frase corta y directa (sin emojis, sin markdown).

Ejemplo de resumen para dolor lumbar:
{
  "texto": "Gracias, {nombre}. Antes de continuar, revisemos lo que entendí hasta ahora.",
  "resumen": [
    "El dolor se encuentra principalmente en la zona lumbar",
    "Comenzó hace aproximadamente tres días",
    "Empeora con actividad física y falta de sueño",
    "La intensidad reportada es moderada",
    "No has identificado una relación clara con alimentos"
  ],
  "opciones": [],
  "tipoOpciones": "single",
  "respuestaLibre": true
}

IMPORTANTE:
- El campo "texto" es el mensaje empático corto de cierre (máx 2 frases). Ejemplo: "Gracias, {nombre}. Antes de continuar, revisemos lo que entendí hasta ahora."
- El campo "resumen" contiene los síntomas del paciente (4-6 ítems concretos).
- El campo "enfoque" (OBLIGATORIO en la respuesta final) es un párrafo sobre cómo Crisal-IA abordará el caso según el síntoma principal. Usa el documento de disfunciones de la sección 11 como referencia — elige la disfunción más relevante y menciona el enfoque funcional de forma empática y personalizada. NO copies el texto textualmente; adáptalo al caso.
- "opciones" debe ser [] en la respuesta final.

Ejemplo de respuesta final:
{
  "texto": "Gracias, {nombre}. Antes de continuar, revisemos lo que entendí hasta ahora.",
  "resumen": ["El dolor se encuentra en la zona lumbar", "Comenzó hace 3 días", "..."],
  "enfoque": "Con base en lo que describes, el enfoque de Crisal-IA buscará comprender qué está alterando el eje de respuesta al estrés en tu caso — integrando tus ritmos de sueño, cortisol e inflamación — para abordar el origen del dolor desde la raíz. Tu médico funcional definirá los estudios y construirá contigo un plan personalizado.",
  "opciones": [],
  "tipoOpciones": "single",
  "respuestaLibre": true
}

⸻

11. DOCUMENTO DE REFERENCIA — CÓMO CRISAL-IA ABORDA CADA DISFUNCIÓN

Usa este documento para personalizar el campo "texto" de la respuesta final con el enfoque de abordaje relevante al síntoma del paciente:

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

DISMINUCIÓN DE LA FUNCIÓN TIROIDEA Síntomas típicos: cansancio, sensación de frío, estreñimiento, aumento de peso, caída del cabello, piel seca, cambios menstruales, dificultad para concentrarse. Marcadores relevantes: TSH, T4 libre, T3 libre, anticuerpos tiroideos. Se evalúa señal cerebral, producción hormonal, conversión de T4 en T3 y respuesta celular, junto co

⸻

9. CRITERIOS DE FINALIZACIÓN

Puedes cerrar la fase inicial cuando:
1. Se hayan recopilado los campos prioritarios de s01 y s03.
2. El síntoma principal esté claramente descrito.
3. Se hayan revisado señales de alarma.

⸻

10. INSTRUCCIÓN TÉCNICA FINAL (no visible para el paciente)

Cuando hayas completado todos los criterios y entregado la RESPUESTA FINAL, agrega DESPUÉS del JSON los siguientes bloques:

1. Tres posibles factores generales relacionados con los síntomas:
[[CAUSAS]]
[{"titulo":"...","desc":"..."},{"titulo":"...","desc":"..."},{"titulo":"...","desc":"..."}]
[[/CAUSAS]]

2. Las respuestas estructuradas recopiladas de s01 y s03:
[[RESPUESTAS_S01_S03]]

[[/RESPUESTAS_S01_S03]]

3. Inmediatamente después:
[[FIN_CONVERSACION]]

Los tres bloques van DESPUÉS del JSON de respuesta. No los incluyas en ningún otro mensaje.

⸻

FORMATO DE RESPUESTA OBLIGATORIO:

Cada respuesta debe ser un JSON válido. SIN markdown, SIN bloques de código, sin texto antes o después del JSON (excepto los bloques técnicos que van DESPUÉS):

Respuesta normal:
{"texto":"El mensaje empático para el paciente","opciones":["Opción 1","Opción 2"],"tipoOpciones":"single","respuestaLibre":true}

Respuesta final:
{"texto":"Mensaje corto de cierre","resumen":["ítem 1","ítem 2","ítem 3","ítem 4"],"opciones":[],"tipoOpciones":"single","respuestaLibre":true}

Reglas del JSON:
- "texto": el mensaje principal, empático y en español
- "resumen": SOLO en la respuesta final. Array de frases cortas que resumen lo que el paciente describió.
- "opciones": incluye opciones cuando preguntes sobre campos con type "single" o "checkbox". Solo usa [] para preguntas abiertas y en la respuesta final.
- "tipoOpciones": "single" o "checkbox" según el tipo del campo. Omitir si no hay opciones.
- "respuestaLibre": siempre true
- Los bloques técnicos van DESPUÉS del JSON, no dentro del campo "texto"`;

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
  direccion?:       string;
}

export async function responderCuerpoConChat(params: {
  zonasDolorMarcadas: string[];
  historial: MensajeChat[];
  mensajeUsuario: string;
  nombrePaciente?: string;
  datosExistentes?: DatosExistentesPaciente;
}): Promise<string> {
  const { zonasDolorMarcadas, historial, mensajeUsuario, nombrePaciente } = params;
  const d = params.datosExistentes || {};

  const systemPrompt = process.env.CUERPO_CHAT_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;

  const zonasTexto = zonasDolorMarcadas.length
    ? `El paciente ha marcado las siguientes zonas de dolor en el mapa corporal: ${zonasDolorMarcadas.join(', ')}.`
    : 'El paciente aún no ha marcado zonas de dolor.';

  // Construir bloque de datos ya conocidos del modelo Paciente
  const camposConocidos: string[] = [];
  if (d.nombre)          camposConocidos.push(`- Nombre completo: ${d.nombre}`);
  if (d.email)           camposConocidos.push(`- Email: ${d.email}`);
  if (d.telefono)        camposConocidos.push(`- Teléfono/Celular: ${d.telefono}`);
  if (d.fechaNacimiento) camposConocidos.push(`- Fecha de nacimiento: ${d.fechaNacimiento}`);
  if (d.edad !== undefined) camposConocidos.push(`- Edad: ${d.edad} años`);
  if (d.sexoBiologico)   camposConocidos.push(`- Sexo biológico: ${d.sexoBiologico}`);
  if (d.ocupacion)       camposConocidos.push(`- Ocupación: ${d.ocupacion}`);
  if (d.direccion)       camposConocidos.push(`- Dirección: ${d.direccion}`);

  const datosConocidosTexto = camposConocidos.length > 0
    ? `\n\nDATOS YA DISPONIBLES EN EL SISTEMA (NO preguntes estos campos, ya los tenemos):\n${camposConocidos.join('\n')}`
    : '';

  const contexto = [
    nombrePaciente ? `Nombre del paciente: ${nombrePaciente}.` : '',
    zonasTexto,
    datosConocidosTexto,
  ].filter(Boolean).join(' ');

  const messages: any[] = [];

  if (historial.length === 0) {
    messages.push({
      role: 'user',
      content: [{ text: contexto + '\n\nSalúdame y empieza la conversación.' }]
    });
    messages.push({
      role: 'assistant',
      content: [{ text: '¡Hola! Bienvenido a Crisalia.' }]
    });
  } else {
    for (const m of historial) {
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

  const contextoCompleto = `${systemPrompt}\n\nContexto del paciente: ${contexto}`;

  console.log('[CuerpoConChat] ▶ invoke Claude', {
    modelId:          MODEL_ID,
    region:           REGION,
    historialLen:     historial.length,
    mensajeUsuario:   mensajeUsuario.slice(0, 80),
    estructuraCargada: ESTRUCTURA_S01_S03.length > 0,
    systemPromptLen:  contextoCompleto.length,
  });

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: contextoCompleto }],
    messages,
    inferenceConfig: { maxTokens: 1500, temperature: 0.7 }
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
export async function responderInterrogatorioConClaude(params: {
  historial: MensajeChat[];
  mensajeUsuario: string;
  sintomaInicial: string;
  preguntasFiltradas: any[];   // preguntas extraídas del JSON según id_pregunta del Agent
  resumenRespuestas: string;
  nombrePaciente?: string;
}): Promise<string> {
  const { historial, mensajeUsuario, sintomaInicial, preguntasFiltradas, resumenRespuestas, nombrePaciente } = params;

  // Serializar las preguntas de forma concisa para Claude
  const preguntasTexto = preguntasFiltradas.map((q, i) => {
    let linea = `${i + 1}. [${q.id}] ${q.text || q.title || ''} (tipo: ${q.type}`;
    if (q.type === 'single' && q.options?.length) {
      linea += `, opciones: ${q.options.map((o: any) => o.label).join(' / ')}`;
    } else if (q.type === 'checkbox' && q.options?.length) {
      linea += `, opciones múltiples: ${q.options.map((o: any) => o.label).join(' / ')}`;
    } else if (q.type === 'symptom_table' && q.items?.length) {
      linea += `, ítems de tabla: ${q.items.map((it: any) => it.label).join(', ')}`;
    }
    linea += ')';
    return linea;
  }).join('\n');

  const systemPrompt = `FASE 2 DEL INTERROGATORIO CLÍNICO — CRISAL-IA

Eres Crisal-IA, recopilando información clínica del paciente para el médico funcional.

1. PREGUNTAS A REALIZAR (en orden, una a la vez)

${preguntasTexto}

Cuando hayas hecho TODAS las preguntas y recibido respuesta de cada una, emite [[FIN_RONDA]].
NO hagas preguntas que no estén en esta lista.

2. INTELIGENCIA CONTEXTUAL

- NUNCA repitas una pregunta que ya hiciste — revisa el historial antes de cada turno.
- Adapta el tono según lo que el paciente ya respondió.
- Si una pregunta no aplica (ej: embarazo a un hombre), omítela y pasa a la siguiente.

3. FORMATO DE OPCIONES Y TABLAS

- type "single" → presenta opciones en "opciones", tipoOpciones: "single"
- type "checkbox" → presenta opciones en "opciones", tipoOpciones: "checkbox"
- type "text" → opciones: []
- type "symptom_table" → usa formato tabla:
  {"texto":"...","opciones":[],"tipoOpciones":"tabla","tabla":[{"id":"item_id","label":"Nombre síntoma"},...],"respuestaLibre":true}
  NUNCA listes ítems como texto — SIEMPRE usa la tabla cuando hay múltiples ítems 0-3.

4. SEÑALES DE ALARMA

Si el paciente menciona síntomas graves, indica: "Lo que describes podría requerir atención médica urgente."

5. EXTRACCIÓN — OBLIGATORIO EN CADA TURNO

Después del JSON de respuesta, agrega SIEMPRE (acumulando todas las respuestas de la ronda):
[[RESPUESTAS_RONDA]]
{"campo_id": valor, ...}
[[/RESPUESTAS_RONDA]]

- Usa los IDs exactos de la lista de preguntas (ej: s28_dolor_cronico, s13_horas_sueno)
- scale_0_3 → número; single → value; checkbox → array; tabla → {item_id: valor}; text → string

6. FORMATO DE RESPUESTA — CRÍTICO

CADA respuesta debe ser ÚNICAMENTE el JSON, sin texto antes ni después:
{"texto":"Comentario empático + la pregunta en una sola frase","opciones":[...],"tipoOpciones":"single","respuestaLibre":true}

Los bloques técnicos ([[RESPUESTAS_RONDA]], [[FIN_RONDA]]) van DESPUÉS del JSON.

INFORMACIÓN DEL PACIENTE YA RECOPILADA:
${resumenRespuestas || 'Primera sesión del interrogatorio.'}`;

  const messages: any[] = [];

  if (historial.length === 0) {
    const intro = nombrePaciente
      ? `Soy ${nombrePaciente}. Continúa el interrogatorio.`
      : 'Continúa el interrogatorio.';
    messages.push({ role: 'user', content: [{ text: `Síntoma principal: "${sintomaInicial}". ${intro}` }] });
    messages.push({ role: 'assistant', content: [{ text: '{"texto":"Perfecto, continuemos. Voy a hacerte algunas preguntas más sobre tu salud.","opciones":[],"tipoOpciones":"single","respuestaLibre":true}' }] });
  }

  for (const msg of historial) {
    if (msg.rol === 'usuario') {
      messages.push({ role: 'user', content: [{ text: msg.texto }] });
    } else {
      messages.push({ role: 'assistant', content: [{ text: msg.texto }] });
    }
  }

  messages.push({ role: 'user', content: [{ text: mensajeUsuario }] });

  console.log('[responderInterrogatorioConClaude] messages enviados:', JSON.stringify(messages.map(m => ({ role: m.role, text: m.content[0].text.slice(0, 80) }))));

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens: 2048, temperature: 0.4 },
  });

  const response = await client.send(command);
  const raw = (response.output?.message?.content?.[0] as any)?.text ?? '';

  console.log('[responderInterrogatorioConClaude] ◀', {
    historialLen: historial.length,
    preguntasCount: preguntasFiltradas.length,
    rawLen: raw.length,
    tieneFIN: raw.includes('[[FIN_RONDA]]'),
  });

  return raw;
}