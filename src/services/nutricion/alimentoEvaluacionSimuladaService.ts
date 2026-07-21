export interface PerfilParaEvaluacionAlimento {
  nombre: string;
  apellido: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  fechaNacimiento?: string;
  sexoBiologico?: string;
  eps?: string;
  zonasDolor?: string[];
  edadAnios?: number;
  resumenIA?: string;
  formulaMedica?: {
    medicamentos?: string[];
    diagnostico?: string;
    indicaciones?: string;
  };
  historiaClinica?: {
    motivoConsulta?: string;
    diagnosticos?: any;
    planTratamiento?: string;
    antecedentes?: any;
  };
}

export interface AlimentoChatMensaje {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  creadoEn: string;
}

function edadDesdeIso(iso?: string): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Respuesta tipo chat simulada. Sustituir por invocación a Lambda manteniendo la misma forma de `mensajes`.
 */
export function generarAnalisisAlimentoSimulado(perfil: PerfilParaEvaluacionAlimento): AlimentoChatMensaje[] {
  const now = () => new Date().toISOString();
  const nombre = [perfil.nombre, perfil.apellido].filter(Boolean).join(' ').trim() || 'Paciente';
  const edad = perfil.edadAnios ?? edadDesdeIso(perfil.fechaNacimiento);
  const edadTxt = edad != null && edad > 0 ? `${edad} años` : null;
  const zonas =
    perfil.zonasDolor && perfil.zonasDolor.length > 0
      ? ` En tu perfil registraste focos de malestar en: ${perfil.zonasDolor.slice(0, 5).join(', ')}.`
      : '';

  const m: AlimentoChatMensaje[] = [
    {
      id: 'u1',
      rol: 'usuario',
      texto: 'Acabo de subir una foto de mi plato para evaluación visual.',
      creadoEn: now()
    },
    {
      id: 'a1',
      rol: 'asistente',
      texto: `Hola, ${nombre}${edadTxt ? ` (${edadTxt})` : ''}. Tu imagen quedó guardada correctamente. Esta respuesta es simulada: cuando conectes tu Lambda, aquí llegará el análisis real usando la misma imagen y tu perfil.`,
      creadoEn: now()
    },
    {
      id: 'a2',
      rol: 'asistente',
      texto: `El servicio de análisis recibirá la foto que guardamos en tu espacio seguro junto con datos de tu perfil (nombre, documento, edad si consta, EPS y zonas de dolor) para contextualizar recomendaciones.${zonas}`,
      creadoEn: now()
    },
    {
      id: 'a3',
      rol: 'asistente',
      texto:
        'Ejemplo de análisis (simulado): parece un plato mixto con carbohidrato y proteína visible. Podrías priorizar más vegetales de colores en la próxima comida y hidratarte bien. Las porciones exactas dependen de tu plan nutricional individual.',
      creadoEn: now()
    },
    {
      id: 'a4',
      rol: 'asistente',
      texto:
        'Recuerda: esto no es diagnóstico ni prescripción. Valida cualquier cambio con tu médico o nutricionista de CRISAL-IA.',
      creadoEn: now()
    }
  ];

  return m;
}
