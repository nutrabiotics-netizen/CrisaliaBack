import mongoose, { Schema, Document } from 'mongoose';

export interface IConfiguracionSeguridadPaciente extends Document {
  paciente: mongoose.Types.ObjectId;
  // Opciones de seguridad
  autenticacionDosFactores: boolean;
  recordarDispositivo: boolean;
  autenticacionBiometrica: boolean;
  tipoBiometrico: 'ninguno' | 'facial' | 'huella';
  visualizarContrasena: boolean;
  // Preferencias de notificación
  metodoNotificacion: 'whatsapp' | 'email' | 'sms';
  // Términos y condiciones
  aceptaTerminos: boolean;
  aceptaConsentimiento: boolean;
  fechaAceptacionTerminos?: Date;
  fechaAceptacionConsentimiento?: Date;
  /** Fechas de aceptación por documento (id documento -> ISO date). Para los 10 documentos legales. */
  consentimientosDetalle?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const ConfiguracionSeguridadPacienteSchema = new Schema<IConfiguracionSeguridadPaciente>(
  {
    paciente: {
      type: Schema.Types.ObjectId,
      ref: 'Paciente',
      required: true,
      unique: true
    },
    autenticacionDosFactores: {
      type: Boolean,
      default: false
    },
    recordarDispositivo: {
      type: Boolean,
      default: false
    },
    autenticacionBiometrica: {
      type: Boolean,
      default: false
    },
    tipoBiometrico: {
      type: String,
      enum: ['ninguno', 'facial', 'huella'],
      default: 'ninguno'
    },
    visualizarContrasena: {
      type: Boolean,
      default: false
    },
    metodoNotificacion: {
      type: String,
      enum: ['whatsapp', 'email', 'sms'],
      default: 'whatsapp'
    },
    aceptaTerminos: {
      type: Boolean,
      default: false
    },
    aceptaConsentimiento: {
      type: Boolean,
      default: false
    },
    fechaAceptacionTerminos: {
      type: Date
    },
    fechaAceptacionConsentimiento: {
      type: Date
    },
    consentimientosDetalle: {
      type: Schema.Types.Mixed,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IConfiguracionSeguridadPaciente>(
  'ConfiguracionSeguridadPaciente',
  ConfiguracionSeguridadPacienteSchema
);

