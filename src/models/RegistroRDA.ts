import mongoose, { Schema, Document } from 'mongoose';

// Sección 1 — Creación de cuenta
interface SeccionCuenta {
  primerNombre?: string;
  segundoNombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  telefono?: string;
  correoElectronico?: string;
  tipoDocumentoCodigo?: string;
  numeroDocumento?: string;
  sexoBiologico?: '01' | '02' | '03';
  fechaNacimiento?: Date;
}

// Sección 2 — Interrogatorio inicial
interface AntecedenteFamiliar {
  codigoCIE10?: string;
  nombreCIE10?: string;
  parentesco?: string;
  parentescoNombre?: string;
}

export interface SeccionInterrogatorioInicial {
  identidadGenero?: '01' | '02' | '03' | '04' | '05';
  ocupacionCodigo?: string | null;
  ocupacionNombre?: string;
  indicadorAlergia?: boolean;
  antecedentesAlergias?: { tipo: string; nombreAlergeno: string }[];
  antecedentesFamiliares?: AntecedenteFamiliar[];
  estadoAntecedentesFamiliares?: 'registradas' | 'no_conoce';
  estadoAntecedentesFarmacologicos?: 'toma' | 'no_toma';
  antecedentesFarmacologicos?: { codigoCUMS: string | null; nombre?: string; origen?: 'catalogo' | 'declarado' }[];
}

// Sección 3 — Datos de facturación
interface SeccionFacturacion {
  paisResidenciaCodigo?: string;
  municipioResidenciaCodigo?: string;
  etniaCodigo?: string;
  comunidadEtnica?: string;
  zonaResidencia?: 'U' | 'R';
  aseguradoraCodigo?: string;
  aseguradoraNombre?: string;
  paisNacimientoCodigo?: string;
  paisNacimientoNombre?: string;
  paisNacionalidadCodigo?: string;
  paisNacionalidadNombre?: string;
}

// Sección 4 — Interrogatorio principal
interface SeccionInterrogatorioPrincipal {
  oposicionOrganos?: { fecha?: string; interrogatorioId: mongoose.Types.ObjectId;
    respuesta?: 'si_escrita' | 'no_escrita' | 'sin_certeza' | 'prefiero_no_responder'; oposicion?: boolean | null }[];
  // Compatibilidad con registros previos; las nuevas respuestas se guardan en el array.
  oposicionDonarOrganos?: boolean | null;
  respuestaOposicionOrganos?: 'si_escrita' | 'no_escrita' | 'sin_certeza' | 'prefiero_no_responder';
  fechaRespuestaOposicionOrganos?: string;
  interrogatorioOposicionOrganosId?: mongoose.Types.ObjectId;
  fechaOposicionOrganos?: Date;
  discapacidades?: { codigo: string; nombre?: string; descripcion?: string }[];
  interrogatorioDiscapacidadId?: mongoose.Types.ObjectId;
  factoresRiesgo?: { codigo?: string; tipo: string; nombre: string }[];
  estadoFactoresRiesgo?: 'registrados' | 'sin_certeza';
  interrogatorioFactoresRiesgoId?: mongoose.Types.ObjectId;
}

// Sección 5 — Flujo de consulta
interface DiagnosticoRDA {
  principalCodigo?: string;
  principalNombre?: string;
  principalTipo?: '01' | '02' | '03';
  relacionadoCodigo?: string;
  relacionadoNombre?: string;
  relacionadoTipo?: '01' | '02' | '03';
  condicionEgreso?: string;
  codigoPrestadorRemision?: string;
}

interface MedicamentoRDA {
  tipoTecnologia?: string;
  codigo?: string;
  nombre?: string;
  dci?: string;
  fechaPrescripcion?: Date;
  dosis?: number;
  unidadMedidaCodigo?: string;
  viaAdministracionCodigo?: string;
  duracionCantidad?: number;
  duracionUnidadCodigo?: string;
  frecuenciaCantidad?: number;
  frecuenciaUnidadCodigo?: string;
  finalidadCodigo?: string;
}

interface ProcedimientoRDA {
  codigo?: string;
  nombre?: string;
  finalidadCodigo?: string;
  fechaPrescripcion?: Date;
}

interface OtraTecnologiaRDA {
  tipoTecnologia?: string;
  codigo?: string;
  nombre?: string;
  fechaPrescripcion?: Date;
  finalidadCodigo?: string;
}

