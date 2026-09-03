import Medico, { IMedico } from '../../models/Medico';
import Paciente, { IPaciente } from '../../models/Paciente';
import Administrativo, { IAdministrativo } from '../../models/Administrativo';
import ConfiguracionSeguridadPaciente from '../../models/ConfiguracionSeguridadPaciente';
import { generateToken } from '../../utils/jwt';
import { AppError } from '../../utils/errors';
import { UserRole } from '../../types';
import {
  envioCodigoWhatsApp,
  verificarCodigoWhatsApp,
  normalizarTelefono
} from '../whatsapp/whatsappService';

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

export interface AcudienteTutorData {
  nombre: string;
  parentesco: string;
  telefono?: string;
}

export interface RegisterPacienteData {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  telefono?: string;
  /** Fecha de nacimiento ISO (YYYY-MM-DD). El servidor la persiste y permite calcular la edad. */
  fechaNacimiento?: string;
  /** Género auto-declarado del paciente */
  genero?: 'masculino' | 'femenino' | 'no-binario' | 'otro' | 'prefiero-no-decir';
  acudiente?: AcudienteTutorData;
  aceptaTerminos?: boolean;
  aceptaConsentimiento?: boolean;
  zonasDolor?: string[];
  numeroDocumento?: string;
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
    /** 2FA: solo pacientes. Por defecto false (usuarios nuevos no tienen WhatsApp para validación). */
    habilitado2FA?: boolean;
    aceptaTerminos?: boolean;
    aceptaConsentimiento?: boolean;
    firstAppointment?: boolean;
    genero?: string;
    numeroDocumento?: string;
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
      const configSeguridad = await ConfiguracionSeguridadPaciente.findOne({ paciente: user._id });
      userResponse.habilitado2FA = configSeguridad?.autenticacionDosFactores ?? false;
      userResponse.aceptaTerminos = configSeguridad?.aceptaTerminos ?? false;
      userResponse.aceptaConsentimiento = configSeguridad?.aceptaConsentimiento ?? false;
      userResponse.firstAppointment = (user as IPaciente).firstAppointment ?? false;
      userResponse.genero = (user as IPaciente).genero;
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

