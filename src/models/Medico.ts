import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

// ─── Sub-interfaces ────────────────────────────────────────────────────────────

export interface IMedicoCopilotoVoz {
  habilitado?: boolean;
}

export interface IPreajustesMedico {
  /** Duración estándar de la primera consulta en minutos */
  duracionConsultaMin: number;
  /** Duración de la consulta de control en minutos */
  duracionControlMin: number;
  /** Intervalo entre citas en minutos */
  intervaloEntreConsultasMin: number;
  /** Idioma preferido para los documentos generados (legacy, string) */
  idioma: string;
  /** Idiomas de atención (array, ej. ['Español', 'Inglés']) */
  idiomas: string[];
  /** Firma digital hash (normativa MinTIC/MinSalud) */
  firmaDigitalHash?: string;
  /** URL de la imagen de firma para PDFs */
  firmaImagenUrl?: string;
  /** Plantilla de observaciones por defecto en fórmulas */
  plantillaObservaciones?: string;
  /** Colores del semáforo personalizados */
  semaforoColores?: {
    verde: string;
    amarillo: string;
    rojo: string;
  };
  /** Modalidades de atención disponibles (Presencial, Virtual, etc.) */
  modalidadesAtencion: string[];
  /** Dirección física del consultorio para atención presencial */
  direccionAtencionPresencial?: string;
  /** Horas mínimas de anticipación para agendar una cita */
  anticipacionMinimaHoras: number;
  /** Máximo de consultas por día */
  maximoConsultasDia: number;
  /** Tipos de pacientes que atiende (Adultos, Niños, etc.) */
  tiposPacientes: string[];
}

export interface IFacturacionMedico {
  tipoPersona?: string;
  nombreRazonSocial?: string;
  tipoIdentificacion?: string;
  numeroIdentificacion?: string;
  responsabilidadTributaria?: string;
  correoFacturacion?: string;
  direccion?: string;
  ciudad?: string;
  banco?: string;
  tipoCuenta?: string;
  numeroCuenta?: string;
  numeroIdentificacionCuenta?: string;
  responsabilidadTributariaCuenta?: string;
  titularCuenta?: string;
  identificacionTitular?: string;
}

export type TipoDocumentoMedico = 'identidad' | 'tarjeta_profesional' | 'rethus' | 'rut';
export type EstadoDocumentoMedico = 'pendiente' | 'en_verificacion' | 'verificado';

export interface IDocumentoMedico {
  _id?: mongoose.Types.ObjectId;
  tipo: TipoDocumentoMedico;
  nombre: string;
  s3Key: string;
  estado: EstadoDocumentoMedico;
  fechaCarga: Date;
  vencePronto?: boolean;
}

export interface IAliadoPermisos {
  compartirDatosAdmin?: boolean;
  compartirDocumentos?: boolean;
}

export interface IMedicoAliados {
  alivia?: {
    activo: boolean;
    userId?: string;
    token?: string;
    permisos?: IAliadoPermisos;
  };
  nutrapp?: {
    activo: boolean;
    userId?: string;
    permisos?: IAliadoPermisos;
  };
  amf?: {
    activo: boolean;
    membresiaId?: string;
    permisos?: IAliadoPermisos;
  };
}

export interface IMedicoPlanPrueba {
  activo: boolean;
  pacientesUsados: number;
  limite: number;
  iniciadoEn?: Date;
  expiraEn?: Date;
}

// ─── Interfaz principal ────────────────────────────────────────────────────────

