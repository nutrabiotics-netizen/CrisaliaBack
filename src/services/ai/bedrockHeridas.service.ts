/**
 * Servicio Bedrock ESPECIALIZADO para Historia Clínica de HERIDAS.
 *
 * 100% paralelo al `bedrock.service.ts` general — vive aparte para no
 * modificar el pipeline que ya está funcionando bien. Usa Claude directo
 * (Converse) con un prompt propio que extrae las 14 secciones del HC de heridas.
 */

import { invokeBedrockText } from './bedrockTextService';

const HERIDAS_MODEL_ID = (
  process.env.BEDROCK_HERIDAS_MODEL_ID ||
  process.env.BEDROCK_TEXT_MODEL_ID ||
  process.env.BEDROCK_VISION_MODEL_ID ||
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
).trim();

console.log('[bedrockHeridas] modelId:', HERIDAS_MODEL_ID);

export interface BedrockHeridasInput {
  patientHistoryContext: string;
  transcriptionSegment: string;
  isPartial?: boolean;
  currentSections?: Record<string, string>;
  activeSection?: string;
}

export interface HeridasProposal {
  /** Clave de la sección del HC Heridas. */
  seccion:
    | 'identificacion_paciente'
    | 'motivo_consulta'
    | 'enfermedad_actual'
    | 'antecedentes'
    | 'valoracion_riesgo_cicatrizacion'
    | 'examen_fisico'
    | 'valoracion_especializada_herida'
    | 'caracterizacion_herida'
    | 'clasificaciones'
    | 'registro_fotografico'
    | 'plan_manejo'
    | 'educacion_paciente'
    | 'seguimiento_evolutivo'
    | 'escalas_aplicadas'
    | string;
  contenido: string;
}

export interface BedrockHeridasResponse {
  resumen?: string;
  propuestas?: HeridasProposal[];
}

