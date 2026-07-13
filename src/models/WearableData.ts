import mongoose, { Schema, Document } from 'mongoose';

/**
 * Datos biométricos crudos de un wearable, normalizados.
 *
 * Modelo agnóstico al proveedor (Fitbit, Oura, Garmin, Apple Health…).
 * Capa 2 de la arquitectura propuesta en `INVESTIGACION_WEARABLES.md`.
 *
 * Cada documento representa UNA medición (un punto temporal) — la lectura
 * eficiente para gráficas se hace con índice compuesto `(pacienteId, type, timestamp)`.
 */

export type WearableSource = 'fitbit' | 'google_health' | 'oura' | 'garmin' | 'whoop' | 'polar' | 'apple_health' | 'health_connect' | 'manual';

export type WearableType =
  | 'hrv'            // HRV RMSSD en ms
  | 'heart_rate'     // BPM
  | 'rhr'            // resting heart rate (BPM)
  | 'sleep_total'    // minutos totales de sueño
  | 'sleep_deep'     // minutos de sueño profundo
  | 'sleep_rem'      // minutos REM
  | 'sleep_light'    // minutos sueño ligero
  | 'sleep_awake'    // minutos despierto
  | 'sleep_efficiency' // %
  | 'steps'          // pasos
  | 'distance_m'     // metros
  | 'calories'       // kcal
  | 'active_minutes' // minutos
  | 'spo2'           // %
  | 'body_temp'      // °C
  | 'weight_kg'        // kg
  | 'stress'           // 0-100 (Garmin/Fitbit body battery)
  | 'respiratory_rate' // respiraciones por minuto
  | 'vo2_max';         // ml/kg/min

export interface IWearableData extends Document {
  pacienteId: mongoose.Types.ObjectId;
  source: WearableSource;
  type: WearableType;
  /** Valor numérico de la métrica (en su unidad nativa — ver `unit`). */
  value: number;
  unit: string;
  /** Momento al que pertenece la medición. */
  timestamp: Date;
  /** Para mediciones por rango (sueño): cuándo termina la ventana. */
  endTimestamp?: Date;
  /** ID original del proveedor — sirve para dedup en re-sync. */
  externalId?: string;
  /** Payload crudo del proveedor para auditoría (truncado a 2 KB). */
  raw?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const WearableDataSchema = new Schema<IWearableData>(
  {
    pacienteId: { type: Schema.Types.ObjectId, ref: 'Paciente', required: true, index: true },
    source: {
      type: String,
      required: true,
      enum: ['fitbit', 'google_health', 'oura', 'garmin', 'whoop', 'polar', 'apple_health', 'health_connect', 'manual']
    },
    type: { type: String, required: true },
    value: { type: Number, required: true },
    unit: { type: String, required: true },
    timestamp: { type: Date, required: true, index: true },
    endTimestamp: { type: Date },
    externalId: { type: String, index: true, sparse: true },
    raw: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

// Lectura típica: paciente + tipo en un rango de fechas (gráficas, dashboards)
WearableDataSchema.index({ pacienteId: 1, type: 1, timestamp: -1 });
// Dedup en re-sync: si llega el mismo punto del mismo proveedor, lo evitamos
WearableDataSchema.index({ pacienteId: 1, source: 1, externalId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IWearableData>('WearableData', WearableDataSchema);
