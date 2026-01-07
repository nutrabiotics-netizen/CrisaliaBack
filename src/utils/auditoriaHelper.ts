import { AuthRequest } from '../middleware/auth';
import auditoriaService from '../services/auditoria/auditoriaService';
import { AccionTipo, EntidadTipo } from '../models/Auditoria';
import { UserRole } from '../types';

export interface UsuarioInfo {
  id: string;
  rol: UserRole;
  email?: string;
  nombre?: string;
}

export const obtenerUsuarioInfo = async (req: AuthRequest): Promise<UsuarioInfo | null> => {
  if (!req.userId || !req.userRole) {
    return null;
  }

  // Intentar obtener información adicional del usuario desde los modelos
  let email: string | undefined;
  let nombre: string | undefined;

  try {
    if (req.userRole === UserRole.PACIENTE) {
      const Paciente = (await import('../models/Paciente')).default;
      const paciente = await Paciente.findById(req.userId).select('email nombre apellido').lean();
      if (paciente) {
        email = paciente.email;
        nombre = `${paciente.nombre} ${paciente.apellido}`;
      }
    } else if (req.userRole === UserRole.MEDICO) {
      const Medico = (await import('../models/Medico')).default;
      const medico = await Medico.findById(req.userId).select('email nombre apellido').lean();
      if (medico) {
        email = medico.email;
        nombre = `${medico.nombre} ${medico.apellido}`;
      }
    }
  } catch (error) {
    console.error('Error al obtener información del usuario:', error);
  }

  return {
    id: req.userId,
    rol: req.userRole,
    email,
    nombre
  };
};

export const obtenerIp = (req: AuthRequest): string | undefined => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    undefined
  );
};

export const obtenerUserAgent = (req: AuthRequest): string | undefined => {
  return req.headers['user-agent'];
};

export const registrarAccion = async (
  req: AuthRequest,
  accion: AccionTipo,
  entidad: EntidadTipo,
  entidadId: string,
  datosAnteriores?: Record<string, any>,
  datosNuevos?: Record<string, any>,
  motivo?: string
): Promise<void> => {
  const usuarioInfo = await obtenerUsuarioInfo(req);
  
  if (!usuarioInfo) {
    console.warn('No se pudo obtener información del usuario para registrar la acción');
    return;
  }

  try {
    await auditoriaService.crearLog({
      usuarioId: usuarioInfo.id,
      usuarioRol: usuarioInfo.rol,
      usuarioEmail: usuarioInfo.email,
      usuarioNombre: usuarioInfo.nombre,
      accion,
      entidad,
      entidadId,
      datosAnteriores,
      datosNuevos,
      motivo,
      ip: obtenerIp(req),
      userAgent: obtenerUserAgent(req)
    });
  } catch (error) {
    console.error('Error al registrar acción en auditoría:', error);
    // No lanzamos el error para no interrumpir el flujo principal
  }
};

