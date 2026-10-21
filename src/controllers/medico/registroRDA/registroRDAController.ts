import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import registroRDAService from '../../../services/medico/registroRDA/registroRDAService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import { handleError } from '../../../utils/errors';

export const crearRegistroRDA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const registro = await registroRDAService.crear({
      ...req.body,
      medicoId,
      creadoPor: medicoId,
      creadoPorRol: 'Medico',
    });

    await registrarAccion(req, 'crear', 'RegistroRDA', registro._id.toString());
    res.status(201).json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const obtenerRegistroRDAPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const citaId = String(req.params.citaId);
    const registro = await registroRDAService.obtenerPorCita(citaId, medicoId);
    if (!registro) { res.status(404).json({ success: false, message: 'Registro RDA no encontrado' }); return; }

    res.status(200).json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const obtenerRegistrosRDAPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const pacienteId = String(req.params.pacienteId);
    const registros = await registroRDAService.obtenerPorPaciente(pacienteId, medicoId);
    res.status(200).json({ success: true, data: registros });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const obtenerRegistroRDAPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const registroId = String(req.params.registroId);
    const registro = await registroRDAService.obtenerPorId(registroId, medicoId);
    if (!registro) { res.status(404).json({ success: false, message: 'Registro RDA no encontrado' }); return; }

    res.status(200).json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const actualizarRegistroRDA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const registroId = String(req.params.registroId);
    const registro = await registroRDAService.actualizar(registroId, medicoId, {
      ...req.body,
      actualizadoPor: medicoId,
      actualizadoPorRol: 'Medico',
    });

    await registrarAccion(req, 'actualizar', 'RegistroRDA', registroId);
    res.status(200).json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const cambiarEstadoRegistroRDA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const registroId = String(req.params.registroId);
    const { estado } = req.body;
    if (!['borrador', 'listo', 'transmitido'].includes(estado)) {
      res.status(400).json({ success: false, message: 'Estado inválido' });
      return;
    }

    const registro = await registroRDAService.cambiarEstado(registroId, medicoId, estado);
    await registrarAccion(req, 'actualizar', 'RegistroRDA', registroId);
    res.status(200).json({ success: true, data: registro });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const eliminarRegistroRDA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autorizado' }); return; }

    const registroId = String(req.params.registroId);
    await registroRDAService.eliminar(registroId, medicoId);
    await registrarAccion(req, 'eliminar', 'RegistroRDA', registroId);
    res.status(200).json({ success: true, message: 'Registro RDA eliminado' });
  } catch (err: any) {
    handleError(err, res);
  }
};
