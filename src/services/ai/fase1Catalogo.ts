/** Referencia compartida de abordajes de Crisal-IA, sin inicializar servicios de IA. */
export const SECCION_11_DISFUNCIONES = `11. DOCUMENTO DE REFERENCIA — CÓMO CRISAL-IA ABORDA CADA DISFUNCIÓN

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