interface SeccionConsulta {
  fechaHoraInicioAtencion?: Date;
  fechaHoraFinAtencion?: Date;
  modalidadAtencion?: string;
  grupoServicio?: string;
  entornoConsulta?: string;
  viaIngresoCodigo?: string;
  causaExternaCodigo?: string;
  diagnosticos?: DiagnosticoRDA[];
  medicamentos?: MedicamentoRDA[];
  procedimientos?: ProcedimientoRDA[];
  otrasTecnologias?: OtraTecnologiaRDA[];
  incapacidadAlcance?: '01' | '02';
  incapacidadDias?: number;
  diasLicenciaMaternidad?: number;
  profesionalTipoDocumento?: string;
  profesionalNumeroDocumento?: string;
  profesionalNombre?: string;
  profesionalRegistroMedico?: string;
  codigoPrestador?: string;
  adjuntoPdfUrl?: string;
}

export interface IRegistroRDA extends Document {
  pacienteId: mongoose.Types.ObjectId;
  tipoRegistro: 'inicial' | 'consulta';
  generacionPruebasFase2?: number;
  medicoId?: mongoose.Types.ObjectId;
  citaId?: mongoose.Types.ObjectId;
  registroInicialId?: mongoose.Types.ObjectId;

  seccionCuenta: SeccionCuenta;
  seccionInterrogatorioInicial: SeccionInterrogatorioInicial;
  seccionFacturacion: SeccionFacturacion;
  seccionInterrogatorioPrincipal: SeccionInterrogatorioPrincipal;
  seccionConsulta: SeccionConsulta;
  fuenteFase1?: { interrogatorioId: mongoose.Types.ObjectId; version: number; incorporadoEn: Date };

  estado: 'borrador' | 'listo' | 'transmitido';
  activo?: boolean;

  creadoPor?: mongoose.Types.ObjectId;
  creadoPorRol?: string;
  actualizadoPor?: mongoose.Types.ObjectId;
  actualizadoPorRol?: string;

  createdAt: Date;
  updatedAt: Date;
}

