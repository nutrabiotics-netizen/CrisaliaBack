import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Asesoria from '../../../models/Asesoria';
import mongoose from 'mongoose';

/** Crear una nueva asesoría (solicitud del paciente) */
export const crearAsesoria = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const { tema, descripcion } = req.body;
    if (!tema?.trim() || !descripcion?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Tema y descripción son requeridos'
      });
      return;
    }
    const asesoria = await Asesoria.create({
      pacienteId: new mongoose.Types.ObjectId(pacienteId),
      tema: tema.trim(),
      descripcion: descripcion.trim(),
      estado: 'pendiente'
    });
    res.status(201).json({
      success: true,
      message: 'Asesoría solicitada correctamente',
      data: asesoria
    });
  } catch (error: any) {
    console.error('Error al crear asesoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear asesoría',
      error: error.message
    });
  }
};

/** Listar asesorías del paciente logueado */
export const listarMisAsesorias = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const estado = req.query.estado as string | undefined;
    const filter: Record<string, unknown> = { pacienteId: new mongoose.Types.ObjectId(pacienteId) };
    if (estado && ['pendiente', 'asignada', 'respondida'].includes(estado)) {
      filter.estado = estado;
    }
    const asesorias = await Asesoria.find(filter)
      .sort({ createdAt: -1 })
      .populate('medicoId', 'nombre apellido')
      .lean();
    res.json({
      success: true,
      data: asesorias
    });
  } catch (error: any) {
    console.error('Error al listar asesorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar asesorías',
      error: error.message
    });
  }
};

/** Obtener una asesoría por ID (solo si pertenece al paciente) */
export const obtenerAsesoria = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { asesoriaId } = req.params;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(asesoriaId as string)) {
      res.status(400).json({ success: false, message: 'ID de asesoría inválido' });
      return;
    }
    const asesoria = await Asesoria.findOne({
      _id: asesoriaId,
      pacienteId: new mongoose.Types.ObjectId(pacienteId)
    })
      .populate('medicoId', 'nombre apellido')
      .lean();
    if (!asesoria) {
      res.status(404).json({ success: false, message: 'Asesoría no encontrada' });
      return;
    }
    res.json({
      success: true,
      data: asesoria
    });
  } catch (error: any) {
    console.error('Error al obtener asesoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener asesoría',
      error: error.message
    });
  }
};
