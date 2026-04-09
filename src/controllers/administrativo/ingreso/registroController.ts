import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import RegistroIngresoSalida from '../../../models/RegistroIngresoSalida';
import PersonalInstitucional from '../../../models/PersonalInstitucional';
import Medico from '../../../models/Medico';
import mongoose from 'mongoose';

/** Normalizar fecha a inicio del día en UTC para comparar */
function fechaInicioDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Listar registros de un día (fecha en query: YYYY-MM-DD) */
export const listarPorFecha = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fechaStr = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const match = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      res.status(400).json({ success: false, message: 'Formato de fecha inválido. Use YYYY-MM-DD' });
      return;
    }
    const [, y, m, d] = match;
    const inicio = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 0, 0, 0, 0));
    const fin = new Date(inicio);
    fin.setUTCDate(fin.getUTCDate() + 1);
    const registros = await RegistroIngresoSalida.find({
      fecha: { $gte: inicio, $lt: fin }
    })
      .populate('personalId', 'tipo nombre apellido cargo')
      .populate('medicoId', 'nombre apellido especialidad')
      .sort({ horaEntrada: 1 })
      .lean();
    res.json({ success: true, data: registros });
  } catch (error: any) {
    console.error('Error al listar registros:', error);
    res.status(500).json({ success: false, message: 'Error al listar registros', error: error.message });
  }
};

/** Registrar ingreso. Body: medicoId O personalId (uno de los dos), horaEntrada, fecha? (YYYY-MM-DD) */
export const registrarIngreso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { personalId, medicoId, horaEntrada, fecha: fechaStr } = req.body;
    if (!horaEntrada?.trim()) {
      res.status(400).json({ success: false, message: 'horaEntrada es requerida' });
      return;
    }
    const tienePersonal = personalId && mongoose.Types.ObjectId.isValid(personalId);
    const tieneMedico = medicoId && mongoose.Types.ObjectId.isValid(medicoId);
    if (!tienePersonal && !tieneMedico) {
      res.status(400).json({ success: false, message: 'Debe enviar medicoId o personalId' });
      return;
    }
    if (tienePersonal && tieneMedico) {
      res.status(400).json({ success: false, message: 'Envíe solo medicoId o solo personalId' });
      return;
    }
    let dia: Date;
    if (fechaStr && typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      const [y, m, d] = fechaStr.split('-').map(Number);
      dia = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    } else {
      dia = fechaInicioDia(new Date());
    }
    if (tienePersonal) {
      const personal = await PersonalInstitucional.findById(personalId);
      if (!personal) {
        res.status(404).json({ success: false, message: 'Personal no encontrado' });
        return;
      }
      const existente = await RegistroIngresoSalida.findOne({ personalId: new mongoose.Types.ObjectId(personalId), fecha: dia });
      if (existente) {
        res.status(400).json({ success: false, message: 'Ya existe un registro de ingreso para esa fecha. Use registrar salida.' });
        return;
      }
    } else {
      const medico = await Medico.findById(medicoId);
      if (!medico) {
        res.status(404).json({ success: false, message: 'Médico no encontrado' });
        return;
      }
      const existente = await RegistroIngresoSalida.findOne({ medicoId: new mongoose.Types.ObjectId(medicoId), fecha: dia });
      if (existente) {
        res.status(400).json({ success: false, message: 'Ya existe un registro de ingreso para esa fecha. Use registrar salida.' });
        return;
      }
    }
    const registro = await RegistroIngresoSalida.create({
      personalId: tienePersonal ? new mongoose.Types.ObjectId(personalId) : undefined,
      medicoId: tieneMedico ? new mongoose.Types.ObjectId(medicoId) : undefined,
      fecha: dia,
      horaEntrada: horaEntrada.trim()
    });
    const populated = await RegistroIngresoSalida.findById(registro._id)
      .populate('personalId', 'tipo nombre apellido cargo')
      .populate('medicoId', 'nombre apellido especialidad')
      .lean();
    res.status(201).json({ success: true, message: 'Ingreso registrado', data: populated });
  } catch (error: any) {
    console.error('Error al registrar ingreso:', error);
    res.status(500).json({ success: false, message: 'Error al registrar ingreso', error: error.message });
  }
};

/** Registrar salida (actualizar horaSalida del registro del día) */
export const registrarSalida = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { horaSalida } = req.body;
    if (!horaSalida?.trim()) {
      res.status(400).json({ success: false, message: 'horaSalida es requerida' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(id as string)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const registro = await RegistroIngresoSalida.findByIdAndUpdate(
      id,
      { horaSalida: horaSalida.trim() },
      { new: true }
    )
      .populate('personalId', 'tipo nombre apellido cargo')
      .populate('medicoId', 'nombre apellido especialidad')
      .lean();
    if (!registro) {
      res.status(404).json({ success: false, message: 'Registro no encontrado' });
      return;
    }
    res.json({ success: true, message: 'Salida registrada', data: registro });
  } catch (error: any) {
    console.error('Error al registrar salida:', error);
    res.status(500).json({ success: false, message: 'Error al registrar salida', error: error.message });
  }
};
