import mongoose, { Schema, Document } from 'mongoose';

export interface IAlimentoMensaje {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  creadoEn: Date;
}

export interface IAlimentoPerfilSnapshot {
  nombre?: string;
  apellido?: string;
  fechaNacimiento?: Date;
  sexoBiologico?: string;
  eps?: string;
  zonasDolor?: string[];
  edadAnios?: number;
}

export interface IAlimentoDetectado {
  nombre: string;
  categoria: string;
  porcion: string;
}

export interface IAjusteRecomendado {
  tipo: string;
  texto: string;
}

export interface INutrienteRecomendado {
  titulo: string;
  desc: string;
}

export interface IReportePlato {
  alineacion: string;
  alineacionDetalle: string;
  confianza: string;
  etDescripcion?: string;
  etDietaEliminacion?: string;
  etAlimentacionTerapeutica?: string;
  alertasEliminacion: { texto: string }[];
  puntosPositivos: string[];
  ajustes: IAjusteRecomendado[];
  nutrientes: INutrienteRecomendado[];
  sugerenciaPractica?: string;
  preguntaET?: string;
  respuestaET?: string;
}

export interface IEvaluacionAlimento extends Document {
  pacienteId: mongoose.Types.ObjectId;
  s3Key: string;
  urlArchivo?: string;
  // Flujo chat (legado)
  mensajes: IAlimentoMensaje[];
  // Flujo scan móvil
  alimentosConfirmados?: IAlimentoDetectado[];
  nota?: string;
  reporte?: IReportePlato;
  fuente?: 'chat' | 'scan_movil';
  perfilSnapshot?: IAlimentoPerfilSnapshot;
  modeloIA?: string;
  simulado?: boolean;
  errorAnalisis?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MensajeSchema = new Schema<IAlimentoMensaje>(
  {
    id:       { type: String, required: true },
    rol:      { type: String, enum: ['usuario', 'asistente'], required: true },
    texto:    { type: String, required: true },
    creadoEn: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PerfilSnapshotSchema = new Schema<IAlimentoPerfilSnapshot>(
  {
    nombre:          String,
    apellido:        String,
    fechaNacimiento: Date,
    sexoBiologico:   String,
    eps:             String,
    zonasDolor:      [String],
    edadAnios:       Number,
  },
  { _id: false }
);

const AlimentoDetectadoSchema = new Schema<IAlimentoDetectado>(
  { nombre: String, categoria: String, porcion: String },
  { _id: false }
);

const AjusteSchema = new Schema<IAjusteRecomendado>(
  { tipo: String, texto: String },
  { _id: false }
);

const NutrienteSchema = new Schema<INutrienteRecomendado>(
  { titulo: String, desc: String },
  { _id: false }
);

const ReportePlatoSchema = new Schema<IReportePlato>(
  {
    alineacion:                String,
    alineacionDetalle:         String,
    confianza:                 String,
    etDescripcion:             String,
    etDietaEliminacion:        String,
    etAlimentacionTerapeutica: String,
    alertasEliminacion:        [{ texto: String, _id: false }],
    puntosPositivos:           [String],
    ajustes:                   [AjusteSchema],
    nutrientes:                [NutrienteSchema],
    sugerenciaPractica:        String,
    preguntaET:                String,
    respuestaET:               String,
  },
  { _id: false }
);

const EvaluacionAlimentoSchema = new Schema<IEvaluacionAlimento>(
  {
    pacienteId:           { type: Schema.Types.ObjectId, ref: 'Paciente', required: true },
    s3Key:                { type: String, required: true },
    urlArchivo:           String,
    mensajes:             [MensajeSchema],
    alimentosConfirmados: [AlimentoDetectadoSchema],
    nota:                 String,
    reporte:              ReportePlatoSchema,
    fuente:               { type: String, enum: ['chat', 'scan_movil'], default: 'chat' },
    perfilSnapshot:       PerfilSnapshotSchema,
    modeloIA:             String,
    simulado:             { type: Boolean, default: false },
    errorAnalisis:        String,
  },
  { timestamps: true }
);

EvaluacionAlimentoSchema.index({ pacienteId: 1, createdAt: -1 });

export default mongoose.model<IEvaluacionAlimento>('EvaluacionAlimento', EvaluacionAlimentoSchema);