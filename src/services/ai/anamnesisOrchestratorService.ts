/**
 * anamnesisOrchestratorService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orquesta el flujo conversacional de la anamnesis funcional:
 *
 *   1. cargarSecciones()        → lee JSONs de src/data/anamnesis_sections/
 *   2. calcularScores()         → semaforización por sección sobre las respuestas guardadas
 *   3. consultarSiguientePaso() → arma el prompt y consulta al Agent orquestador
 *   4. generarSintesis()        → invoca al Agent para producir la sección 37
 */

import path from 'path';
import fs   from 'fs';
import {
  invokeAnamnesisAgent,
  AgentDecision,
  AgentDecisionGenerarS37,
  AnamnesisAgentOptions,
} from './anamnesisAgentService';

// ─── Ruta base de los JSONs ───────────────────────────────────────────────────
// __dirname apunta a dist/services/ai/ en producción y a src/services/ai/ en dev.
// La carpeta data/ siempre vive en src/data/, por lo que resolvemos desde la raíz
// del proyecto (process.cwd()) que es siempre CrisaliaBack/.

const SECTIONS_DIR = path.resolve(process.cwd(), 'src/data/anamnesis_sections');

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface ScorSeccion {
  seccionId:    string;
  puntaje:      number;      // 0–100 %
  semaforo:     'verde' | 'amarillo' | 'rojo';
  itemsCriticos: string[];   // ids de ítems con valor 3
  itemsRespondidos: number;
}

export interface ResumenScores {
  porSeccion:   Record<string, ScorSeccion>;
  seccRojas:    string[];
  seccAmarillas: string[];
  itemsCriticos: string[];   // todos los ítems con valor 3, aplanados
}

export interface PayloadSiguientePaso {
  sintomaInicial:       string;
  seccionesCompletadas: string[];
  scores:               ResumenScores;
  medicacionActual?:    string;
  resumenRespuestas?:   string;  // resumen de respuestas clave para contextualizar al Agent
  sessionId?:           string;
}

// ─── 1. Cargar secciones desde disco ─────────────────────────────────────────

/**
 * Lee los archivos {id}.json de src/data/anamnesis_sections y devuelve
 * un objeto { [id]: contenido }.
 * Solo carga las secciones pedidas — no todas.
 */
