import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Tercero from '../../../models/Tercero';
import mongoose from 'mongoose';

/** Listar todos los terceros */
export const listar = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const terceros = await Tercero.find().sort({ nombre: 1 }).lean();
    res.json({
      success: true,
      data: terceros
    });
  } catch (error: any) {
    console.error('Error al listar terceros:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar terceros',
      error: error.message
    });
  }
};

/** Obtener un tercero por ID */
export const obtenerPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id as string)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const tercero = await Tercero.findById(id).lean();
    if (!tercero) {
      res.status(404).json({ success: false, message: 'Tercero no encontrado' });
      return;
    }
    res.json({
      success: true,
      data: tercero
    });
  } catch (error: any) {
    console.error('Error al obtener tercero:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tercero',
      error: error.message
    });
  }
};

/** Crear tercero */
export const crear = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, tipo, descripcion, activo, integrado, cantidadPacientes } = req.body;
    if (!nombre?.trim()) {
      res.status(400).json({ success: false, message: 'El nombre es requerido' });
      return;
    }
    const tipoValido = ['seguro', 'convenio', 'integracion'].includes(tipo) ? tipo : 'convenio';
    const tercero = await Tercero.create({
      nombre: nombre.trim(),
      tipo: tipoValido,
      descripcion: (descripcion ?? '').trim() || undefined,
      activo: activo !== false,
      integrado: integrado === true,
      cantidadPacientes: Math.max(0, Number(cantidadPacientes) || 0)
    });
    res.status(201).json({
      success: true,
      message: 'Tercero creado correctamente',
      data: tercero
    });
  } catch (error: any) {
    console.error('Error al crear tercero:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear tercero',
      error: error.message
    });
  }
};

/** Actualizar tercero */
export const actualizar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, tipo, descripcion, activo, integrado, cantidadPacientes } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id as string)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const update: Record<string, unknown> = {};
    if (nombre !== undefined) update.nombre = String(nombre).trim();
    if (tipo !== undefined) update.tipo = ['seguro', 'convenio', 'integracion'].includes(tipo) ? tipo : 'convenio';
    if (descripcion !== undefined) update.descripcion = String(descripcion).trim() || '';
    if (activo !== undefined) update.activo = activo !== false;
    if (integrado !== undefined) update.integrado = integrado === true;
    if (cantidadPacientes !== undefined) update.cantidadPacientes = Math.max(0, Number(cantidadPacientes) || 0);

    const tercero = await Tercero.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!tercero) {
      res.status(404).json({ success: false, message: 'Tercero no encontrado' });
      return;
    }
    res.json({
      success: true,
      message: 'Tercero actualizado correctamente',
      data: tercero
    });
  } catch (error: any) {
    console.error('Error al actualizar tercero:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tercero',
      error: error.message
    });
  }
};

/** Eliminar tercero */
export const eliminar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id as string)) {
      res.status(400).json({ success: false, message: 'ID inválido' });
      return;
    }
    const tercero = await Tercero.findByIdAndDelete(id);
    if (!tercero) {
      res.status(404).json({ success: false, message: 'Tercero no encontrado' });
      return;
    }
    res.json({
      success: true,
      message: 'Tercero eliminado correctamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar tercero:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar tercero',
      error: error.message
    });
  }
};
