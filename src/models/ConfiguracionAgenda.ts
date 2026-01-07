import mongoose, { Schema, Document } from 'mongoose';

export interface ITiempoInactividad {
  inicio: string;
  fin: string;
  tipo: string;
}

export interface IJornadaConfig {
  dia: string;
  activa: boolean;
  horaInicio: string;
  horaFin: string;
  modalidad: 'presencial' | 'virtual' | 'mixta';
  duracionConsulta: number; // en minutos
  tiemposInactividad: ITiempoInactividad[];
}

export interface INotificacionesAgendamiento {
  notificacionAutomaticaPaciente: boolean;
  recordatorio24Horas: boolean;
  recordatorio2Horas: boolean;
  notificacionMedicoPreconsulta: boolean;
  notificacionMedicoConsulta: boolean;
  notificacionMedicoControl: boolean;
}

export interface IConfiguracionAgenda extends Document {
  medico: mongoose.Types.ObjectId;
  direccionConsultorio: string;
  optimizacionAutomatica: boolean;
  flexibilidadReubicacion: boolean;
  jornadas: IJornadaConfig[];
  notificacionesAgendamiento: INotificacionesAgendamiento;
  createdAt: Date;
  updatedAt: Date;
}

const TiempoInactividadSchema = new Schema<ITiempoInactividad>({
  inicio: {
    type: String,
    required: true
  },
  fin: {
    type: String,
    required: true
  },
  tipo: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const JornadaConfigSchema = new Schema<IJornadaConfig>({
  dia: {
    type: String,
    required: true,
    enum: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  },
  activa: {
    type: Boolean,
    default: true
  },
  horaInicio: {
    type: String,
    required: true
  },
  horaFin: {
    type: String,
    required: true
  },
  modalidad: {
    type: String,
    enum: ['presencial', 'virtual', 'mixta'],
    default: 'presencial'
  },
  duracionConsulta: {
    type: Number,
    required: true,
    min: 15,
    max: 120
  },
  tiemposInactividad: {
    type: [TiempoInactividadSchema],
    default: []
  }
}, { _id: false });

const ConfiguracionAgendaSchema = new Schema<IConfiguracionAgenda>(
  {
    medico: {
      type: Schema.Types.ObjectId,
      ref: 'Medico',
      required: true,
      unique: true
    },
    direccionConsultorio: {
      type: String,
      trim: true,
      default: ''
    },
    optimizacionAutomatica: {
      type: Boolean,
      default: true
    },
    flexibilidadReubicacion: {
      type: Boolean,
      default: false
    },
    jornadas: {
      type: [JornadaConfigSchema],
      default: []
    },
    notificacionesAgendamiento: {
      notificacionAutomaticaPaciente: {
        type: Boolean,
        default: true
      },
      recordatorio24Horas: {
        type: Boolean,
        default: true
      },
      recordatorio2Horas: {
        type: Boolean,
        default: true
      },
      notificacionMedicoPreconsulta: {
        type: Boolean,
        default: true
      },
      notificacionMedicoConsulta: {
        type: Boolean,
        default: true
      },
      notificacionMedicoControl: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true
  }
);

// Índice único para médico
ConfiguracionAgendaSchema.index({ medico: 1 }, { unique: true });

export default mongoose.model<IConfiguracionAgenda>('ConfiguracionAgenda', ConfiguracionAgendaSchema);

