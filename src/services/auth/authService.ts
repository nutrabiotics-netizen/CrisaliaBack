import Medico, { IMedico } from '../../models/Medico';
import { generateToken } from '../../utils/jwt';
import { AppError } from '../../utils/errors';
import { UserRole } from '../../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  medico: {
    _id: string;
    email: string;
    nombre: string;
    apellido: string;
    especialidad?: string;
    numeroColegiatura?: string;
    telefono?: string;
    role: UserRole.MEDICO;
  };
}

export class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { email, password } = credentials;

    // Buscar médico con password
    const medico = await Medico.findOne({ email }).select('+password');

    if (!medico) {
      throw new AppError('Credenciales inválidas', 401);
    }

    if (!medico.activo) {
      throw new AppError('Tu cuenta está desactivada. Contacta al administrador.', 403);
    }

    // Verificar contraseña
    const isPasswordValid = await medico.comparePassword(password);

    if (!isPasswordValid) {
      throw new AppError('Credenciales inválidas', 401);
    }

    // Generar token
    const token = generateToken(medico._id.toString(), UserRole.MEDICO);

    // Retornar respuesta sin password
    return {
      token,
      medico: {
        _id: medico._id.toString(),
        email: medico.email,
        nombre: medico.nombre,
        apellido: medico.apellido,
        especialidad: medico.especialidad,
        numeroColegiatura: medico.numeroColegiatura,
        telefono: medico.telefono,
        role: UserRole.MEDICO
      }
    };
  }

  async getMedicoById(medicoId: string): Promise<IMedico | null> {
    return Medico.findById(medicoId);
  }
}

export default new AuthService();

