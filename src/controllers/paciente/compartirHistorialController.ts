import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import CompartirHistorial from '../../models/CompartirHistorial';
import Medico from '../../models/Medico';
import { handleError } from '../../utils/errors';

/** POST /api/paciente/compartir-historial */
export const compartirConMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;
    const { medicoId, secciones } = req.body;

    if (!medicoId || !Array.isArray(secciones) || secciones.length === 0) {
      res.status(400).json({ success: false, message: 'medicoId y secciones son requeridos.' });
      return;
    }

    const medico = await Medico.findById(medicoId).select('nombre apellido especialidad').lean();
    if (!medico) { res.status(404).json({ success: false, message: 'Médico no encontrado.' }); return; }

    const registro = await CompartirHistorial.findOneAndUpdate(
      { pacienteId, medicoId },
      { $set: { secciones, activo: true } },
      { upsert: true, new: true }
    );

    res.status(201).json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

/** GET /api/paciente/compartir-historial */
export const listarCompartidos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;
    const registros = await CompartirHistorial.find({ pacienteId })
      .populate('medicoId', 'nombre apellido especialidad perfilVerificacion')
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ success: true, data: registros });
  } catch (err: any) {
    handleError(err, res);
  }
};

/** PUT /api/paciente/compartir-historial/:id */
export const actualizarSecciones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;
    const { id } = req.params;
    const { secciones } = req.body;

    if (!Array.isArray(secciones)) {
      res.status(400).json({ success: false, message: 'secciones debe ser un array.' });
      return;
    }

    const registro = await CompartirHistorial.findOneAndUpdate(
      { _id: id, pacienteId },
      { $set: { secciones } },
      { new: true }
    );
    if (!registro) { res.status(404).json({ success: false, message: 'Registro no encontrado.' }); return; }

    res.json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

/** DELETE /api/paciente/compartir-historial/:id */
export const revocarAcceso = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId!;
    const { id } = req.params;

    const registro = await CompartirHistorial.findOneAndUpdate(
      { _id: id, pacienteId },
      { $set: { activo: false } },
      { new: true }
    );
    if (!registro) { res.status(404).json({ success: false, message: 'Registro no encontrado.' }); return; }

    res.json({ success: true, message: 'Acceso revocado.' });
  } catch (err: any) {
    handleError(err, res);
  }
};