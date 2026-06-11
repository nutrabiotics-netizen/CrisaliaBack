import mongoose, { Schema, Document } from 'mongoose';

/**
 * Historia Clínica de Heridas — modelo PARALELO al `HistoriaClinica` general.
 *
 * Cubre las 14 secciones del formato profesional de cuidado avanzado de heridas:
 *  1. Identificación
 *  2. Motivo de consulta
 *  3. Enfermedad actual
 *  4. Antecedentes
 *  5. Valoración del riesgo de cicatrización
 *  6. Examen físico general
 *  7. Valoración especializada de la herida
 *  8. Caracterización de la herida
 *  9. Clasificaciones especializadas (Wagner / PEDIS / PUSH / Braden / CEAP / Rutherford)
 * 10. Registro fotográfico
 * 11. Plan de manejo
 * 12. Educación al paciente
 * 13. Seguimiento evolutivo
 * 14. Escalas aplicadas
 *
 * Independiente de `HistoriaClinica`: no toca su esquema, su pipeline ni sus endpoints.
 */

export interface IHistoriaClinicaHeridas extends Document {
  pacienteId: mongoose.Types.ObjectId;
  medicoId: mongoose.Types.ObjectId;
  citaId: mongoose.Types.ObjectId;
  fechaRegistro: Date;

  // 1. Identificación (la mayoría se hereda del Paciente; se permite override para datos puntuales del día)
  identificacion?: {
    nombresApellidos?: string;
    documento?: string;
    edad?: number;
    sexo?: string;
    eps?: string;
    arl?: string;
    direccion?: string;
    telefono?: string;
    contactoEmergencia?: string;
    consentimientoFotografico?: boolean;
  };

  // 2. Motivo de consulta
  motivoConsulta?: string;

  // 3. Enfermedad actual
  enfermedadActual?: string;

  // 4. Antecedentes
  antecedentes?: {
    patologicos?: string[];
    quirurgicos?: string[];
    traumaticos?: string;
    alergicos?: string[];
    farmacologicos?: Array<{ medicamento: string; dosis?: string; frecuencia?: string }>;
    tabaquismo?: { actual?: boolean; exfumador?: boolean; paquetesAnio?: number };
    alcohol?: string;
    familiares?: string[];
  };

  // 5. Valoración del riesgo de cicatrización
  valoracionRiesgoCicatrizacion?: {
    estadoNutricional?: {
      pesoKg?: number;
      tallaCm?: number;
      imc?: number;
      perdidaRecientePeso?: boolean;
      albumina?: string;
      hemoglobina?: string;
    };
    riesgoCardiovascularAsociado?: string[];
    riesgoVascular?: {
      pulsos?: string;          // libre — texto descriptivo
      llenadoCapilarSeg?: string;
      ITBIzquierdo?: number;
      ITBDerecho?: number;
      interpretacion?: string;
    };
    controlMetabolico?: {
      HbA1c?: string;
      glicemiaAyunas?: string;
      interpretacion?: string;
    };
  };

  // 6. Examen físico general
  examenFisico?: {
    signosVitales?: {
      TA?: string;
      FC?: number;
      FR?: number;
      temperaturaC?: number;
      SpO2pct?: number;
      glicemiaCapilar?: number;
    };
    estadoGeneral?: string;
  };

  // 7. Valoración especializada de la herida
  valoracionEspecializada?: {
    diagnosticoHerida?: 'venosa' | 'arterial' | 'mixta' | 'pie_diabetico' | 'lesion_por_presion' | 'quirurgica' | 'traumatica' | 'quemadura' | 'oncologica' | 'otra';
    diagnosticoHeridaOtra?: string;
    localizacionAnatomica?: string;
    tiempoEvolucion?: string;
    numeroHeridas?: number;
  };

  // 8. Caracterización de la herida
  caracterizacionHerida?: {
    medidas?: {
      longitudCm?: number;
      anchuraCm?: number;
      profundidadCm?: number;
      socavamientoCm?: number;
      areaCm2?: number;
    };
    bordes?: string[];
    lecho?: {
      granulacionPct?: number;
      esfaceloPct?: number;
      necrosisPct?: number;
      epitelizacionPct?: number;
    };
    exudado?: { cantidad?: 'ausente' | 'escaso' | 'moderado' | 'abundante'; tipo?: 'seroso' | 'serosanguinolento' | 'purulento' | 'hematico'; color?: string };
    olor?: 'ausente' | 'leve' | 'moderado' | 'fetido';
    dolorEVA?: { curacion?: number; reposo?: number; nota?: string };
    infeccion?: { signos?: string[]; celulitis?: boolean; crepitacion?: boolean };
    pielPerilesional?: string[];
  };

  // 9. Clasificaciones especializadas
  clasificaciones?: {
    wagnerPieDiabetico?: 0 | 1 | 2 | 3 | 4 | 5;
    PEDIS?: { P?: number; E_cm2?: number; D?: number; I?: number; S?: string };
    PUSHBasal?: number;
    EVADolor?: number;
    ITBIzquierdo?: number;
    lesionPorPresion?: 'I' | 'II' | 'III' | 'IV' | 'no_clasificable' | 'lesion_profunda' | null;
    CEAPVenosa?: string | null;
    rutherfordArterial?: string | null;
  };

  // 10. Registro fotográfico
  registroFotografico?: {
    fotografiaInicial?: boolean;
    consentimiento?: boolean;
    codigoFotografia?: string;
    urls?: string[];
  };

  // 11. Plan de manejo
  planManejo?: {
    limpieza?: string[];
    desbridamiento?: string[];
    apositos?: { primario?: string; secundario?: string; frecuenciaCambio?: string };
    descargaPresion?: string;
    compresion?: string;
    antibiotico?: { indicado?: boolean; esquema?: string; cultivoSolicitado?: boolean; tecnica?: string };
    remisiones?: string[];
    paraclinicosSolicitados?: string[];
    controlSiguiente?: string;
  };

