import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import pacienteHistoriaClinicaService from '../../../services/paciente/historiaClinica/pacienteHistoriaClinicaService';

export const obtenerHistoriaPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const historia = await pacienteHistoriaClinicaService.obtenerPorCita(
      citaId as string,
      pacienteId
    );

    if (!historia) {
      res.status(404).json({ success: false, message: 'Historia clínica no encontrada' });
      return;
    }

    res.json({ success: true, data: historia });
  } catch (error: any) {
    console.error('Error al obtener historia clínica del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historia clínica',
      error: error.message
    });
  }
};

export const listarHistoriasDelPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const historias = await pacienteHistoriaClinicaService.listarPorPaciente(pacienteId);
    res.json({ success: true, data: historias });
  } catch (error: any) {
    console.error('Error al listar historias clínicas del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al listar historias clínicas',
      error: error.message
    });
  }
};
