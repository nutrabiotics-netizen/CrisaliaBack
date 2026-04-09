/** Tipos para respuestas simuladas de IA (perfil médico). Sin persistencia ni integraciones externas. */

export interface IContratoPerfil {
  medicoId?: string;
  nombreCompleto?: string;
  especialidad?: string;
  jurisdiccion?: string;
}

export interface IContratoGenerado {
  versionPlantilla: string;
  clausulas: string[];
  textoPlano: string;
  advertenciaLegal: string;
}

export interface IAnamnesisMedicoPayload {
  interrogatorioId?: string;
  pacienteId?: string;
  fragmentoContexto?: string;
}

export interface IAnalisisMedico {
  resumenViñetas: string[];
  hallazgosPorSemaforo: {
    rojo: string[];
    amarillo: string[];
    verde: string[];
  };
  objetivosPaciente: string[];
  notasIA: string;
}

export interface IDiagnosticoPayload {
  pacienteId?: string;
  citaId?: string;
  contextoBreve?: string;
}

export interface IDiagnosticoSugerido {
  tipo: 'disfuncion_fisiologica' | 'cie10_sugerido' | 'paraclinico';
  titulo: string;
  detalle: string;
  confianza: number;
  obligatorioPorDefecto: boolean;
  hiloRazonamiento: string;
}

export interface IETPayload {
  pacienteId?: string;
  diagnosticosClave?: string[];
}

export interface IETSugerida {
  nombre: string;
  categoria: string;
  prioridad: 'alta' | 'media' | 'baja';
  pasos: string[];
  referenciaMF: string;
}

export interface IAudioPayload {
  duracionSegundos?: number;
  citaId?: string;
}

export interface ITranscripcion {
  texto: string;
  segmentos: Array<{ tInicio: number; tFin: number; rol: 'medico' | 'paciente'; texto: string }>;
  sugerenciasExamenFisico: string[];
}

export interface IParaclinicosPayload {
  pacienteId?: string;
  valoresEjemplo?: Array<{ nombre: string; valor: string; unidad: string; refMin?: string; refMax?: string }>;
}

export interface IAnalisisParaclinicos {
  lineaTemporal: Array<{ fecha: string; examen: string; hallazgo: string; semaforo: 'rojo' | 'amarillo' | 'verde' }>;
  correlacionAnamnesis: string[];
  conversionesAplicadas: string[];
}

export interface IControlPayload {
  pacienteId?: string;
  tipoControl?: 'seguimiento' | 'revaloracion';
}

export interface IResumenControl {
  evolucionClinica: string;
  adherenciaEstimada: number;
  semaforoGeneral: 'rojo' | 'amarillo' | 'verde';
  sugerenciaProximaConsultaSemanas: number;
  puntosAtencion: string[];
}

export interface IFragmentoMF {
  id: string;
  titulo: string;
  conferencista: string;
  tipo: 'video' | 'audio' | 'documento';
  extracto: string;
  etiquetas: string[];
  relevancia: number;
}

export interface IAgendaPayload {
  medicoId?: string;
  cancelacionesIds?: string[];
  sedesResumen?: string[];
}

export interface IAgendaOptimizada {
  mensaje: string;
  slotsSugeridos: Array<{ fecha: string; horaInicio: string; horaFin: string; motivo: string }>;
  reubicaciones: Array<{ pacienteRef: string; de: string; a: string }>;
}

export interface IAnamnesisListaDemoItem {
  id: string;
  paciente: string;
  porcentaje: number;
  fecha: string;
  semaforo: { rojo: number; amarillo: number; verde: number };
  objetivos: string[];
  estado: 'completa' | 'en-proceso';
}

export interface IMetricasImpactoDemo {
  disfunciones: Array<{ nombre: string; severidad: string; impacto: number }>;
  estrategias: Array<{ estrategia: string; efectividad: number; evidencia: string }>;
}

export interface IVersiculoNTV {
  referencia: string;
  texto: string;
  relacionado: string;
}