  // 12. Educación al paciente
  educacionPaciente?: string[];

  // 13. Seguimiento evolutivo
  seguimientoEvolutivo?: {
    proximoControl?: string;
    indicacionesSeguimiento?: string[];
    incapacidadDias?: number;
    documentosEnPortal?: string[];
  };

  // 14. Escalas aplicadas
  escalasAplicadas?: {
    wagner?: number;
    PEDIS?: string;
    PUSHBasal?: number;
    ITB?: number;
    EVA?: number;
    braden?: string;
    norton?: string;
    CEAP?: string;
    MNA?: string;
  };

  // Auditoría / estado
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: 'Medico' | 'Administrativo';
  actualizadoPor?: mongoose.Types.ObjectId;
  pdfUrl?: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HistoriaClinicaHeridasSchema = new Schema<IHistoriaClinicaHeridas>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    medicoId:   { type: Schema.Types.ObjectId, ref: 'Medico',   required: true },
    citaId:     { type: Schema.Types.ObjectId, ref: 'Cita',     required: true },
    fechaRegistro: { type: Date, default: Date.now },

    identificacion: {
      nombresApellidos: String,
      documento: String,
      edad: Number,
      sexo: String,
      eps: String,
      arl: String,
      direccion: String,
      telefono: String,
      contactoEmergencia: String,
      consentimientoFotografico: Boolean
    },

    motivoConsulta:  String,
    enfermedadActual: String,

    antecedentes: {
      patologicos:  [String],
      quirurgicos:  [String],
      traumaticos:  String,
      alergicos:    [String],
      farmacologicos: [{ medicamento: String, dosis: String, frecuencia: String }],
      tabaquismo:   { actual: Boolean, exfumador: Boolean, paquetesAnio: Number },
      alcohol:      String,
      familiares:   [String]
    },

    valoracionRiesgoCicatrizacion: {
      estadoNutricional: {
        pesoKg: Number, tallaCm: Number, imc: Number,
        perdidaRecientePeso: Boolean, albumina: String, hemoglobina: String
      },
      riesgoCardiovascularAsociado: [String],
      riesgoVascular: {
        pulsos: String, llenadoCapilarSeg: String,
        ITBIzquierdo: Number, ITBDerecho: Number, interpretacion: String
      },
      controlMetabolico: { HbA1c: String, glicemiaAyunas: String, interpretacion: String }
    },

    examenFisico: {
      signosVitales: { TA: String, FC: Number, FR: Number, temperaturaC: Number, SpO2pct: Number, glicemiaCapilar: Number },
      estadoGeneral: String
    },

    valoracionEspecializada: {
      diagnosticoHerida: { type: String, enum: ['venosa','arterial','mixta','pie_diabetico','lesion_por_presion','quirurgica','traumatica','quemadura','oncologica','otra'] },
      diagnosticoHeridaOtra: String,
      localizacionAnatomica: String,
      tiempoEvolucion: String,
      numeroHeridas: Number
    },

    caracterizacionHerida: {
      medidas: { longitudCm: Number, anchuraCm: Number, profundidadCm: Number, socavamientoCm: Number, areaCm2: Number },
      bordes: [String],
      lecho:  { granulacionPct: Number, esfaceloPct: Number, necrosisPct: Number, epitelizacionPct: Number },
      exudado: { cantidad: String, tipo: String, color: String },
      olor: String,
      dolorEVA: { curacion: Number, reposo: Number, nota: String },
      infeccion: { signos: [String], celulitis: Boolean, crepitacion: Boolean },
      pielPerilesional: [String]
    },

    clasificaciones: {
      wagnerPieDiabetico: Number,
      PEDIS: { P: Number, E_cm2: Number, D: Number, I: Number, S: String },
      PUSHBasal: Number,
      EVADolor: Number,
      ITBIzquierdo: Number,
      lesionPorPresion: String,
      CEAPVenosa: String,
      rutherfordArterial: String
    },

    registroFotografico: {
      fotografiaInicial: Boolean,
      consentimiento: Boolean,
      codigoFotografia: String,
      urls: [String]
    },

    planManejo: {
      limpieza: [String],
      desbridamiento: [String],
      apositos: { primario: String, secundario: String, frecuenciaCambio: String },
      descargaPresion: String,
      compresion: String,
      antibiotico: { indicado: Boolean, esquema: String, cultivoSolicitado: Boolean, tecnica: String },
      remisiones: [String],
      paraclinicosSolicitados: [String],
      controlSiguiente: String
    },

    educacionPaciente: [String],

    seguimientoEvolutivo: {
      proximoControl: String,
      indicacionesSeguimiento: [String],
      incapacidadDias: Number,
      documentosEnPortal: [String]
    },

    escalasAplicadas: {
      wagner: Number, PEDIS: String, PUSHBasal: Number, ITB: Number, EVA: Number,
      braden: String, norton: String, CEAP: String, MNA: String
    },

    creadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
    creadoPorRol: { type: String, enum: ['Medico', 'Administrativo'] },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
    pdfUrl: String,
    activo: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

HistoriaClinicaHeridasSchema.index({ citaId: 1 }, { unique: true });
HistoriaClinicaHeridasSchema.index({ pacienteId: 1, fechaRegistro: -1 });
HistoriaClinicaHeridasSchema.index({ medicoId: 1, fechaRegistro: -1 });

export default mongoose.model<IHistoriaClinicaHeridas>('HistoriaClinicaHeridas', HistoriaClinicaHeridasSchema);
