import mongoose, { Schema, Document } from 'mongoose';

export interface IHistoriaClinica extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  
  // Información General
  fechaRegistro: Date;
  tipoActividad: string; // Primera Vez, Control, etc.
  acompanamientoEnConsulta?: string;
  pagador?: string;
  
  // Datos del Paciente
  numeroIdentificacion?: string;
  pacienteNombre?: string;
  fechaNacimiento?: Date;
  genero?: string;
  sex?: string; // Sexo biológico del paciente
  telefono1?: string;
  telefono2?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  
  // Datos del Acompañante (si aplica)
  acompananteNombre?: string;
  acompananteParentesco?: string;
  acompananteTelefono?: string;
  acompananteIdentificacion?: string;
  
  // Calidad de la información registrada
  calidadInformacion?: 'buena' | 'regular' | 'limitada';

  // Datos de identificación complementarios (doctor los llena si no vienen del perfil)
  lugarNacimiento?: string;
  nacionalidadHC?: string;

  // Motivo de Atención
  motivoConsulta?: string;
  motivoAtencion?: string;
  // Sub-campos estructurados del motivo
  motivoPrincipal?: string;
  motivoTiempoEvolucion?: string;
  motivoSintema?: string;

  // Antecedentes Familiares y Hereditarios
  afhEnfermedades?: string;
  afhCausaMuerte?: string;

  // Antecedentes Gineco-Obstétricos (solo mujeres)
  agoMenarquia?: string;
  agoRitmoMenstrual?: string;
  agoFUR?: string;
  agoFormulaObstetrica?: string;
  agoVidaSexual?: string;
  agoTamizajes?: string;

  // Antecedentes Personales No Patológicos
  anpHabitos?: string;
  anpAlimentacion?: string;
  anpInmunizaciones?: string;
  anpVivienda?: string;

  // Antecedentes Personales Patológicos
  appEnfermedadesInfancia?: string;
  appEnfermedadesCronicas?: string;
  appQuirurgicos?: string;
  appTraumaticos?: string;
  appAlergicos?: string;
  appFarmacologicos?: string;
  appTransfusionales?: string;
  appHospitalizaciones?: string;

  // Antecedentes de infancia (pediátrico <14 años)
  aiDesarrolloPsicomotor?: string;
  aiDesarrolloActual?: string;
  aiAlimentacion?: string;
  aiCrecimientoDesarrollo?: string;
  aiInmunizaciones?: string;

  // Antecedentes perinatales
  apEmbarazo?: string;
  apEdadGestacional?: string;
  apTipoParto?: 'vaginal' | 'cesarea' | 'instrumentado';
  apMotivoCesarea?: string;
  apComplicaciones?: string;
  apPresentacionFetal?: string;
  apPesoNacer?: string;
  apTallaNacer?: string;
  apPeriodoNeonatal?: string;

  // Revisión por sistemas (15 aparatos/sistemas)
  rsGenerales?: string;
  rsPiel?: string;
  rsCabeza?: string;
  rsOjos?: string;
  rsNariz?: string;
  rsOidos?: string;
  rsBoca?: string;
  rsRespiratorio?: string;
  rsCardiovascular?: string;
  rsDigestivo?: string;
  rsGenitourinario?: string;
  rsMusculoEsqueletico?: string;
  rsSistemaNervioso?: string;
  rsEndocrino?: string;
  rsHematologico?: string;

  // Sub-campos estructurados de enfermedad actual
  eaInicio?: string;
  eaFormaAparicion?: string;
  eaEvolucion?: string;
  eaSintomasAsociados?: string;
  eaFactoresDesencadenantes?: string;
  eaFactoresMejoran?: string;
  eaTratamientosRealizados?: string;
  eaMedicamentosUtilizados?: string;
  eaExamenesPrevios?: string;
  eaResultadosRelevantes?: string;
  eaConsultasPrevias?: string;
  eaEstadoActual?: string;
  enfermedadActual?: string;
  
  // Revisión por Sistemas (solo Primera Vez)
  sistemas?: Array<{
    sistema: string;
    descripcion: string;
  }>;
  
  // Antecedentes (solo Primera Vez)
  antecedentes?: Array<{
    tipo: string;
    descripcion: string;
  }>;
  familiares?: string;
  psicosociales?: string;
  ginecoobstetricos?: Array<{
    tipo: string;
    descripcion: string;
  }>;
  planificacion?: string;
  ciclos?: string;
  
  // Examen Físico
  estadoDeConciencia?: string;
  equiposSignos?: string;
  signosVitales?: {
    presionArterial?: string;
    frecuenciaCardiaca?: string;
    frecuenciaRespiratoria?: string;
    temperatura?: string;
    peso?: string;
    talla?: string;
    imc?: string;
    saturacionOxigeno?: string;
  };
  examenMedico?: {
    cabeza?: string;
    cuello?: string;
    torax?: string;
    abdomen?: string;
    extremidades?: string;
    neurologico?: string;
    otros?: string;
  };
  
  // Resultados Paraclínicos
  resultadosParaclinicos?: string;
  
  // Alertas y Alergias
  alertas?: string;
  alergias?: string;
  
  // Análisis y Plan
  analisisyplan?: string;
  
  // Diagnósticos
  diagnosticos?: Array<{
    codigo?: string;
    descripcion: string;
    tipo?: string;
    relacionado?: string;
  }>;
  
  // Recomendaciones
  recomendaciones?: string;

  // Estrategia Terapéutica (plan de manejo post-consulta)
  habitosTerapeuticos?: string;      // hábitos + nutrición combinados
  suplementosTerapeuticos?: string;  // suplementos y nutracéuticos
  seguimientoTerapeutico?: string;
  horarioTerapeutico?: Array<{
    hora: string;
    tipo: string;
    descripcion: string;
  }>;

  /**
   * Cache de textos generados por el agente Crisal·IA, para no reinvocar
   * al agente cada vez que el paciente abre el resumen de la cita.
   */
  iaRecomendacionesPaciente?: { texto: string; generadoEn: Date };
  iaResumenCita?: { texto: string; generadoEn: Date };

  // Información del Profesional
  profesional?: {
    nombre: string;
    apellido: string;
    especialidad: string;
  };
  
  servicio?: string;
  
  pdfUrl?: string;
  
  // Análisis Fisiológico IA (Semaforización)
  analisisFisiologicoIA?: Array<{
    sistema: string; // Digestivo, Hormonal, Inmune, etc.
    nivel: 'optimo' | 'moderado' | 'critico'; // Verde, Amarillo, Rojo
    puntuacion: number; // 0-100
    hallazgos: string[]; 
  }>;
  
  // Auditoría
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;

  /** Borrado lógico — nunca se elimina físicamente */
  activo: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const HistoriaClinicaSchema = new Schema<IHistoriaClinica>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true
    },
    medicoId: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true
    },
    citaId: {
      type: Schema.Types.ObjectId,
      ref: 'Cita',
      required: true
    },
    fechaRegistro: {
      type: Date,
      required: true,
      default: Date.now
    },
    tipoActividad: {
      type: String,
      required: true
    },
    acompanamientoEnConsulta: String,
    pagador: String,
    numeroIdentificacion: String,
    pacienteNombre: String,
    fechaNacimiento: Date,
    genero: String,
    sex: String,
    telefono1: String,
    telefono2: String,
    email: String,
    direccion: String,
    ciudad: String,
    departamento: String,
    acompananteNombre: String,
    acompananteParentesco: String,
    acompananteTelefono: String,
    acompananteIdentificacion: String,
    calidadInformacion: { type: String, enum: ['buena', 'regular', 'limitada'] },
    lugarNacimiento: String,
    nacionalidadHC:  String,
    motivoConsulta: String,
    motivoAtencion: String,
    motivoPrincipal: String,
    motivoTiempoEvolucion: String,
    motivoSintema: String,
    afhEnfermedades: String, afhCausaMuerte: String,
    agoMenarquia: String, agoRitmoMenstrual: String, agoFUR: String,
    agoFormulaObstetrica: String, agoVidaSexual: String, agoTamizajes: String,
    anpHabitos: String, anpAlimentacion: String, anpInmunizaciones: String, anpVivienda: String,
    appEnfermedadesInfancia: String, appEnfermedadesCronicas: String,
    appQuirurgicos: String, appTraumaticos: String, appAlergicos: String,
    appFarmacologicos: String, appTransfusionales: String, appHospitalizaciones: String,
    aiDesarrolloPsicomotor: String, aiDesarrolloActual: String,
    aiAlimentacion: String, aiCrecimientoDesarrollo: String, aiInmunizaciones: String,
    apEmbarazo: String, apEdadGestacional: String,
    apTipoParto: { type: String, enum: ['vaginal', 'cesarea', 'instrumentado'] },
    apMotivoCesarea: String, apComplicaciones: String,
    apPresentacionFetal: String, apPesoNacer: String,
    apTallaNacer: String, apPeriodoNeonatal: String,
    rsGenerales: String, rsPiel: String, rsCabeza: String, rsOjos: String,
    rsNariz: String, rsOidos: String, rsBoca: String, rsRespiratorio: String,
    rsCardiovascular: String, rsDigestivo: String, rsGenitourinario: String,
    rsMusculoEsqueletico: String, rsSistemaNervioso: String, rsEndocrino: String,
    rsHematologico: String,
    eaInicio: String,
    eaFormaAparicion: String,
    eaEvolucion: String,
    eaSintomasAsociados: String,
    eaFactoresDesencadenantes: String,
    eaFactoresMejoran: String,
    eaTratamientosRealizados: String,
    eaMedicamentosUtilizados: String,
    eaExamenesPrevios: String,
    eaResultadosRelevantes: String,
    eaConsultasPrevias: String,
    eaEstadoActual: String,
    enfermedadActual: String,
    sistemas: [{
      sistema: String,
      descripcion: String
    }],
    antecedentes: [{
      tipo: String,
      descripcion: String
    }],
    familiares: String,
    psicosociales: String,
    ginecoobstetricos: [{
      tipo: String,
      descripcion: String
    }],
    planificacion: String,
    ciclos: String,
    estadoDeConciencia: String,
    equiposSignos: String,
    signosVitales: {
      presionArterial: String,
      frecuenciaCardiaca: String,
      frecuenciaRespiratoria: String,
      temperatura: String,
      peso: String,
      talla: String,
      imc: String,
      saturacionOxigeno: String
    },
    examenMedico: {
      cabeza: String,
      cuello: String,
      torax: String,
      abdomen: String,
      extremidades: String,
      neurologico: String,
      otros: String
    },
    resultadosParaclinicos: String,
    alertas: String,
    alergias: String,
    analisisyplan: String,
    diagnosticos: [{
      codigo: String,
      descripcion: String,
      tipo: String,
      relacionado: String
    }],
    recomendaciones: String,

    // Estrategia Terapéutica
    habitosTerapeuticos:    { type: String, default: '' },
    suplementosTerapeuticos:{ type: String, default: '' },
    seguimientoTerapeutico: { type: String, default: '' },
    horarioTerapeutico: [{
      hora:        String,
      tipo:        String,
      descripcion: String,
    }],

    iaRecomendacionesPaciente: {
      texto: String,
      generadoEn: Date
    },
    iaResumenCita: {
      texto: String,
      generadoEn: Date
    },
    profesional: {
      nombre: String,
      apellido: String,
      especialidad: String
    },
    servicio: String,
    pdfUrl: { type: String, trim: true },
    analisisFisiologicoIA: [{
      sistema: String,
      nivel: { type: String, enum: ['optimo', 'moderado', 'critico'] },
      puntuacion: Number,
      hallazgos: [String]
    }],
    creadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    creadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    },
    actualizadoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    actualizadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    },
    activo: { type: Boolean, default: true, index: true }
  },
  {
    timestamps: true
  }
);

// Índices compuestos para búsquedas frecuentes
HistoriaClinicaSchema.index({ pacienteId: 1, fechaRegistro: -1 });
HistoriaClinicaSchema.index({ medicoId: 1, fechaRegistro: -1 });
HistoriaClinicaSchema.index({ citaId: 1 }, { unique: true });
HistoriaClinicaSchema.index({ medicoId: 1, activo: 1, fechaRegistro: -1 });

export default mongoose.model<IHistoriaClinica>('HistoriaClinica', HistoriaClinicaSchema);

