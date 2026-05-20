import mongoose, { Document, Schema } from 'mongoose';

export interface IParametroNutrabiotics extends Document {
  codigoParametro: string;
  nombre: string;
  paraQueSirve?: string;
  codigoCups: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const parametroNutrabioticsSchema = new Schema<IParametroNutrabiotics>(
  {
    codigoParametro: {
      type: String,
      required: true,
      trim: true
    },
    nombre: {
      type: String,
      required: true,
      trim: true
    },
    paraQueSirve: {
      type: String,
      trim: true,
      default: ''
    },
    codigoCups: {
      type: String,
      required: true,
      trim: true,
      default: ''
    },
    activo: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    collection: 'parametros_nutrabiotics'
  }
);

parametroNutrabioticsSchema.index({ codigoParametro: 1 });
parametroNutrabioticsSchema.index({ nombre: 'text', codigoParametro: 'text' });

const ParametroNutrabiotics = mongoose.model<IParametroNutrabiotics>(
  'ParametroNutrabiotics',
  parametroNutrabioticsSchema
);

export default ParametroNutrabiotics;
