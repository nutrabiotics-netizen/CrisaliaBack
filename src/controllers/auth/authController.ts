import { Request, Response } from 'express';
import { AuthService, LoginCredentials } from '../../services/auth/authService';
import { handleError } from '../../utils/errors';
import { body, validationResult } from 'express-validator';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validar errores de validación
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Error de validación',
          errors: errors.array()
        });
        return;
      }

      const credentials: LoginCredentials = req.body;
      const result = await AuthService.login(credentials);

      res.status(200).json({
        success: true,
        message: 'Login exitoso',
        data: result
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }

  async getCurrentUser(req: any, res: Response): Promise<void> {
    try {
      const medicoId = req.userId;
      const medico = await AuthService.getMedicoById(medicoId);

      if (!medico) {
        res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          _id: medico._id.toString(),
          email: medico.email,
          nombre: medico.nombre,
          apellido: medico.apellido,
          especialidad: medico.especialidad,
          numeroColegiatura: medico.numeroColegiatura,
          telefono: medico.telefono,
          role: medico.role
        }
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }
}

export default new AuthController();