function buildHeridasPrompt(input: BedrockHeridasInput): string {
  // NOTA: `identificacion_paciente` NO está aquí — esa sección se precarga desde
  // el registro del paciente, no la genera la IA.
  const ALL_SECTIONS = [
    'motivo_consulta',
    'enfermedad_actual',
    'antecedentes',
    'valoracion_riesgo_cicatrizacion',
    'examen_fisico',
    'valoracion_especializada_herida',
    'caracterizacion_herida',
    'clasificaciones',
    'registro_fotografico',
    'plan_manejo',
    'educacion_paciente',
    'seguimiento_evolutivo',
    'escalas_aplicadas'
  ];

  const sections = input.currentSections || {};
  const emptyKeys: string[] = [];
  const filledDetails: string[] = [];
  for (const key of ALL_SECTIONS) {
    const val = sections[key];
    // Considerar llena si: es string no vacío Y no es un objeto vacío {} o []
    const isFilledString = typeof val === 'string' && val.trim().length > 2 &&
      val.trim() !== '{}' && val.trim() !== '[]' && val.trim() !== 'null';
    if (isFilledString) {
      filledDetails.push(`${key}: "${val.replace(/\s+/g, ' ').slice(0, 100)}"`);
    } else {
      emptyKeys.push(key);
    }
  }
  const vacias = emptyKeys.length ? `\nSECCIONES SIN DATOS AÚN (prioridad): ${emptyKeys.join(', ')}` : '';
  const llenas = filledDetails.length ? `\nSECCIONES CON DATOS PARCIALES (puede haber más campos por llenar):\n${filledDetails.join('\n')}` : '';
  const foco = input.activeSection ? `\nSección en foco: ${input.activeSection}` : '';

  return `ROL: Asistente DOCUMENTAL especializado en CLÍNICA DE HERIDAS. Estructuras texto de una valoración profesional de heridas YA realizada por un profesional habilitado en las 14 secciones del formato oficial. NO diagnosticas, NO prescribes — solo organizas la información que el profesional ya generó.

NO te rehúses: si el fragmento no contiene info útil, devuelve {"resumen":"Sin información nueva","propuestas":[]}. SIEMPRE devuelve JSON válido.

Paciente: ${input.patientHistoryContext.replace(/\s+/g, ' ').slice(0, 200)}${vacias}${llenas}${foco}

Transcripción (con etiqueta de quién habla). Si aparece "--- NUEVO ---", el texto después es lo reciente a procesar; el texto antes es contexto previo ya procesado — úsalo solo para entender el caso, no para reextraer campos que ya están en las secciones llenas:
${input.transcriptionSegment}

TAREA: Clasifica la información en las 14 secciones clínicas del HC de heridas.
IMPORTANTE para identificación: nombre, documento, edad, sexo, EPS y teléfono ya vienen del registro del paciente — NO los repitas. Solo extrae de la transcripción: ARL, número de historia clínica, responsable/cuidador, parentesco, teléfono del responsable, fecha y hora de consulta.

SECCIONES VÁLIDAS (usa exactamente estas claves):
- motivo_consulta: motivo en 1-2 frases.
- enfermedad_actual: tiempo de evolución, forma de inicio, tratamientos previos, cambios recientes, dolor, exudado, olor, sangrado, fiebre, hospitalizaciones asociadas.
- antecedentes: patológicos (DM, HTA, EAP, ERC, etc.), quirúrgicos, traumáticos, alérgicos, farmacológicos (medicamento/dosis/frecuencia), tabaquismo (paquetes-año), alcohol, familiares.
- valoracion_riesgo_cicatrizacion: estado nutricional (peso, talla, IMC, albúmina, hemoglobina), riesgo cardiovascular, riesgo vascular (pulsos, llenado capilar, ITB izquierdo/derecho), control metabólico (HbA1c, glicemia).
- examen_fisico: signos vitales (TA, FC, FR, T°, SpO2, glicemia capilar), estado general.
- valoracion_especializada_herida: diagnóstico (venosa/arterial/mixta/pie_diabetico/lesion_por_presion/quirurgica/traumatica/quemadura/oncologica/otra), localización anatómica, tiempo de evolución, número de heridas.
- caracterizacion_herida: medidas (longitud, anchura, profundidad, socavamiento, área), bordes (regulares/irregulares/macerados/socavados/epibolizados), lecho (% granulación/esfacelo/necrosis/epitelización), exudado (cantidad ausente/escaso/moderado/abundante; tipo seroso/serosanguinolento/purulento/hematico; color), olor (ausente/leve/moderado/fetido), EVA dolor (curación y reposo, 0-10), infección (signos: eritema, calor, edema, dolor, exudado purulento, celulitis), piel perilesional.
- clasificaciones: Wagner 0-5 (pie diabético), PEDIS, PUSH basal, EVA, ITB, lesión por presión (I-IV), CEAP, Rutherford.
- registro_fotografico: fotografía inicial tomada (true o false), consentimiento firmado (true o false), código de fotografía (string).
- plan_manejo: limpieza (SSN/PHMB), desbridamiento (quirúrgico/autolítico/enzimático/mecánico), apósitos (primario/secundario/frecuencia), descarga de presión, compresión, antibiótico (indicado/esquema/cultivo), remisiones (cirugía vascular, endocrinología, nutrición, infectología), paraclínicos solicitados.
- educacion_paciente: cuidados de la herida, descarga, control glicémico, signos de alarma, nutrición, prevención de recaídas, adherencia.
- seguimiento_evolutivo: próximo control, indicaciones, incapacidad, evolución (Mejoría/Igual/Empeoramiento), documentos en portal.
- escalas_aplicadas: Wagner, PUSH, ITB, EVA, Braden, Norton, CEAP, MNA. IMPORTANTE: si el profesional menciona cualquier número de escala (ej. "Wagner 2", "PUSH 13", "ITB 0.65", "EVA 3"), extráelo SIEMPRE.
- seguimiento_evolutivo: IMPORTANTE: si el profesional menciona próxima cita, control, incapacidad, conducta o evolución del paciente, extráelo SIEMPRE.

═══════════════════════════════════════════════════════════════
IMPORTANTE — USA RUTAS EXACTAS DE CAMPO (notación con puntos).
Para campos estructurados (medidas, lecho, signos vitales, clasificaciones, plan…),
emite UNA propuesta POR CAMPO con la ruta completa. NO uses la clave general.
═══════════════════════════════════════════════════════════════

IDENTIFICACIÓN — extrae cualquier dato mencionado en la transcripción (el sistema protege automáticamente los que ya están registrados):
- "identificacion.nombresApellidos": string
- "identificacion.documento": string (ej. "CC 1234567")
- "identificacion.fechaNacimiento": string (YYYY-MM-DD)
- "identificacion.edad": número
- "identificacion.sexo": "M" o "F" o "Intersexual"
- "identificacion.eps": string
- "identificacion.telefono": string
- "identificacion.direccion": string
- "identificacion.contactoEmergencia": string
- "identificacion.arl": string
- "identificacion.numeroHC": string
- "identificacion.responsable": string (nombre del cuidador/responsable)
- "identificacion.parentesco": string
- "identificacion.telefonoResponsable": string
- "identificacion.fechaConsulta": string (YYYY-MM-DD)
- "identificacion.horaConsulta": string (HH:mm)

CAMPOS DE TEXTO LIBRE (string, puede ser un párrafo):
- "motivoConsulta"
- "enfermedadActual"

ANTECEDENTES (claves específicas):
- "antecedentes.patologicos": array — usa EXACTAMENTE estos valores cuando apliquen: "Diabetes Mellitus", "Hipertensión Arterial", "Dislipidemia", "Enfermedad arterial periférica", "Insuficiencia venosa crónica", "Enfermedad renal crónica", "Cardiopatía", "ECV", "Cáncer". Para otros, agrega el texto descriptivo.
- "antecedentes.quirurgicos": array — ["Facoemulsificación bilateral (4 años)"]
- "antecedentes.traumaticos": string
- "antecedentes.alergicos": array — ["Dipirona — rash cutáneo"]
- "antecedentes.farmacologicos": array de strings — ["Metformina 850 mg BID", "Losartán 50 mg QD"] — UNA entrada por medicamento como string simple
- "antecedentes.tabaquismo.actual": boolean (true/false)
- "antecedentes.tabaquismo.exfumador": boolean (true/false)
- "antecedentes.tabaquismo.paquetesAnio": número
- "antecedentes.alcohol": string
- "antecedentes.familiares": array — ["Padre — pie diabético con gangrena"]

RIESGO DE CICATRIZACIÓN:
- "valoracionRiesgoCicatrizacion.estadoNutricional.pesoKg": número
- "valoracionRiesgoCicatrizacion.estadoNutricional.tallaCm": número
- "valoracionRiesgoCicatrizacion.estadoNutricional.imc": número
- "valoracionRiesgoCicatrizacion.estadoNutricional.albumina": string
- "valoracionRiesgoCicatrizacion.estadoNutricional.hemoglobina": string
- "valoracionRiesgoCicatrizacion.estadoNutricional.perdidaRecientePeso": boolean (true/false)
- "valoracionRiesgoCicatrizacion.controlMetabolico.HbA1c": string
- "valoracionRiesgoCicatrizacion.controlMetabolico.glicemiaAyunas": string
- "valoracionRiesgoCicatrizacion.riesgoVascular.ITBIzquierdo": número
- "valoracionRiesgoCicatrizacion.riesgoVascular.ITBDerecho": número
- "valoracionRiesgoCicatrizacion.riesgoVascular.pulsos": string — empieza con "Presentes", "Disminuidos" o "Ausentes", luego detalle si hay
- "valoracionRiesgoCicatrizacion.riesgoVascular.llenadoCapilarSeg": número
- "valoracionRiesgoCicatrizacion.riesgoCardiovascularAsociado": array — usa EXACTAMENTE estos valores: "HTA", "Diabetes", "Dislipidemia", "Obesidad", "Sedentarismo", "Tabaquismo"

EXAMEN FÍSICO:
- "examenFisico.signosVitales.TA": string ("152/88")
- "examenFisico.signosVitales.FC": número
- "examenFisico.signosVitales.FR": número
- "examenFisico.signosVitales.temperaturaC": número
- "examenFisico.signosVitales.SpO2pct": número
- "examenFisico.signosVitales.glicemiaCapilar": número
- "examenFisico.estadoGeneral": string

VALORACIÓN ESPECIALIZADA:
- "valoracionEspecializada.diagnosticoHerida": "venosa"|"arterial"|"mixta"|"pie_diabetico"|"lesion_por_presion"|"quirurgica"|"traumatica"|"quemadura"|"oncologica"|"otra"
- "valoracionEspecializada.localizacionAnatomica": string
- "valoracionEspecializada.tiempoEvolucion": string ("6 semanas")
- "valoracionEspecializada.numeroHeridas": número

CARACTERIZACIÓN — MEDIDAS (en cm / cm²):
- "caracterizacionHerida.medidas.longitudCm": número (ej 3.5)
- "caracterizacionHerida.medidas.anchuraCm": número (ej 2.8)
- "caracterizacionHerida.medidas.profundidadCm": número
- "caracterizacionHerida.medidas.socavamientoCm": número
- "caracterizacionHerida.medidas.areaCm2": número
- "caracterizacionHerida.medidas.volumenCm3": número

CARACTERIZACIÓN — LECHO (porcentajes, 0-100):
- "caracterizacionHerida.lecho.granulacionPct": número
- "caracterizacionHerida.lecho.esfaceloPct": número
- "caracterizacionHerida.lecho.necrosisPct": número
- "caracterizacionHerida.lecho.epitelizacionPct": número

CARACTERIZACIÓN — OTROS:
- "caracterizacionHerida.bordes": array — usa EXACTAMENTE: "Regulares", "Irregulares", "Macerados", "Socavados", "Epibolizados"
- "caracterizacionHerida.exudado.cantidad": "ausente"|"escaso"|"moderado"|"abundante"
- "caracterizacionHerida.exudado.tipo": "seroso"|"serosanguinolento"|"purulento"|"hematico"
- "caracterizacionHerida.exudado.color": string (ej. "amarillo verdoso")
- "caracterizacionHerida.olor": "ausente"|"leve"|"moderado"|"fetido"
- "caracterizacionHerida.dolorEVA.curacion": número 0-10
- "caracterizacionHerida.dolorEVA.reposo": número 0-10
- "caracterizacionHerida.infeccion.signos": array — usa EXACTAMENTE: "Eritema", "Calor", "Edema", "Dolor", "Exudado purulento", "Celulitis", "Crepitación"
- "caracterizacionHerida.pielPerilesional": array — usa EXACTAMENTE: "Sana", "Macerada", "Eritematosa", "Hiperpigmentada", "Dermatitis asociada"

CLASIFICACIONES:
- "clasificaciones.wagnerPieDiabetico": entero 0-5
- "clasificaciones.PUSHBasal": número
- "clasificaciones.EVADolor": número 0-10
- "clasificaciones.ITBIzquierdo": número
- "clasificaciones.PEDIS": string (resumen ej. "P2 E9.8 D2 I2 S-alt")
- "clasificaciones.lesionPorPresion": "I"|"II"|"III"|"IV"|"no_clasificable"|"lesion_profunda"
- "clasificaciones.CEAPVenosa": string
- "clasificaciones.rutherfordArterial": string

REGISTRO FOTOGRÁFICO — CRÍTICO: usa ÚNICAMENTE el valor booleano JavaScript true o false, NUNCA strings como "Sí", "No", "sí", "yes":
- "registroFotografico.fotografiaInicial": true  ← si se tomó foto; false ← si no
- "registroFotografico.consentimiento": true  ← si el paciente autorizó; false ← si no
- "registroFotografico.codigoFotografia": string (código alfanumérico)
Ejemplo correcto: {"seccion":"registroFotografico.consentimiento","contenido":true}
Ejemplo INCORRECTO: {"seccion":"registroFotografico.consentimiento","contenido":"Sí"}

PLAN DE MANEJO:
- "planManejo.limpieza": array — valores exactos: "SSN 0.9%", "PHMB", o texto libre para otros
- "planManejo.desbridamiento": array — valores exactos: "No requiere", "Quirúrgico", "Autolítico", "Enzimático", "Mecánico"
- "planManejo.apositos.primario": string
- "planManejo.apositos.secundario": string
- "planManejo.apositos.frecuenciaCambio": string ("48-72 h")
- "planManejo.compresion": string ("Sí" o "")
- "planManejo.descargaPresion": string ("Sí" o "")
- "planManejo.antibiotico.indicado": boolean (true/false)
- "planManejo.antibiotico.esquema": string
- "planManejo.remisiones": array — valores exactos: "Cirugía vascular", "Medicina interna", "Endocrinología", "Nutrición", "Infectología", "Rehabilitación"
- "planManejo.paraclinicosSolicitados": array

EDUCACIÓN AL PACIENTE:
- "educacionPaciente": array — usa PRIMERO estos valores exactos cuando apliquen: "Cuidados de la herida", "Signos de alarma", "Nutrición", "Control glicémico", "Prevención de recaídas", "Adherencia al tratamiento". Luego agrega indicaciones adicionales específicas como strings adicionales.

SEGUIMIENTO:
- "seguimientoEvolutivo.fecha": string (YYYY-MM-DD)
- "seguimientoEvolutivo.hora": string (HH:mm)
- "seguimientoEvolutivo.proximoControl": string
- "seguimientoEvolutivo.incapacidadDias": número
- "seguimientoEvolutivo.evolucion": "Mejoría"|"Igual"|"Empeoramiento"
- "seguimientoEvolutivo.fotografiaSeguimiento": boolean (true/false)
- "seguimientoEvolutivo.medidasActuales.longitudCm": número — SIEMPRE llenar si hay medidas de la herida, tanto en primera consulta como en control
- "seguimientoEvolutivo.medidasActuales.anchuraCm": número — ídem
- "seguimientoEvolutivo.medidasActuales.profundidadCm": número — ídem
- "seguimientoEvolutivo.medidasActuales.areaCm2": número — ídem
- "seguimientoEvolutivo.conducta": string
- "seguimientoEvolutivo.indicacionesSeguimiento": array

ESCALAS:
- "escalasAplicadas.wagner": número
- "escalasAplicadas.PUSHBasal": número
- "escalasAplicadas.ITB": número
- "escalasAplicadas.EVA": número
- "escalasAplicadas.norton": número
- "escalasAplicadas.PEDIS": string (resumen ej. "P2 E9.8 D2 I2 S-alt")
- "escalasAplicadas.MNA": string

REGLAS DURAS:
- UNA propuesta POR CAMPO. Si el profesional dice "longitud 3.5 cm y anchura 2.8 cm", emite DOS propuestas separadas.
- USA SIEMPRE la ruta exacta (con puntos). NO uses claves planas como "caracterizacion_herida" o "clasificaciones".
- Las PREGUNTAS del profesional NO se documentan; sus MEDICIONES y HALLAZGOS sí.
- NO inventes — solo extrae lo que está literalmente en la transcripción.
- Devuelve SOLO JSON, sin markdown, sin texto extra.

Salida:
{
  "resumen":"frase corta opcional",
  "propuestas":[
    {"seccion":"motivoConsulta","contenido":"Úlcera plantar de 6 semanas..."},
    {"seccion":"caracterizacionHerida.medidas.longitudCm","contenido":3.5},
    {"seccion":"clasificaciones.wagnerPieDiabetico","contenido":2}
  ]
}

Si NO hay info útil: {"resumen":"Sin información nueva","propuestas":[]}`;
}

