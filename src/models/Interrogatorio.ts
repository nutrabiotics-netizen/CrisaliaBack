import mongoose, { Schema, Document } from 'mongoose';

export interface IInterrogatorio extends Document {
  pacienteId: mongoose.Types.ObjectId;
  tipo: 'primera_vez' | 'control';
  estado: 'en_proceso' | 'completado' | 'pendiente';
  progreso: number;
  respuestas: Record<string, any>;
  fase1?: import('../services/ai/fase1Flow').EstadoFase1;
  fase2?: import('../services/ai/fase2Flow').EstadoFase2;
  fase2Generacion?: number;
  fase2Reinicio?: { requestId: string; pendiente: boolean; generacion: number };
  fase2Operacion?: { token: string; requestId: string; venceEn: Date; preparandoExamenes?: boolean; contextoRDA?: string; reiniciando?: boolean };
  observacionesIA?: string[];
  analisisIA?: string;
  historiaClinica?: {
    motivoConsulta: { motivoPrincipal: string; tiempoEvolucion: string; sintomaConsulta: string };
    enfermedadActual: { inicio: string; formaAparicion: string; evolucion: string; sintomasAsociados: string; factoresDesencadenantes: string; factoresMejoranEmpeoran: string; tratamientosRealizados: string; medicamentosUtilizados: string; examenesPrevios: string; resultadosRelevantes: string; consultasAnteriores: string; estadoActual: string };
    antecedentes: { patologicos: string; farmacologicos: string; quirurgicos: string; alergicos: string; familiares: string; ginecologicos: string; toxicos: string };
  };
  alertaMedica?: {
    motivo: string;
    instruccion: string;
    mensajeUrgencias: string;
    banderasRojas: string[];
    registradoEn: Date;
  };
  analisisFisiologicoIA?: any[];
  objetivos?: string[];
  recomendacionAutomatica?: {
    semaforizacion: any[];
    recomendacionesOTC: string[];
    estiloVida: string[];
    estrategiasFuncionales: any[];
    llamadoAccion: string;
    generadoEn: Date;
  };
  perfilRadar?: {
    textoAnalisis: string;
    json: any;
    generadoEn: Date;
  };
  notasMedico?: string;
  notasHistorial?: Array<{ texto: string; creadoEn: Date }>;
  revisadoPorMedico?: mongoose.Types.ObjectId;
  revisadoEn?: Date;
  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InterrogatorioSchema = new Schema<IInterrogatorio>(
  {
    pacienteId: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true
    },
    tipo: {
      type: String,
      enum: ['primera_vez', 'control'],
      required: true,
      default: 'primera_vez'
    },
    estado: {
      type: String,
      enum: ['en_proceso', 'completado', 'pendiente'],
      default: 'pendiente'
    },
    progreso: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    respuestas: {
      type: Schema.Types.Mixed,
      default: {}
    },
    fase1: { type: Schema.Types.Mixed },
    fase2: { type: Schema.Types.Mixed },
    fase2Generacion: Number,
    fase2Reinicio: { type: Schema.Types.Mixed },
    fase2Operacion: { type: Schema.Types.Mixed },
    observacionesIA: {
      type: [String],
      default: []
    },
    analisisIA: {
      type: String
    },
    historiaClinica: {
      type: Schema.Types.Mixed
    },
    alertaMedica: {
      type: Schema.Types.Mixed
    },
    analisisFisiologicoIA: {
      type: Schema.Types.Mixed,
      default: []
    },
    objetivos: {
      type: [String],
      default: []
    },
    recomendacionAutomatica: {
      type: Schema.Types.Mixed
    },
    perfilRadar: {
      type: Schema.Types.Mixed
    },
    notasMedico: {
      type: String
    },
    notasHistorial: [
      {
        texto:    { type: String, required: true },
        creadoEn: { type: Date,   default: Date.now },
      }
    ],
    revisadoPorMedico: { type: Schema.Types.ObjectId, ref: 'Medico', default: null },
    revisadoEn:        { type: Date, default: null },
    creadoPor: {
      type: Schema.Types.ObjectId,
      refPath: 'creadoPorRol'
    },
    creadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    },
    actualizadoPor: {
      type: Schema.Types.ObjectId,
      refPath: 'actualizadoPorRol'
    },
    actualizadoPorRol: {
      type: String,
      enum: ['Paciente', 'Medico', 'Administrativo']
    }
  },
  {
    timestamps: true
  }
);

// Índice compuesto para búsquedas frecuentes
InterrogatorioSchema.index({ pacienteId: 1, tipo: 1 });
InterrogatorioSchema.index({ pacienteId: 1, estado: 1 });
// Las sesiones antiguas quedan fuera; dos pestañas no pueden crear dos fases 1 activas.
InterrogatorioSchema.index({ pacienteId: 1 }, { unique: true, name: 'fase1_activa_por_paciente',
  partialFilterExpression: { 'fase1.version': { $exists: true }, tipo: 'primera_vez', estado: 'en_proceso' } });

export default mongoose.model<IInterrogatorio>('Interrogatorio', InterrogatorioSchema);

