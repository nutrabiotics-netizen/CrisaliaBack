import { Response } from 'express';
import Paraclinico from '../../models/Paraclinico';
import { AuthRequest } from '../../middleware/auth';

export const obtenerParaclinicos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const paraclinicos = await Paraclinico.find({ pacienteId }).sort({ fecha: -1 });
    res.json(paraclinicos);
  } catch (error) {
    console.error('Error al obtener paraclínicos:', error);
    res.status(500).json({ mensaje: 'Error al obtener los paraclínicos' });
  }
};

export const subirParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const { nombre, tipo, tamañoBytes, urlArchivo, notasPaciente } = req.body;

    // Validación básica
    if (!nombre || !tipo || !tamañoBytes || !urlArchivo) {
      res.status(400).json({ mensaje: 'Faltan campos requeridos: nombre, tipo, tamañoBytes, urlArchivo' });
      return;
    }

    const nuevoParaclinico = new Paraclinico({
      pacienteId,
      nombre,
      tipo,
      tamañoBytes,
      urlArchivo,
      notasPaciente,
      fecha: new Date(),
      revisadoPorMedico: false
    });

    await nuevoParaclinico.save();
    res.status(201).json(nuevoParaclinico);
  } catch (error) {
    console.error('Error al subir paraclínico:', error);
    res.status(500).json({ mensaje: 'Error al registrar el paraclínico' });
  }
};

export const eliminarParaclinico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { id } = req.params;

    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const paraclinico = await Paraclinico.findOne({ _id: id, pacienteId });
    if (!paraclinico) {
      res.status(404).json({ mensaje: 'Paraclínico no encontrado o no autorizado para eliminarlo' });
      return;
    }

    await paraclinico.deleteOne();
    res.json({ mensaje: 'Paraclínico eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar paraclínico:', error);
    res.status(500).json({ mensaje: 'Error al eliminar el paraclínico' });
  }
};
