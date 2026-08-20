import mongoose, { Schema, Document } from 'mongoose';

// ─── Canales disponibles por categoría ────────────────────────────────────────

export interface ICanalesCategoria {
  interna: boolean;
  correo: boolean;
  whatsapp: boolean;
  push: boolean;
}

// ─── Categorías de notificación ───────────────────────────────────────────────

export type CategoriaNotificacion =
  | 'citas_agenda'
  | 'preconsultas_anamnesis'
  | 'pacientes_casos'
  | 'sugerencias_ia'
  | 'prescripciones_et'
  | 'laboratorios_resultados'
  | 'seguimiento_clinico'
  | 'privacidad_seguridad'
  | 'facturacion';

export interface IConfiguracionCategoria {
  categoria: CategoriaNotificacion;
  activa: boolean;
  canales: ICanalesCategoria;
}

// ─── Horario tranquilo ────────────────────────────────────────────────────────

export interface IHorarioTranquilo {
  activo: boolean;
  desde: string;  // HH:MM
  hasta: string;  // HH:MM
  dias: 'lunes_viernes' | 'todos' | 'fines_semana';
}

// ─── Interfaz principal ───────────────────────────────────────────────────────

export interface IConfiguracionNotificacionesMedico extends Document {
  medicoId: mongoose.Types.ObjectId;
  /** Hora del resumen clínico diario */
  frecuenciaResumen: 'antes_jornada' | 'mediodia' | 'fin_jornada';
  /** Permite posponer avisos operativos */
  recordarMasTarde: boolean;
  /** Frecuencia de sugerencias IA por validar */
  sugerenciasIA: 'normal' | 'alta_prioridad' | 'desactivado';
  /** Horario tranquilo — solo avisos indispensables */
  horarioTranquilo: IHorarioTranquilo;
  /** Configuración por categoría de evento */
  categorias: IConfiguracionCategoria[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const CanalesCategoriaSchema = new Schema<ICanalesCategoria>(
  {
    interna:   { type: Boolean, default: true },
    correo:    { type: Boolean, default: true },
    whatsapp:  { type: Boolean, default: true },
    push:      { type: Boolean, default: false },
  },
  { _id: false }
);

const ConfiguracionCategoriaSchema = new Schema<IConfiguracionCategoria>(
  {
    categoria: {
      type: String,
      enum: [
        'citas_agenda', 'preconsultas_anamnesis', 'pacientes_casos',
        'sugerencias_ia', 'prescripciones_et', 'laboratorios_resultados',
        'seguimiento_clinico', 'privacidad_seguridad', 'facturacion',
      ],
      required: true,
    },
    activa:   { type: Boolean, default: true },
    canales:  { type: CanalesCategoriaSchema, default: () => ({}) },
  },
  { _id: false }
);

const HorarioTranquiloSchema = new Schema<IHorarioTranquilo>(
  {
    activo: { type: Boolean, default: true },
    desde:  { type: String, default: '20:00' },
    hasta:  { type: String, default: '06:30' },
    dias:   { type: String, enum: ['lunes_viernes', 'todos', 'fines_semana'], default: 'lunes_viernes' },
  },
  { _id: false }
);

// ─── Defaults de categorías ───────────────────────────────────────────────────

function defaultCategorias(): IConfiguracionCategoria[] {
  return [
    { categoria: 'citas_agenda',            activa: true,  canales: { interna: true,  correo: true,  whatsapp: true,  push: true  } },
    { categoria: 'preconsultas_anamnesis',  activa: true,  canales: { interna: true,  correo: true,  whatsapp: false, push: true  } },
    { categoria: 'pacientes_casos',         activa: true,  canales: { interna: true,  correo: false, whatsapp: false, push: true  } },
    { categoria: 'sugerencias_ia',          activa: true,  canales: { interna: true,  correo: false, whatsapp: false, push: true  } },
    { categoria: 'prescripciones_et',       activa: true,  canales: { interna: true,  correo: true,  whatsapp: false, push: false } },
    { categoria: 'laboratorios_resultados', activa: true,  canales: { interna: true,  correo: true,  whatsapp: false, push: false } },
    { categoria: 'seguimiento_clinico',     activa: true,  canales: { interna: true,  correo: false, whatsapp: false, push: true  } },
    { categoria: 'privacidad_seguridad',    activa: true,  canales: { interna: true,  correo: true,  whatsapp: true,  push: true  } },
    { categoria: 'facturacion',             activa: true,  canales: { interna: true,  correo: true,  whatsapp: false, push: false } },
  ];
}

// ─── Schema principal ─────────────────────────────────────────────────────────

const ConfiguracionNotificacionesMedicoSchema = new Schema<IConfiguracionNotificacionesMedico>(
  {
    medicoId:          { type: Schema.Types.ObjectId, ref: 'Medico', required: true, unique: true },
    frecuenciaResumen: { type: String, enum: ['antes_jornada', 'mediodia', 'fin_jornada'], default: 'antes_jornada' },
    recordarMasTarde:  { type: Boolean, default: true },
    sugerenciasIA:     { type: String, enum: ['normal', 'alta_prioridad', 'desactivado'], default: 'normal' },
    horarioTranquilo:  { type: HorarioTranquiloSchema, default: () => ({}) },
    categorias:        { type: [ConfiguracionCategoriaSchema], default: defaultCategorias },
  },
  { timestamps: true }
);

export default mongoose.model<IConfiguracionNotificacionesMedico>(
  'ConfiguracionNotificacionesMedico',
  ConfiguracionNotificacionesMedicoSchema
);