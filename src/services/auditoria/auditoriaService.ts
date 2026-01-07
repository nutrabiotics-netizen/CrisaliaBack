import Auditoria, { AccionTipo, EntidadTipo, IAuditoria } from '../../models/Auditoria';
import { UserRole } from '../../types';

export interface LogData {
  usuarioId: string;
  usuarioRol: UserRole;
  usuarioEmail?: string;
  usuarioNombre?: string;
  accion: AccionTipo;
  entidad: EntidadTipo;
  entidadId: string;
  datosAnteriores?: Record<string, any>;
  datosNuevos?: Record<string, any>;
  motivo?: string;
  ip?: string;
  userAgent?: string;
}

class AuditoriaService {
  async crearLog(logData: LogData): Promise<IAuditoria> {
    const log = await Auditoria.create({
      usuarioId: logData.usuarioId,
      usuarioRol: logData.usuarioRol,
      usuarioEmail: logData.usuarioEmail,
      usuarioNombre: logData.usuarioNombre,
      accion: logData.accion,
      entidad: logData.entidad,
      entidadId: logData.entidadId,
      datosAnteriores: logData.datosAnteriores,
      datosNuevos: logData.datosNuevos,
      motivo: logData.motivo,
      ip: logData.ip,
      userAgent: logData.userAgent
    });

    return log;
  }

  async obtenerLogsPorEntidad(entidad: EntidadTipo, entidadId: string): Promise<IAuditoria[]> {
    return Auditoria.find({ entidad, entidadId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async obtenerLogsPorUsuario(usuarioId: string, limite: number = 50): Promise<IAuditoria[]> {
    return Auditoria.find({ usuarioId })
      .sort({ createdAt: -1 })
      .limit(limite)
      .lean();
  }

  async obtenerLogsPorAccion(accion: AccionTipo, entidad?: EntidadTipo, limite: number = 100): Promise<IAuditoria[]> {
    const query: any = { accion };
    if (entidad) {
      query.entidad = entidad;
    }
    
    return Auditoria.find(query)
      .sort({ createdAt: -1 })
      .limit(limite)
      .lean();
  }
}

export default new AuditoriaService();

