import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Asesoria from '../../../models/Asesoria';
import mongoose from 'mongoose';

/** Listar asesorías pendientes (sin asignar) */
export const listarPendientes = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const asesorias = await Asesoria.find({ estado: 'pendiente' })
      .sort({ createdAt: 1 })
      .populate('pacienteId', 'nombre apellido email')
      .lean();
    res.json({
      success: true,
      data: asesorias
    });
  } catch (error: any) {
    console.error('Error al listar asesorías pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar asesorías pendientes',
      error: error.message
    });
  }
};

/** Listar asesorías asignadas al médico logueado */
export const listarAsignadasAMi = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const asesorias = await Asesoria.find({
      medicoId: new mongoose.Types.ObjectId(medicoId),
      estado: { $in: ['asignada', 'respondida'] }
    })
      .sort({ createdAt: -1 })
      .populate('pacienteId', 'nombre apellido email')
      .lean();
    res.json({
      success: true,
      data: asesorias
    });
  } catch (error: any) {
    console.error('Error al listar asesorías asignadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar asesorías asignadas',
      error: error.message
    });
  }
};

/** Asignarse una asesoría pendiente */
export const asignarAsesoria = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { asesoriaId } = req.params;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(asesoriaId as string)) {
      res.status(400).json({ success: false, message: 'ID de asesoría inválido' });
      return;
    }
    const asesoria = await Asesoria.findOneAndUpdate(
      { _id: asesoriaId, estado: 'pendiente' },
      { medicoId: new mongoose.Types.ObjectId(medicoId), estado: 'asignada' },
      { new: true }
    )
      .populate('pacienteId', 'nombre apellido email')
      .lean();
    if (!asesoria) {
      res.status(404).json({
        success: false,
        message: 'Asesoría no encontrada o ya está asignada'
      });
      return;
    }
    res.json({
      success: true,
      message: 'Asesoría asignada correctamente',
      data: asesoria
    });
  } catch (error: any) {
    console.error('Error al asignar asesoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al asignar asesoría',
      error: error.message
    });
  }
};

/** Responder una asesoría asignada al médico */
export const responderAsesoria = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { asesoriaId } = req.params;
    const { respuesta } = req.body;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (!respuesta?.trim()) {
      res.status(400).json({ success: false, message: 'La respuesta es requerida' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(asesoriaId as string)) {
      res.status(400).json({ success: false, message: 'ID de asesoría inválido' });
      return;
    }
    const asesoria = await Asesoria.findOneAndUpdate(
      {
        _id: asesoriaId,
        medicoId: new mongoose.Types.ObjectId(medicoId),
        estado: 'asignada'
      },
      {
        respuesta: respuesta.trim(),
        fechaRespuesta: new Date(),
        estado: 'respondida'
      },
      { new: true }
    )
      .populate('pacienteId', 'nombre apellido email')
      .lean();
    if (!asesoria) {
      res.status(404).json({
        success: false,
        message: 'Asesoría no encontrada o no está asignada a usted'
      });
      return;
    }
    res.json({
      success: true,
      message: 'Respuesta enviada correctamente',
      data: asesoria
    });
  } catch (error: any) {
    console.error('Error al responder asesoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al responder asesoría',
      error: error.message
    });
  }
};