function parseJsonLoose(raw: string): BedrockHeridasResponse {
  if (!raw) return { resumen: '', propuestas: [] };
  // Quita posibles fences ```json ... ```
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Si arranca con texto antes del JSON, busca el primer '{'
  const idx = t.indexOf('{');
  if (idx > 0) t = t.slice(idx);
  try {
    const obj = JSON.parse(t);
    return {
      resumen: typeof obj?.resumen === 'string' ? obj.resumen : '',
      propuestas: Array.isArray(obj?.propuestas)
        ? obj.propuestas.filter((p: any) => p && typeof p.seccion === 'string' && p.contenido != null)
        : []
    };
  } catch {
    return { resumen: '', propuestas: [] };
  }
}

/**
 * Invoca Claude (vía bedrockTextService) con el prompt de heridas y devuelve
 * propuestas estructuradas. NO toca el agente Bedrock ni el flujo general.
 */
export async function generarPropuestasHeridas(
  input: BedrockHeridasInput
): Promise<BedrockHeridasResponse> {
  const t0 = Date.now();
  const t = (input.transcriptionSegment || '').trim();
  if (t.length < 30) {
    return { resumen: 'Sin información nueva', propuestas: [] };
  }

  const systemPrompt = 'Eres un asistente documental clínico de cuidado de heridas. Devuelves SIEMPRE JSON válido, en español, sin markdown.';
  const userPrompt = buildHeridasPrompt(input);

  try {
    const raw = await invokeBedrockText(userPrompt, {
      system: systemPrompt,
      maxTokens: 2500,
      temperature: 0.2,
      modelId: HERIDAS_MODEL_ID
    });
    const parsed = parseJsonLoose(raw);
    console.log('[bedrockHeridas] ◀ propuestas', {
      ms: Date.now() - t0,
      count: (parsed.propuestas || []).length,
      resumen: (parsed.resumen || '').slice(0, 80)
    });
    return parsed;
  } catch (err: any) {
    console.error('[bedrockHeridas] ✗ error', err?.message);
    return { resumen: `Error: ${err?.message || 'desconocido'}`, propuestas: [] };
  }
}