export function cargarSecciones(ids: string[]): Record<string, any> {
  const resultado: Record<string, any> = {};

  console.log('[AnamnesisOrchestrator] cargarSecciones — SECTIONS_DIR:', SECTIONS_DIR, '| ids:', ids);
  for (const id of ids) {
    const filePath = path.join(SECTIONS_DIR, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      console.warn(`[AnamnesisOrchestrator] sección no encontrada: ${id}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      resultado[id] = JSON.parse(raw);
    } catch (e) {
      console.error(`[AnamnesisOrchestrator] error leyendo ${id}.json:`, e);
    }
  }

  return resultado;
}

/**
 * Carga el index.json con el listado de todas las secciones disponibles.
 */
export function cargarIndex(): any {
  const indexPath = path.join(SECTIONS_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) throw new Error('index.json de secciones no encontrado');
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

// ─── 2. Calcular scores de semaforización ────────────────────────────────────

/**
 * Dada la estructura de respuestas guardada en Interrogatorio.respuestas,
 * calcula el score por sección.
 *
 * Convención de respuestas en el modelo Interrogatorio:
 *   { [itemId]: number (0-3) | string | string[] | boolean }
 *
 * Solo los ítems con type "scale_0_3" participan en el cálculo de score.
 * Los de type "checkbox", "single", "text", "table" no suman puntos.
 *
 * Para saber si un ítem es scale_0_3 usamos el index de secciones cargado en memoria.
 */
export function calcularScores(
  respuestas: Record<string, any>,
  seccionesIndex: any[]
): ResumenScores {
  const porSeccion: Record<string, ScorSeccion> = {};
  const itemsCriticosGlobal: string[] = [];

  for (const seccion of seccionesIndex) {
    const seccionData = cargarSecciones([seccion.id])[seccion.id];
    if (!seccionData?.questions) continue;

    let sumaObtenida  = 0;
    let itemsRespondidos = 0;
    const itemsCriticos: string[] = [];

    for (const pregunta of seccionData.questions) {
      // Preguntas tipo symptom_table contienen sub-ítems scale_0_3
      if (pregunta.type === 'symptom_table' && Array.isArray(pregunta.items)) {
        for (const item of pregunta.items) {
          const valor = respuestas[item.id];
          if (valor === undefined || valor === null) continue;

          const num = Number(valor);
          if (isNaN(num)) continue;

          sumaObtenida += num;
          itemsRespondidos++;

          if (num === 3) {
            itemsCriticos.push(item.id);
            itemsCriticosGlobal.push(item.id);
          }
        }
      }

      // Preguntas tipo scale (escala numérica como nivel de estrés 0-10)
      // No participan en la semaforización 0-3
    }

    if (itemsRespondidos === 0) continue;

    const maxPosible = itemsRespondidos * 3;
    const puntaje    = Math.round((sumaObtenida / maxPosible) * 100);
    const semaforo: ScorSeccion['semaforo'] =
      puntaje < 20 ? 'verde' : puntaje <= 45 ? 'amarillo' : 'rojo';

    porSeccion[seccion.id] = {
      seccionId: seccion.id,
      puntaje,
      semaforo,
      itemsCriticos,
      itemsRespondidos,
    };
  }

  const seccRojas    = Object.values(porSeccion).filter(s => s.semaforo === 'rojo').map(s => s.seccionId);
  const seccAmarillas = Object.values(porSeccion).filter(s => s.semaforo === 'amarillo').map(s => s.seccionId);

  return { porSeccion, seccRojas, seccAmarillas, itemsCriticos: itemsCriticosGlobal };
}

// ─── 3. Consultar al Agent cuál es el siguiente paso ─────────────────────────

/**
 * Arma el prompt de contexto y consulta al Agent orquestador.
 * Devuelve la decisión parseada: entrevistar | generar_s37 | alerta_medica.
 */
export async function consultarSiguientePaso(
  payload: PayloadSiguientePaso,
  opts: AnamnesisAgentOptions = {}
): Promise<AgentDecision> {
  const { sintomaInicial, scores, medicacionActual, resumenRespuestas } = payload;

  const rojas    = scores.seccRojas.join(', ')    || 'ninguna';
  const amarillas = scores.seccAmarillas.join(', ') || 'ninguna';
  const criticos  = scores.itemsCriticos.slice(0, 20).join(', ') || 'ninguno';

  const medicacionStr = medicacionActual
    ? `\nMEDICACIÓN ACTUAL (s06):\n${medicacionActual}`
    : '';

  const resumenStr = resumenRespuestas
    ? `\nRESUMEN DE RESPUESTAS CLAVE YA RECOPILADAS:\n${resumenRespuestas}`
    : '';

  const prompt = `Eres el orquestador de anamnesis de Crisal-IA. Analiza el estado actual del interrogatorio y decide el siguiente paso para construir un PERFIL CLÍNICO INTEGRAL del paciente.

Tu objetivo NO es únicamente profundizar en el síntoma principal. El síntoma o motivo de consulta inicial es el punto de entrada, pero debes asegurar que la entrevista explore también otras áreas clínicas relevantes que puedan modificar la interpretación del caso, revelar factores de riesgo, detectar problemas adicionales o aportar contexto al médico.

SÍNTOMA O MOTIVO DE CONSULTA INICIAL:
${sintomaInicial}


SEMAFORIZACIÓN ACTUAL:
- Secciones en rojo (>45%): ${rojas}
- Secciones en amarillo (20-45%): ${amarillas}
- Ítems con valor 3 (críticos): ${criticos}
${medicacionStr}${resumenStr}

### OBJETIVO DE LA ENTREVISTA

Evalúa el caso en DOS NIVELES:

1. PROFUNDIZACIÓN DEL MOTIVO DE CONSULTA
   - Características, evolución, intensidad, temporalidad y factores asociados.
   - Síntomas acompañantes relevantes.
   - Banderas rojas.
   - Impacto funcional.
   - Factores desencadenantes, agravantes y de alivio.
   - Tratamientos previos y respuesta.

2. EXPLORACIÓN CLÍNICA TRANSVERSAL
   Aunque el motivo de consulta esté suficientemente explorado, verifica si es necesario explorar otras áreas que puedan ser clínicamente relevantes:
   - Antecedentes personales y enfermedades previas.
   - Cirugías y hospitalizaciones.
   - Medicamentos actuales y recientes.
   - Alergias y reacciones adversas.
   - Antecedentes familiares relevantes.
   - Hábitos y exposiciones: tabaco, alcohol, otras sustancias, alimentación, actividad física, sueño, etc.
   - Contexto ocupacional y ambiental.
   - Contexto psicosocial y salud mental cuando sea pertinente.
   - Salud sexual y reproductiva cuando sea pertinente.
   - Síntomas adicionales o problemas de salud diferentes al motivo principal.
   - Revisión dirigida de otros sistemas cuando pueda aportar información relevante.
   - Cualquier otro factor de riesgo o contexto que pueda cambiar la interpretación clínica.

### REGLA DE COBERTURA

No consideres que el interrogatorio está completo únicamente porque el síntoma principal esté bien caracterizado.

Antes de seleccionar "generar_s37", debes evaluar:

A. ¿El motivo de consulta está suficientemente caracterizado?
B. ¿Se descartaron o exploraron las principales banderas rojas?
C. ¿Se exploraron los antecedentes y factores de riesgo relevantes?
D. ¿Se revisaron medicamentos y alergias?
E. ¿Se exploraron síntomas o problemas adicionales potencialmente relevantes?
F. ¿Existe algún área transversal que, dada la información disponible, pueda cambiar el diagnóstico diferencial, el nivel de riesgo o la conducta médica?

Si la respuesta a alguna de estas preguntas es "sí, todavía falta información clínicamente relevante", selecciona "entrevistar", incluso si el síntoma principal ya está suficientemente cubierto.

### PRIORIZACIÓN

No intentes preguntar exhaustivamente todas las áreas en todos los pacientes.

Selecciona la siguiente sección basándote en:
1. Riesgo inmediato y banderas rojas.
2. Información que pueda cambiar significativamente la interpretación o conducta clínica.
3. Áreas que aún no han sido exploradas y que sean relevantes para este paciente.
4. Profundización del motivo de consulta.
5. Información de menor impacto clínico.

La entrevista debe ser ADAPTATIVA: no hagas preguntas por completar casillas. Explora únicamente aquello que tenga valor clínico para el caso.

### DECISIÓN

Basándote en toda la información disponible:

- Si hay banderas rojas que requieren atención médica inmediata → accion: "alerta_medica". En este caso incluye el campo "mensaje_urgencias": una frase corta y clara (máximo 2 oraciones) que el paciente debe decir en voz alta al llegar a urgencias para que el personal identifique rápidamente su cuadro. Redáctala en primera persona, sin tecnicismos, usando el lenguaje del paciente. Ejemplo: "Tengo un dolor opresivo en el pecho que se irradia al brazo izquierdo, comenzó hace 2 horas y es muy intenso."
- Si falta información clínicamente relevante, ya sea del motivo de consulta O de otras áreas del perfil clínico → accion: "entrevistar"
- Si el motivo de consulta está suficientemente caracterizado Y las áreas transversales relevantes ya fueron exploradas Y no identificas vacíos clínicamente importantes → accion: "generar_s37"

### PROGRESO

Incluye SIEMPRE el campo "progreso" (0-100).

"progreso" representa qué tan completo está el PERFIL CLÍNICO INTEGRAL del paciente, NO únicamente qué tan bien se exploró el síntoma principal.

No es un conteo mecánico de preguntas ni de secciones. Es tu juicio clínico sobre qué tan preparado está el perfil para que un médico pueda comprender el caso, valorar riesgos y tomar decisiones.

Usa aproximadamente esta orientación:

- 0-20%: solo motivo de consulta o información muy inicial.
- 20-40%: motivo de consulta parcialmente caracterizado y pocos datos contextuales.
- 40-60%: motivo de consulta razonablemente explorado, pero existen vacíos importantes en antecedentes, riesgos u otras áreas.
- 60-80%: motivo de consulta bien caracterizado y varias áreas transversales relevantes exploradas.
- 80-94%: perfil clínico integral bastante completo; solo quedan vacíos menores o áreas de relevancia secundaria.
- 95-100%: suficiente información clínica para generar una síntesis útil, sin vacíos relevantes identificados.

IMPORTANTE:
Un paciente NO debe recibir un progreso alto simplemente porque se hicieron muchas preguntas sobre su síntoma principal. La cobertura debe distribuirse entre la profundización del problema actual y las áreas transversales clínicamente relevantes.

Si existe un vacío importante en un área transversal, el progreso debe reflejarlo aunque el motivo de consulta esté completamente explorado.

Responde ÚNICAMENTE con el JSON estructurado según tu formato de salida. Sin texto antes ni después.`;

  return invokeAnamnesisAgent(prompt, opts);
}

// ─── 4. Generar síntesis (Sección 37) ────────────────────────────────────────

/**
 * Genera la síntesis funcional completa del interrogatorio.
 * Se llama solo cuando el Agent ha decidido accion: "generar_s37".
 *
 * Devuelve el objeto AgentDecisionGenerarS37 con disfunciones, paraclínicos y plan.
 */
export async function generarSintesis(
  respuestas: Record<string, any>,
  scores: ResumenScores,
  sintomaInicial: string,
  medicacionActual: string,
  opts: AnamnesisAgentOptions = {}
): Promise<AgentDecisionGenerarS37> {
  const rojas    = scores.seccRojas.join(', ')    || 'ninguna';
  const amarillas = scores.seccAmarillas.join(', ') || 'ninguna';
  const criticos  = scores.itemsCriticos.slice(0, 30).join(', ') || 'ninguno';

  // Serializar respuestas relevantes (solo scale_0_3 con valor > 0)
  const respuestasFiltradas = Object.entries(respuestas)
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `Eres el orquestador de anamnesis de Crisal-IA. Genera la síntesis funcional completa (Sección 37) para este paciente.

SÍNTOMA O MOTIVO DE CONSULTA INICIAL:
${sintomaInicial}

SEMAFORIZACIÓN FINAL:
- Secciones en rojo: ${rojas}
- Secciones en amarillo: ${amarillas}
- Ítems críticos (valor 3): ${criticos}

MEDICACIÓN ACTUAL:
${medicacionActual || 'No registrada'}

RESPUESTAS CON VALOR > 0:
${respuestasFiltradas || '(sin respuestas registradas)'}

Consulta tus bases de conocimiento fisiopatológico y de productos para:
1. Identificar y jerarquizar las disfunciones fisiológicas probables
2. Proponer los paraclínicos confirmatorios necesarios
3. Proponer el protocolo de productos por etapa (verificando contraindicaciones con la medicación actual)
4. Generar la impresión diagnóstica funcional integrada

Responde ÚNICAMENTE con el JSON de accion: "generar_s37". Sin texto antes ni después.`;

  const decision = await invokeAnamnesisAgent(prompt, opts);

  if (decision.accion !== 'generar_s37') {
    throw new Error(`Se esperaba generar_s37 pero el Agent devolvió: ${decision.accion}`);
  }

  return decision as AgentDecisionGenerarS37;
}