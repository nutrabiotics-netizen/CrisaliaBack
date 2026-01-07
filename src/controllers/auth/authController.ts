import { Request, Response } from 'express';
import authService, { LoginCredentials, RegisterMedicoData } from '../../services/auth/authService';
import { handleError } from '../../utils/errors';
import { validationResult } from 'express-validator';

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
      const result = await authService.login(credentials);

      res.status(200).json({
        success: true,
        message: 'Login exitoso',
        data: {
          token: result.token,
          user: result.user
        }
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }

  async register(req: Request, res: Response): Promise<void> {
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

      const registerData: RegisterMedicoData = req.body;
      const result = await authService.registerMedico(registerData);

      res.status(201).json({
        success: true,
        message: 'Registro exitoso',
        data: {
          token: result.token,
          user: result.user
        }
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }

  async getCurrentUser(req: any, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const userRole = req.userRole;
      const user = await authService.getUserById(userId, userRole);

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
        return;
      }

      const userData: any = {
        _id: user._id.toString(),
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        role: user.role
      };

      // Agregar campos específicos según el rol
      if (userRole === 'medico' && 'especialidad' in user) {
        userData.especialidad = user.especialidad;
        userData.numeroColegiatura = user.numeroColegiatura;
        userData.telefono = user.telefono;
      }

      if (userRole === 'paciente' && 'fechaNacimiento' in user) {
        userData.fechaNacimiento = user.fechaNacimiento;
        userData.direccion = user.direccion;
        userData.telefono = user.telefono;
      }

      if (userRole === 'administrativo' && 'cargo' in user) {
        userData.cargo = user.cargo;
        userData.telefono = user.telefono;
      }

      res.status(200).json({
        success: true,
        data: userData
      });
    } catch (error: any) {
      handleError(error, res);
    }
  }
}

export default new AuthController();