  async registerPaciente(data: RegisterPacienteData): Promise<AuthResponse> {
    const { nombre, apellido, email, password, telefono, fechaNacimiento, genero, acudiente, aceptaTerminos, aceptaConsentimiento, zonasDolor, numeroDocumento } = data;

    const existingPaciente = await Paciente.findOne({ email });
    if (existingPaciente) {
      throw new AppError('Este correo electrónico ya está registrado', 400);
    }

    if (telefono?.trim()) {
      const existingTelefono = await Paciente.findOne({ telefono: telefono.trim() });
      if (existingTelefono) {
        throw new AppError('Este número de teléfono ya está registrado', 400);
      }
    }

    // Parse fechaNacimiento si viene como string ISO/YYYY-MM-DD
    let fechaNacimientoParsed: Date | undefined;
    if (fechaNacimiento) {
      const d = new Date(fechaNacimiento);
      if (!isNaN(d.getTime())) fechaNacimientoParsed = d;
    }

    const generosValidos = ['masculino', 'femenino', 'no-binario', 'otro', 'prefiero-no-decir'];
    const generoNormalizado = genero ? genero.toLowerCase() as typeof genero : undefined;
    const generoFinal = generoNormalizado && generosValidos.includes(generoNormalizado) ? generoNormalizado : undefined;

    const nuevoPaciente = new Paciente({
      nombre,
      apellido,
      email,
      password,
      telefono: telefono?.trim() || undefined,
      ...(fechaNacimientoParsed && { fechaNacimiento: fechaNacimientoParsed }),
      ...(generoFinal && { genero: generoFinal }),
      acudiente:
        acudiente?.nombre?.trim() && acudiente?.parentesco?.trim()
          ? {
              nombre: acudiente.nombre.trim(),
              parentesco: acudiente.parentesco.trim(),
              telefono: acudiente.telefono?.trim()
            }
          : undefined,
      role: UserRole.PACIENTE,
      activo: true,
      ...(zonasDolor && zonasDolor.length > 0 && { zonasDolor }),
      ...(numeroDocumento?.trim() && { numeroDocumento: numeroDocumento.trim() })
    });

    await nuevoPaciente.save();

    const ahora = new Date();
    await ConfiguracionSeguridadPaciente.create({
      paciente: nuevoPaciente._id,
      autenticacionDosFactores: false,
      recordarDispositivo: false,
      autenticacionBiometrica: false,
      tipoBiometrico: 'ninguno',
      visualizarContrasena: false,
      metodoNotificacion: 'whatsapp',
      aceptaTerminos: aceptaTerminos ?? false,
      aceptaConsentimiento: aceptaConsentimiento ?? false,
      fechaAceptacionTerminos: aceptaTerminos ? ahora : undefined,
      fechaAceptacionConsentimiento: aceptaConsentimiento ? ahora : undefined
    });

    const configSeguridad = await ConfiguracionSeguridadPaciente.findOne({ paciente: nuevoPaciente._id });
    const token = generateToken(nuevoPaciente._id.toString(), UserRole.PACIENTE);
    const userResponse: AuthResponse['user'] = {
      _id: nuevoPaciente._id.toString(),
      email: nuevoPaciente.email,
      nombre: nuevoPaciente.nombre,
      apellido: nuevoPaciente.apellido,
      role: UserRole.PACIENTE,
      fechaNacimiento: nuevoPaciente.fechaNacimiento,
      direccion: nuevoPaciente.direccion,
      telefono: nuevoPaciente.telefono,
      habilitado2FA: configSeguridad?.autenticacionDosFactores ?? false,
      aceptaTerminos: configSeguridad?.aceptaTerminos ?? false,
      aceptaConsentimiento: configSeguridad?.aceptaConsentimiento ?? false,
      firstAppointment: false,
      genero: nuevoPaciente.genero,
      numeroDocumento: nuevoPaciente.numeroDocumento
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

  /**
   * Envía código de autenticación por WhatsApp al número del paciente.
   */
  async sendWhatsAppCode(celular: string): Promise<{ message: string }> {
    const result = await envioCodigoWhatsApp(celular);
    return { message: result.message };
  }

  /**
   * Verifica el código WhatsApp y devuelve token y usuario si es un paciente registrado.
   */
  async verifyWhatsAppAndLogin(celular: string, codigo: string): Promise<AuthResponse> {
    const ok = await verificarCodigoWhatsApp(celular, codigo);
    if (!ok) {
      throw new AppError('Código inválido o expirado', 401);
    }

    const formattedPhone = normalizarTelefono(celular);
    const sinPrefijo = formattedPhone.replace(/^\+57/, '').trim();

    const paciente = await Paciente.findOne({
      $or: [
        { telefono: formattedPhone },
        { telefono: sinPrefijo },
        { telefono: formattedPhone.replace(/\s/g, '') }
      ],
      activo: true
    });

    if (!paciente) {
      throw new AppError('No hay una cuenta de paciente asociada a este número', 404);
    }

    const token = generateToken(paciente._id.toString(), UserRole.PACIENTE);
    const userResponse: AuthResponse['user'] = {
      _id: paciente._id.toString(),
      email: paciente.email,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      role: UserRole.PACIENTE,
      fechaNacimiento: paciente.fechaNacimiento,
      direccion: paciente.direccion,
      telefono: paciente.telefono
    };

    return {
      token,
      user: userResponse
    };
  }

  /**
   * Envía código 2FA por WhatsApp. En desarrollo acepta celular opcional para enviar a otro número.
   */
  async sendWhatsAppCode2FA(userId: string, celularOverride?: string): Promise<{ message: string }> {
    const paciente = await Paciente.findById(userId);
    if (!paciente) {
      throw new AppError('Paciente no encontrado', 404);
    }
    const esDesarrollo = process.env.NODE_ENV !== 'production';
    const telefono = (esDesarrollo && celularOverride?.trim()) ? celularOverride.trim() : (paciente.telefono || '');
    if (!telefono || !telefono.trim()) {
      throw new AppError('No tienes un número de WhatsApp registrado. Actualiza tu perfil.', 400);
    }
    const result = await envioCodigoWhatsApp(telefono);
    return { message: result.message };
  }

  /**
   * Verifica el código 2FA WhatsApp. En desarrollo acepta celular opcional (debe ser el mismo al que se envió el código).
   */
  async verifyWhatsAppCode2FA(userId: string, codigo: string, celularOverride?: string): Promise<void> {
    const paciente = await Paciente.findById(userId);
    if (!paciente) {
      throw new AppError('Paciente no encontrado', 404);
    }
    const esDesarrollo = process.env.NODE_ENV !== 'production';
    const telefono = (esDesarrollo && celularOverride?.trim()) ? celularOverride.trim() : (paciente.telefono || '');
    if (!telefono || !telefono.trim()) {
      throw new AppError('No hay número de WhatsApp registrado', 400);
    }
    const ok = await verificarCodigoWhatsApp(telefono, codigo);
    if (!ok) {
      throw new AppError('Código inválido o expirado', 401);
    }
  }
}

export default new AuthService();

