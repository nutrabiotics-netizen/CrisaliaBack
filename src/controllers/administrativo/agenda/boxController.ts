import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import BoxConsultorio from '../../../models/BoxConsultorio';
import AsignacionBox from '../../../models/AsignacionBox';

/** Formato YYYY-MM-DD a Date inicio del día UTC */
function parseFechaDia(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 0, 0, 0, 0));
}

// === CRUD BOXES ===

export const listarBoxes = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boxes = await BoxConsultorio.find().sort({ nombre: 1 }).lean();
    res.json({ success: true, data: boxes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al listar boxes', error: error.message });
  }
};

export const crearBox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre, estado, notas } = req.body;
    if (!nombre?.trim()) {
      res.status(400).json({ success: false, message: 'Falta nombre del box' });
      return;
    }
    const box = await BoxConsultorio.create({ nombre: nombre.trim(), estado, notas });
    res.status(201).json({ success: true, data: box });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al crear box', error: error.message });
  }
};

export const actualizarBox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const update = req.body;
    const box = await BoxConsultorio.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!box) {
      res.status(404).json({ success: false, message: 'Box no encontrado' });
      return;
    }
    res.json({ success: true, data: box });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al actualizar box', error: error.message });
  }
};

export const eliminarBox = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await AsignacionBox.deleteMany({ boxId: id });
    await BoxConsultorio.findByIdAndDelete(id);
    res.json({ success: true, message: 'Box eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al eliminar box', error: error.message });
  }
};

// === ASIGNACION BOXES ===

export const listarAsignacionesDia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fechaStr = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const fechaDate = parseFechaDia(fechaStr);
    if (!fechaDate) {
      res.status(400).json({ success: false, message: 'Formato de fecha inválido. YYYY-MM-DD' });
      return;
    }
    const asignaciones = await AsignacionBox.find({ fecha: fechaDate })
      .populate('medicoId', 'nombre apellido especialidad')
      .sort({ horaInicio: 1 })
      .lean();
    res.json({ success: true, data: asignaciones });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al listar asignaciones', error: error.message });
  }
};

export const obtenerMapaOcupacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fechaStr = (req.query.fecha as string) || new Date().toISOString().split('T')[0];
    const fechaDate = parseFechaDia(fechaStr);
    if (!fechaDate) {
      res.status(400).json({ success: false, message: 'Formato de fecha inválido. YYYY-MM-DD' });
      return;
    }

    const boxes = await BoxConsultorio.find().sort({ nombre: 1 }).lean();
    
    const asignaciones = await AsignacionBox.find({ fecha: fechaDate })
      .populate('medicoId', 'nombre apellido especialidad')
      .sort({ horaInicio: 1 })
      .lean();
      
    const mapa = boxes.map(box => {
       const asigs = asignaciones.filter(a => a.boxId.toString() === box._id.toString());
       return {
          ...box,
          asignaciones: asigs
       };
    });
    
    res.json({ success: true, data: mapa });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener mapa', error: error.message });
  }
};

export const asignarMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { idBox } = req.params; // Box
    const { medicoId, fecha, horaInicio, horaFin } = req.body;
    if (!medicoId || !fecha || !horaInicio || !horaFin) {
      res.status(400).json({ success: false, message: 'Faltan campos' });
      return;
    }
    const fechaDate = parseFechaDia(fecha);
    if (!fechaDate) {
      res.status(400).json({ success: false, message: 'Formato de fecha inválido. YYYY-MM-DD' });
      return;
    }
    const asig = await AsignacionBox.create({
      boxId: idBox,
      medicoId,
      fecha: fechaDate,
      horaInicio,
      horaFin
    });
    const populated = await AsignacionBox.findById(asig._id).populate('medicoId', 'nombre apellido').lean();
    
    // Auto-marcar box como 'en_uso' (aunque esto puede variar según la hora actual)
    await BoxConsultorio.findByIdAndUpdate(idBox, { estado: 'en_uso' });
    
    res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al asignar', error: error.message });
  }
};

export const eliminarAsignacion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { idAsig } = req.params;
    await AsignacionBox.findByIdAndDelete(idAsig);
    res.json({ success: true, message: 'Desasignado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al desasignar', error: error.message });
  }
};
