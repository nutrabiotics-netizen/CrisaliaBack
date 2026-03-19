import mongoose, { Schema, Document } from 'mongoose';

export type TipoReglaAgenda = 'promocion' | 'multa' | 'paquete' | 'recordatorio';

export interface IReglaAgenda extends Document {
  tipo: TipoReglaAgenda;
  nombre: string;
  descripcion?: string;
  valor?: string; // porcentaje, cantidad, o estado (activo/inactivo para recordatorios)
  medicoId?: mongoose.Types.ObjectId; // Si es null aplica a todos
  activa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReglaAgendaSchema = new Schema<IReglaAgenda>(
  {
    tipo: {
      type: String,
      enum: ['promocion', 'multa', 'paquete', 'recordatorio'],
      required: true,
      index: true
    },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: '' },
    valor: { type: String, trim: true },
    medicoId: { type: Schema.Types.ObjectId, ref: 'Medico', default: null },
    activa: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model<IReglaAgenda>('ReglaAgenda', ReglaAgendaSchema);
