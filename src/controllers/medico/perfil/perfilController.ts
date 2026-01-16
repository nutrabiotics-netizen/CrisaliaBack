import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import perfilMedicoService from '../../../services/medico/perfil/perfilService';
import { handleError } from '../../../utils/errors';

export const getPerfilMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const medico = await perfilMedicoService.obtenerPerfilMedico(medicoId);

    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Perfil obtenido exitosamente',
      data: medico
    });
  } catch (error: any) {
    handleError(error, res);
  }
};

export const updatePerfilMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const datosActualizacion = req.body;

    // Validar que al menos un campo sea proporcionado
    const camposPermitidos = ['nombre', 'apellido', 'email', 'telefono', 'especialidad', 'numeroColegiatura'];
    const camposProporcionados = Object.keys(datosActualizacion);
    const tieneCamposValidos = camposProporcionados.some(campo => camposPermitidos.includes(campo));

    if (!tieneCamposValidos) {
      res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un campo válido para actualizar'
      });
      return;
    }

    const medicoActualizado = await perfilMedicoService.actualizarPerfilMedico(
      medicoId,
      datosActualizacion
    );

    res.status(200).json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: medicoActualizado
    });
  } catch (error: any) {
    handleError(error, res);
  }
};
