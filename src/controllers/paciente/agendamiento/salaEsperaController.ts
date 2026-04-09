import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import {
  obtenerContenidoParaPaciente,
  obtenerEstadoColaSalaEspera
} from '../../../services/paciente/agendamiento/salaEsperaService';

export const getEstadoSalaEspera = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(citaId)) {
      res.status(400).json({ success: false, message: 'Identificador de cita inválido' });
      return;
    }
    const data = await obtenerEstadoColaSalaEspera(citaId, pacienteId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error estado sala de espera:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el estado de la sala de espera',
      error: error.message
    });
  }
};

export const getContenidoSalaEspera = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const data = await obtenerContenidoParaPaciente(pacienteId);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error contenido sala de espera:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener contenido educativo',
      error: error.message
    });
  }
};
