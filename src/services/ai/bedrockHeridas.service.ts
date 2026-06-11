/**
 * Servicio Bedrock ESPECIALIZADO para Historia Clínica de HERIDAS.
 *
 * 100% paralelo al `bedrock.service.ts` general — vive aparte para no
 * modificar el pipeline que ya está funcionando bien. Usa Claude directo
 * (Converse) con un prompt propio que extrae las 14 secciones del HC de heridas.
 */

import { invokeBedrockText } from './bedrockTextService';

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
    if (typeof val === 'string' && val.trim().length > 0) {
      filledDetails.push(`${key}: "${val.replace(/\s+/g, ' ').slice(0, 100)}"`);
    } else {
      emptyKeys.push(key);
    }
  }
  const vacias = emptyKeys.length ? `\nSECCIONES VACÍAS (prioridad): ${emptyKeys.join(', ')}` : '';
  const llenas = filledDetails.length ? `\nSECCIONES YA LLENAS:\n${filledDetails.join('\n')}` : '';
  const foco = input.activeSection ? `\nSección en foco: ${input.activeSection}` : '';

  return `ROL: Asistente DOCUMENTAL especializado en CLÍNICA DE HERIDAS. Estructuras texto de una valoración profesional de heridas YA realizada por un profesional habilitado en las 14 secciones del formato oficial. NO diagnosticas, NO prescribes — solo organizas la información que el profesional ya generó.

NO te rehúses: si el fragmento no contiene info útil, devuelve {"resumen":"Sin información nueva","propuestas":[]}. SIEMPRE devuelve JSON válido.

Paciente: ${input.patientHistoryContext.replace(/\s+/g, ' ').slice(0, 200)}${vacias}${llenas}${foco}

Transcripción nueva (con etiqueta de quién habla):
${input.transcriptionSegment}

TAREA: Clasifica la información en las 13 secciones clínicas del HC de heridas.
IMPORTANTE: NO propongas nada para "identificacion_paciente" — ese dato viene del registro del paciente, NO se extrae de la transcripción. Ignora cualquier mención de nombre, documento, edad o teléfono.

SECCIONES VÁLIDAS (usa exactamente estas claves):
- motivo_consulta: motivo en 1-2 frases.
- enfermedad_actual: tiempo de evolución, forma de inicio, tratamientos previos, dolor, exudado, olor, sangrado, fiebre, hospitalizaciones.
- antecedentes: patológicos (DM, HTA, EAP, ERC, etc.), quirúrgicos, traumáticos, alérgicos, farmacológicos (medicamento/dosis/frecuencia), tabaquismo (paquetes-año), alcohol, familiares.
- valoracion_riesgo_cicatrizacion: estado nutricional (peso, talla, IMC, albúmina, hemoglobina), riesgo cardiovascular, riesgo vascular (pulsos, llenado capilar, ITB izquierdo/derecho), control metabólico (HbA1c, glicemia).
- examen_fisico: signos vitales (TA, FC, FR, T°, SpO2, glicemia capilar), estado general.
- valoracion_especializada_herida: diagnóstico (venosa/arterial/mixta/pie_diabetico/lesion_por_presion/quirurgica/traumatica/quemadura/oncologica/otra), localización anatómica, tiempo de evolución, número de heridas.
- caracterizacion_herida: medidas (longitud, anchura, profundidad, socavamiento, área), bordes (regulares/irregulares/macerados/socavados/epibolizados), lecho (% granulación/esfacelo/necrosis/epitelización), exudado (cantidad ausente/escaso/moderado/abundante; tipo seroso/serosanguinolento/purulento/hematico; color), olor (ausente/leve/moderado/fetido), EVA dolor (curación y reposo, 0-10), infección (signos: eritema, calor, edema, dolor, exudado purulento, celulitis), piel perilesional.
- clasificaciones: Wagner 0-5 (pie diabético), PEDIS, PUSH basal, EVA, ITB, lesión por presión (I-IV), CEAP, Rutherford.
- registro_fotografico: fotografía inicial (sí/no), consentimiento, código de fotografía.
- plan_manejo: limpieza (SSN/PHMB), desbridamiento (quirúrgico/autolítico/enzimático/mecánico), apósitos (primario/secundario/frecuencia), descarga de presión, compresión, antibiótico (indicado/esquema/cultivo), remisiones (cirugía vascular, endocrinología, nutrición, infectología), paraclínicos solicitados.
- educacion_paciente: cuidados de la herida, descarga, control glicémico, signos de alarma, nutrición, prevención de recaídas, adherencia.
- seguimiento_evolutivo: próximo control, indicaciones, incapacidad, documentos en portal.
- escalas_aplicadas: Wagner, PUSH, ITB, EVA, Braden, Norton, CEAP, MNA.

═══════════════════════════════════════════════════════════════
IMPORTANTE — USA RUTAS EXACTAS DE CAMPO (notación con puntos).
Para campos estructurados (medidas, lecho, signos vitales, clasificaciones, plan…),
emite UNA propuesta POR CAMPO con la ruta completa. NO uses la clave general.
═══════════════════════════════════════════════════════════════

CAMPOS DE TEXTO LIBRE (string, puede ser un párrafo):
- "motivoConsulta"
- "enfermedadActual"

ANTECEDENTES (claves específicas):
- "antecedentes.patologicos": array — ["Diabetes Mellitus tipo 2"]
- "antecedentes.quirurgicos": array
- "antecedentes.alergicos": array
- "antecedentes.tabaquismo.paquetesAnio": número
- "antecedentes.alcohol": string
- "antecedentes.familiares": array

RIESGO DE CICATRIZACIÓN:
- "valoracionRiesgoCicatrizacion.estadoNutricional.pesoKg": número
- "valoracionRiesgoCicatrizacion.estadoNutricional.tallaCm": número
- "valoracionRiesgoCicatrizacion.estadoNutricional.imc": número
- "valoracionRiesgoCicatrizacion.controlMetabolico.HbA1c": string
- "valoracionRiesgoCicatrizacion.controlMetabolico.glicemiaAyunas": string
- "valoracionRiesgoCicatrizacion.riesgoVascular.ITBIzquierdo": número
- "valoracionRiesgoCicatrizacion.riesgoVascular.ITBDerecho": número
- "valoracionRiesgoCicatrizacion.riesgoVascular.pulsos": string

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
- "caracterizacionHerida.medidas.areaCm2": número
- "caracterizacionHerida.medidas.socavamientoCm": número

CARACTERIZACIÓN — LECHO (porcentajes, 0-100):
- "caracterizacionHerida.lecho.granulacionPct": número
- "caracterizacionHerida.lecho.esfaceloPct": número
- "caracterizacionHerida.lecho.necrosisPct": número
- "caracterizacionHerida.lecho.epitelizacionPct": número

CARACTERIZACIÓN — OTROS:
- "caracterizacionHerida.bordes": array
- "caracterizacionHerida.exudado.cantidad": "ausente"|"escaso"|"moderado"|"abundante"
- "caracterizacionHerida.exudado.tipo": "seroso"|"serosanguinolento"|"purulento"|"hematico"
- "caracterizacionHerida.olor": "ausente"|"leve"|"moderado"|"fetido"
- "caracterizacionHerida.dolorEVA.curacion": número 0-10
- "caracterizacionHerida.dolorEVA.reposo": número 0-10
- "caracterizacionHerida.infeccion.signos": array
- "caracterizacionHerida.pielPerilesional": array

CLASIFICACIONES:
- "clasificaciones.wagnerPieDiabetico": entero 0-5
- "clasificaciones.PUSHBasal": número
- "clasificaciones.EVADolor": número 0-10
- "clasificaciones.ITBIzquierdo": número
- "clasificaciones.lesionPorPresion": "I"|"II"|"III"|"IV"|"no_clasificable"
- "clasificaciones.CEAPVenosa": string
- "clasificaciones.rutherfordArterial": string

PLAN DE MANEJO:
- "planManejo.limpieza": array
- "planManejo.desbridamiento": array
- "planManejo.apositos.primario": string
- "planManejo.apositos.secundario": string
- "planManejo.apositos.frecuenciaCambio": string ("48-72 h")
- "planManejo.descargaPresion": string
- "planManejo.compresion": string
- "planManejo.antibiotico.esquema": string
- "planManejo.remisiones": array
- "planManejo.paraclinicosSolicitados": array

EDUCACIÓN AL PACIENTE:
- "educacionPaciente": array de strings (cada indicación una entrada)

SEGUIMIENTO:
- "seguimientoEvolutivo.proximoControl": string
- "seguimientoEvolutivo.incapacidadDias": número
- "seguimientoEvolutivo.indicacionesSeguimiento": array

ESCALAS:
- "escalasAplicadas.wagner": número
- "escalasAplicadas.PUSHBasal": número
- "escalasAplicadas.ITB": número
- "escalasAplicadas.EVA": número

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
        ? obj.propuestas.filter((p: any) => p && typeof p.seccion === 'string' && typeof p.contenido === 'string')
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
      maxTokens: 1500,
      temperature: 0.2
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
