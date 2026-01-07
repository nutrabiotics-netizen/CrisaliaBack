import Medico, { IMedico } from '../../models/Medico';
import Paciente, { IPaciente } from '../../models/Paciente';
import Administrativo, { IAdministrativo } from '../../models/Administrativo';
import { generateToken } from '../../utils/jwt';
import { AppError } from '../../utils/errors';
import { UserRole } from '../../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterMedicoData {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  especialidad?: string;
  whatsapp?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    _id: string;
    email: string;
    nombre: string;
    apellido: string;
    role: UserRole;
    especialidad?: string;
    numeroColegiatura?: string;
    telefono?: string;
    fechaNacimiento?: Date;
    direccion?: string;
    cargo?: string;
  };
}

export class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { email, password } = credentials;

    // Buscar en todos los modelos según el rol
    let user: IMedico | IPaciente | IAdministrativo | null = null;
    let userRole: UserRole | null = null;

    // Intentar buscar como médico
    const medico = await Medico.findOne({ email }).select('+password');
    if (medico) {
      user = medico;
      userRole = UserRole.MEDICO;
    } else {
      // Intentar buscar como paciente
      const paciente = await Paciente.findOne({ email }).select('+password');
      if (paciente) {
        user = paciente;
        userRole = UserRole.PACIENTE;
      } else {
        // Intentar buscar como administrativo
        const administrativo = await Administrativo.findOne({ email }).select('+password');
        if (administrativo) {
          user = administrativo;
          userRole = UserRole.ADMINISTRATIVO;
        }
      }
    }

    if (!user || !userRole) {
      throw new AppError('Credenciales inválidas', 401);
    }

    // Verificar si la cuenta está activa
    if ('activo' in user && !user.activo) {
      throw new AppError('Tu cuenta está desactivada. Contacta al administrador.', 403);
    }

    // Verificar contraseña
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new AppError('Credenciales inválidas', 401);
    }

    // Generar token
    const token = generateToken(user._id.toString(), userRole);

    // Construir respuesta según el tipo de usuario
    const userResponse: AuthResponse['user'] = {
      _id: user._id.toString(),
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      role: userRole
    };

    // Agregar campos específicos según el rol
    if (userRole === UserRole.MEDICO && 'especialidad' in user) {
      userResponse.especialidad = user.especialidad;
      userResponse.numeroColegiatura = user.numeroColegiatura;
      userResponse.telefono = user.telefono;
    }

    if (userRole === UserRole.PACIENTE && 'fechaNacimiento' in user) {
      userResponse.fechaNacimiento = user.fechaNacimiento;
      userResponse.direccion = user.direccion;
      userResponse.telefono = user.telefono;
    }

    if (userRole === UserRole.ADMINISTRATIVO && 'cargo' in user) {
      userResponse.cargo = user.cargo;
      userResponse.telefono = user.telefono;
    }

    return {
      token,
      user: userResponse
    };
  }

  async registerMedico(data: RegisterMedicoData): Promise<AuthResponse> {
    const { nombre, apellido, email, password, especialidad, whatsapp } = data;

    // Verificar si el email ya existe
    const existingMedico = await Medico.findOne({ email });
    if (existingMedico) {
      throw new AppError('Este correo electrónico ya está registrado', 400);
    }

    // Crear nuevo médico
    const nuevoMedico = new Medico({
      nombre,
      apellido,
      email,
      password,
      especialidad,
      whatsapp,
      role: UserRole.MEDICO,
      activo: true
    });

    await nuevoMedico.save();

    // Generar token
    const token = generateToken(nuevoMedico._id.toString(), UserRole.MEDICO);

    // Construir respuesta
    const userResponse: AuthResponse['user'] = {
      _id: nuevoMedico._id.toString(),
      email: nuevoMedico.email,
      nombre: nuevoMedico.nombre,
      apellido: nuevoMedico.apellido,
      role: UserRole.MEDICO,
      especialidad: nuevoMedico.especialidad,
      telefono: nuevoMedico.telefono
    };

    return {
      token,
      user: userResponse
    };
  }

  async getUserById(userId: string, role: UserRole): Promise<IMedico | IPaciente | IAdministrativo | null> {
    switch (role) {
      case UserRole.MEDICO:
        return Medico.findById(userId);
      case UserRole.PACIENTE:
        return Paciente.findById(userId);
      case UserRole.ADMINISTRATIVO:
        return Administrativo.findById(userId);
      default:
        return null;
    }
  }
}

export default new AuthService();