export interface IMedico extends Document {
  email: string;
  password: string;
  role: UserRole.MEDICO;
  nombre: string;
  apellido: string;
  especialidad?: string;
  numeroColegiatura?: string;
  telefono?: string;
  whatsapp?: string;
  activo: boolean;
  /** Suscripción activa (true = acceso completo, false = solo trial o bloqueado) */
  suscripcionActiva: boolean;
  /** Plan de prueba gratuita: 3 pacientes tope */
  planPrueba: IMedicoPlanPrueba;
  /** URL del logo del médico (S3) para documentos/PDFs */
  logoUrl?: string;
  /** URL de la imagen de firma del médico para documentos/PDFs */
  firmaUrl?: string;
  /** Indicaciones y recomendaciones que el paciente debe ver antes de la consulta */
  indicacionesAntesConsulta?: string;
  /** Datos de verificación y filtros de búsqueda (grupos de interés, modalidades, etc.) */
  perfilVerificacion?: Record<string, unknown>;
  /** Configuración del copiloto de voz STT/TTS */
  copilotoVoz?: IMedicoCopilotoVoz;
  /** Preajustes clínicos del médico (subdocumento formal) */
  preajustes: IPreajustesMedico;
  /** Consentimientos aceptados: slug → fecha ISO */
  consentimientos?: Record<string, string>;
  /** Información de facturación y cuenta bancaria */
  facturacion?: IFacturacionMedico;
  /** Documentos profesionales del médico */
  documentos: IDocumentoMedico[];
  /** Vínculos con plataformas aliadas */
  aliados: IMedicoAliados;
  /** Integración Google Calendar */
  googleCalendar?: {
    accessToken?: string;
    refreshToken?: string;
    expiryDate?: Date;
    conectado: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// ─── Sub-schemas ───────────────────────────────────────────────────────────────

const CopilotoVozSchema = new Schema<IMedicoCopilotoVoz>(
  { habilitado: { type: Boolean, default: true } },
  { _id: false }
);

const PreajustesMedicoSchema = new Schema<IPreajustesMedico>(
  {
    duracionConsultaMin:        { type: Number, default: 60, min: 5, max: 180 },
    duracionControlMin:         { type: Number, default: 30, min: 5, max: 180 },
    intervaloEntreConsultasMin: { type: Number, default: 10, min: 0, max: 60 },
    idioma:                     { type: String, default: 'es-CO', trim: true },
    idiomas:                    { type: [String], default: ['Español'] },
    firmaDigitalHash:           { type: String, trim: true, select: false },
    firmaImagenUrl:             { type: String, trim: true },
    plantillaObservaciones:     { type: String, trim: true },
    semaforoColores: {
      verde:    { type: String, default: '#22c55e' },
      amarillo: { type: String, default: '#eab308' },
      rojo:     { type: String, default: '#ef4444' },
    },
    modalidadesAtencion:         { type: [String], default: [] },
    direccionAtencionPresencial: { type: String, trim: true },
    anticipacionMinimaHoras:     { type: Number, default: 24, min: 0 },
    maximoConsultasDia:          { type: Number, default: 8, min: 1 },
    tiposPacientes:              { type: [String], default: ['Adultos'] },
  },
  { _id: false }
);

const AliadoPermisosSchema = new Schema(
  { compartirDatosAdmin: { type: Boolean, default: true }, compartirDocumentos: { type: Boolean, default: true } },
  { _id: false }
);

const AliviaSchema = new Schema(
  { activo: { type: Boolean, default: false }, userId: String, token: { type: String, select: false }, permisos: { type: AliadoPermisosSchema, default: () => ({}) } },
  { _id: false }
);
const NutrappSchema = new Schema(
  { activo: { type: Boolean, default: false }, userId: String, permisos: { type: AliadoPermisosSchema, default: () => ({}) } },
  { _id: false }
);
const AMFSchema = new Schema(
  { activo: { type: Boolean, default: false }, membresiaId: String, permisos: { type: AliadoPermisosSchema, default: () => ({}) } },
  { _id: false }
);

const FacturacionMedicoSchema = new Schema<IFacturacionMedico>(
  {
    tipoPersona:                     { type: String, trim: true },
    nombreRazonSocial:               { type: String, trim: true },
    tipoIdentificacion:              { type: String, trim: true },
    numeroIdentificacion:            { type: String, trim: true },
    responsabilidadTributaria:       { type: String, trim: true },
    correoFacturacion:               { type: String, trim: true, lowercase: true },
    direccion:                       { type: String, trim: true },
    ciudad:                          { type: String, trim: true },
    banco:                           { type: String, trim: true },
    tipoCuenta:                      { type: String, trim: true },
    numeroCuenta:                    { type: String, trim: true },
    numeroIdentificacionCuenta:      { type: String, trim: true },
    responsabilidadTributariaCuenta: { type: String, trim: true },
    titularCuenta:                   { type: String, trim: true },
    identificacionTitular:           { type: String, trim: true },
  },
  { _id: false }
);

const DocumentoMedicoSchema = new Schema<IDocumentoMedico>(
  {
    tipo:        { type: String, enum: ['identidad', 'tarjeta_profesional', 'rethus', 'rut'], required: true },
    nombre:      { type: String, trim: true, required: true },
    s3Key:       { type: String, trim: true, required: true },
    estado:      { type: String, enum: ['pendiente', 'en_verificacion', 'verificado'], default: 'pendiente' },
    fechaCarga:  { type: Date, default: Date.now },
    vencePronto: { type: Boolean, default: false },
  },
  { timestamps: false }
);

const AliadosSchema = new Schema<IMedicoAliados>(
  {
    alivia:  { type: AliviaSchema,  default: () => ({ activo: false }) },
    nutrapp: { type: NutrappSchema, default: () => ({ activo: false }) },
    amf:     { type: AMFSchema,     default: () => ({ activo: false }) },
  },
  { _id: false }
);

const PlanPruebaSchema = new Schema<IMedicoPlanPrueba>(
  {
    activo:         { type: Boolean, default: true },
    pacientesUsados:{ type: Number, default: 0, min: 0 },
    limite:         { type: Number, default: 3 },
    iniciadoEn:     { type: Date },
    expiraEn:       { type: Date },
  },
  { _id: false }
);

// ─── Schema principal ─────────────────────────────────────────────────────────

const MedicoSchema = new Schema<IMedico>(
  {
    email: {
      type: String,
      required: [true, 'El email es requerido'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Por favor ingresa un email válido']
    },
    password: {
      type: String,
      required: [true, 'La contraseña es requerida'],
      minlength: [6, 'La contraseña debe tener al menos 6 caracteres'],
      select: false
    },
    role: {
      type: String,
      enum: [UserRole.MEDICO],
      default: UserRole.MEDICO
    },
    nombre:           { type: String, required: [true, 'El nombre es requerido'], trim: true },
    apellido:         { type: String, required: [true, 'El apellido es requerido'], trim: true },
    especialidad:     { type: String, trim: true },
    numeroColegiatura:{ type: String, unique: true, sparse: true, trim: true },
    telefono:         { type: String, trim: true },
    whatsapp:         { type: String, trim: true },
    activo:           { type: Boolean, default: true },
    suscripcionActiva:{ type: Boolean, default: false },
    planPrueba:       { type: PlanPruebaSchema, default: () => ({ activo: true, pacientesUsados: 0, limite: 3 }) },
    logoUrl:          { type: String, trim: true },
    firmaUrl:         { type: String, trim: true },
    indicacionesAntesConsulta: { type: String, trim: true, default: '' },
    perfilVerificacion: { type: Schema.Types.Mixed, default: {} },
    copilotoVoz:      { type: CopilotoVozSchema, default: () => ({}) },
    preajustes:       { type: PreajustesMedicoSchema, default: () => ({}) },
    facturacion:      { type: FacturacionMedicoSchema, default: () => ({}) },
    consentimientos:  { type: Schema.Types.Mixed, default: {} },
    documentos:       { type: [DocumentoMedicoSchema], default: [] },
    aliados:          { type: AliadosSchema, default: () => ({}) },
    googleCalendar: {
      type: new Schema({
        accessToken:  { type: String },
        refreshToken: { type: String },
        expiryDate:   { type: Date },
        conectado:    { type: Boolean, default: false }
      }, { _id: false }),
      default: undefined
    }
  },
  { timestamps: true }
);

// ─── Hooks ────────────────────────────────────────────────────────────────────

MedicoSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ─── Métodos ─────────────────────────────────────────────────────────────────

MedicoSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Índices ─────────────────────────────────────────────────────────────────

MedicoSchema.index({ suscripcionActiva: 1, activo: 1 });

export default mongoose.model<IMedico>('Medico', MedicoSchema);
