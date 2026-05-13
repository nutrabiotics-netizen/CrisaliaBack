import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import pacienteTratamientoService from '../../../services/paciente/tratamiento/pacienteTratamientoService';

const requirePaciente = (req: AuthRequest, res: Response): string | null => {
  if (!req.userId) {
    res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    return null;
  }
  return req.userId;
};

export const obtenerActivo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = requirePaciente(req, res);
    if (!pacienteId) return;
    const data = await pacienteTratamientoService.obtenerActivo(pacienteId);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error en tratamiento/activo:', error);
    res.status(500).json({ success: false, message: 'Error al obtener tratamiento activo', error: error.message });
  }
};

export const obtenerIndicaciones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = requirePaciente(req, res);
    if (!pacienteId) return;
    const data = await pacienteTratamientoService.obtenerIndicaciones(pacienteId);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error en tratamiento/indicaciones:', error);
    res.status(500).json({ success: false, message: 'Error al obtener indicaciones', error: error.message });
  }
};

export const marcarToma = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = requirePaciente(req, res);
    if (!pacienteId) return;
    const { formulaMedicaId, medicamentoIndex, notas } = req.body ?? {};

    if (!formulaMedicaId || typeof medicamentoIndex !== 'number') {
      res.status(400).json({ success: false, message: 'formulaMedicaId y medicamentoIndex son requeridos' });
      return;
    }

    const toma = await pacienteTratamientoService.marcarToma(
      pacienteId,
      formulaMedicaId,
      medicamentoIndex,
      notas
    );
    res.status(201).json({ success: true, data: toma });
  } catch (error: any) {
    console.error('Error en tratamiento/marcar-toma:', error);
    const code = /no pertenece|inválido|no encontrada/i.test(error.message) ? 400 : 500;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const obtenerRecomendaciones = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = requirePaciente(req, res);
    if (!pacienteId) return;
    const data = await pacienteTratamientoService.obtenerRecomendaciones(pacienteId);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error en tratamiento/recomendaciones:', error);
    res.status(500).json({ success: false, message: 'Error al obtener recomendaciones', error: error.message });
  }
};

export const obtenerHabitos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = requirePaciente(req, res);
    if (!pacienteId) return;
    const data = await pacienteTratamientoService.obtenerHabitos(pacienteId);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error en tratamiento/habitos:', error);
    res.status(500).json({ success: false, message: 'Error al obtener hábitos', error: error.message });
  }
};