const RegistroRDASchema = new Schema<IRegistroRDA>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    tipoRegistro: { type: String, enum: ['inicial', 'consulta'], default: 'consulta' },
    generacionPruebasFase2: Number,
    medicoId: { type: Schema.Types.ObjectId, ref: 'Medico', required: function () { return this.tipoRegistro !== 'inicial'; } },
    citaId: { type: Schema.Types.ObjectId, ref: 'Cita', required: function () { return this.tipoRegistro !== 'inicial'; } },
    registroInicialId: { type: Schema.Types.ObjectId, ref: 'RegistroRDA' },

    seccionCuenta: {
      primerNombre: String,
      segundoNombre: String,
      primerApellido: String,
      segundoApellido: String,
      telefono: String,
      correoElectronico: String,
      tipoDocumentoCodigo: String,
      numeroDocumento: String,
      sexoBiologico: { type: String, enum: ['01', '02', '03'] },
      fechaNacimiento: Date,
    },

    seccionInterrogatorioInicial: {
      identidadGenero: { type: String, enum: ['01', '02', '03', '04', '05'] },
      ocupacionCodigo: String,
      ocupacionNombre: String,
      indicadorAlergia: Boolean,
      antecedentesAlergias: [{ tipo: String, nombreAlergeno: String }],
      estadoAntecedentesFamiliares: { type: String, enum: ['registradas', 'no_conoce'] },
      antecedentesFamiliares: [{ codigoCIE10: String, nombreCIE10: String, parentesco: String, parentescoNombre: String }],
      estadoAntecedentesFarmacologicos: { type: String, enum: ['toma', 'no_toma'] },
      antecedentesFarmacologicos: [{ codigoCUMS: String, nombre: String, origen: { type: String, enum: ['catalogo', 'declarado'] } }],
    },

    fuenteFase1: {
      type: new Schema({
        interrogatorioId: { type: Schema.Types.ObjectId, ref: 'Interrogatorio', required: true },
        version: { type: Number, required: true },
        incorporadoEn: { type: Date, required: true },
      }, { _id: false }),
      default: undefined,
    },

    seccionFacturacion: {
      paisResidenciaCodigo: String,
      municipioResidenciaCodigo: String,
      etniaCodigo: String,
      comunidadEtnica: String,
      zonaResidencia: { type: String, enum: ['U', 'R'] },
      aseguradoraCodigo: String,
      aseguradoraNombre: String,
      paisNacimientoCodigo: String,
      paisNacimientoNombre: String,
      paisNacionalidadCodigo: String,
      paisNacionalidadNombre: String,
    },

    seccionInterrogatorioPrincipal: {
      oposicionOrganos: { type: [new Schema({
        fecha: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        interrogatorioId: { type: Schema.Types.ObjectId, ref: 'Interrogatorio', required: true },
        respuesta: { type: String, enum: ['si_escrita', 'no_escrita', 'sin_certeza', 'prefiero_no_responder'] },
        oposicion: Boolean,
      }, { _id: false })], default: undefined },
      oposicionDonarOrganos: Boolean,
      respuestaOposicionOrganos: { type: String, enum: ['si_escrita', 'no_escrita', 'sin_certeza', 'prefiero_no_responder'] },
      fechaRespuestaOposicionOrganos: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
      interrogatorioOposicionOrganosId: { type: Schema.Types.ObjectId, ref: 'Interrogatorio' },
      fechaOposicionOrganos: Date,
      discapacidades: [{ codigo: String, nombre: String, descripcion: String }],
      interrogatorioDiscapacidadId: { type: Schema.Types.ObjectId, ref: 'Interrogatorio' },
      factoresRiesgo: [{ codigo: String, tipo: String, nombre: String }],
      estadoFactoresRiesgo: { type: String, enum: ['registrados', 'sin_certeza'] },
      interrogatorioFactoresRiesgoId: { type: Schema.Types.ObjectId, ref: 'Interrogatorio' },
    },

    seccionConsulta: {
      fechaHoraInicioAtencion: Date,
      fechaHoraFinAtencion: Date,
      modalidadAtencion: String,
      grupoServicio: String,
      entornoConsulta: String,
      viaIngresoCodigo: String,
      causaExternaCodigo: String,
      diagnosticos: [{
        principalCodigo: String,
        principalNombre: String,
        principalTipo: { type: String, enum: ['01', '02', '03'] },
        relacionadoCodigo: String,
        relacionadoNombre: String,
        relacionadoTipo: { type: String, enum: ['01', '02', '03'] },
        condicionEgreso: String,
        codigoPrestadorRemision: String,
      }],
      medicamentos: [{
        tipoTecnologia: String,
        codigo: String,
        nombre: String,
        dci: String,
        fechaPrescripcion: Date,
        dosis: Number,
        unidadMedidaCodigo: String,
        viaAdministracionCodigo: String,
        duracionCantidad: Number,
        duracionUnidadCodigo: String,
        frecuenciaCantidad: Number,
        frecuenciaUnidadCodigo: String,
        finalidadCodigo: String,
      }],
      procedimientos: [{
        codigo: String,
        nombre: String,
        finalidadCodigo: String,
        fechaPrescripcion: Date,
      }],
      otrasTecnologias: [{
        tipoTecnologia: String,
        codigo: String,
        nombre: String,
        fechaPrescripcion: Date,
        finalidadCodigo: String,
      }],
      incapacidadAlcance: { type: String, enum: ['01', '02'] },
      incapacidadDias: Number,
      diasLicenciaMaternidad: Number,
      profesionalTipoDocumento: String,
      profesionalNumeroDocumento: String,
      profesionalNombre: String,
      profesionalRegistroMedico: String,
      codigoPrestador: String,
      adjuntoPdfUrl: String,
    },

    estado: {
      type: String,
      enum: ['borrador', 'listo', 'transmitido'],
      default: 'borrador',
    },
    activo: { type: Boolean, default: true },

    creadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
    creadoPorRol: { type: String, enum: ['Paciente', 'Medico', 'Administrativo'] },
    actualizadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
    actualizadoPorRol: { type: String, enum: ['Paciente', 'Medico', 'Administrativo'] },
  },
  { timestamps: true }
);

RegistroRDASchema.index({ pacienteId: 1, createdAt: -1 });
RegistroRDASchema.index({ medicoId: 1, createdAt: -1 });
// Los borradores previos a la cita no tienen citaId. El índice antiguo citaId_1 debe migrarse una vez.
RegistroRDASchema.index({ citaId: 1 }, { unique: true, name: 'rda_cita_unica', partialFilterExpression: { citaId: { $type: 'objectId' } } });
RegistroRDASchema.index({ 'fuenteFase1.interrogatorioId': 1 }, { unique: true, name: 'rda_inicial_por_interrogatorio',
  partialFilterExpression: { tipoRegistro: 'inicial', 'fuenteFase1.interrogatorioId': { $type: 'objectId' } } });
RegistroRDASchema.index({ estado: 1 });

export default mongoose.model<IRegistroRDA>('RegistroRDA', RegistroRDASchema);
