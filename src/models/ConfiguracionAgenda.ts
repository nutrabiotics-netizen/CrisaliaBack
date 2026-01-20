import mongoose, { Schema, Document } from 'mongoose';

export interface ITiempoInactividad {
  inicio: string;
  fin: string;
  tipo: string;
}

export interface IJornadaConfig {
  dia: 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';
  activa: boolean;
  bloquesHorarios: IBloqueHorario[];
}

export interface IBloqueHorario {
  horaInicio: string;
  horaFin: string;
  modalidad: 'presencial' | 'virtual' | 'mixta';
  duracionConsulta: number;
  tiemposInactividad: ITiempoInactividad[];
}

export interface ISedeAgenda {
  nombre: string;
  direccion: string;
  jornadas: IJornadaConfig[];
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
  optimizacionAutomatica: boolean;
  flexibilidadReubicacion: boolean;
  sedes: ISedeAgenda[];
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


const BloqueHorarioSchema = new Schema({
  horaInicio: { type: String, required: true },
  horaFin: { type: String, required: true },
  modalidad: {
    type: String,
    enum: ['presencial', 'virtual', 'mixta'],
    default: 'presencial'
  },
  duracionConsulta: {
    type: Number,
    min: 15,
    max: 120,
    required: true
  },
  tiemposInactividad: {
    type: [TiempoInactividadSchema],
    default: []
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
  bloquesHorarios: {
    type: [BloqueHorarioSchema],
    default: []
  }
}, { _id: false });


const SedeAgendaSchema = new Schema({
  nombre: { type: String, required: true, trim: true },
  direccion: { type: String, trim: true },
  jornadas: {
    type: [JornadaConfigSchema],
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
   
    optimizacionAutomatica: {
      type: Boolean,
      default: true
    },
    flexibilidadReubicacion: {
      type: Boolean,
      default: false
    },
    sedes: {
      type: [SedeAgendaSchema],
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

