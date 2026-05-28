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
  
  // Motivo de Atención
  motivoConsulta?: string;
  motivoAtencion?: string;
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
    motivoConsulta: String,
    motivoAtencion: String,
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

