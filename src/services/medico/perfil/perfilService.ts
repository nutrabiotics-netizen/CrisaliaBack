import Medico from '../../../models/Medico';
import { IMedico } from '../../../models/Medico';

export interface UpdatePerfilMedicoData {
  nombre?: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  especialidad?: string;
  numeroColegiatura?: string;
  logoUrl?: string;
  firmaUrl?: string;
  indicacionesAntesConsulta?: string;
}

class PerfilMedicoService {
  async obtenerPerfilMedico(medicoId: string): Promise<IMedico | null> {
    const medico = await Medico.findById(medicoId)
      .select('-password')
      .lean();
    
    return medico as IMedico | null;
  }

  async actualizarPerfilMedico(
    medicoId: string,
    datosActualizacion: UpdatePerfilMedicoData
  ): Promise<IMedico> {
    const medico = await Medico.findById(medicoId);

    if (!medico) {
      throw new Error('Médico no encontrado');
    }

    // Actualizar solo los campos proporcionados
    if (datosActualizacion.nombre !== undefined) {
      medico.nombre = datosActualizacion.nombre;
    }
    if (datosActualizacion.apellido !== undefined) {
      medico.apellido = datosActualizacion.apellido;
    }
    if (datosActualizacion.email !== undefined) {
      medico.email = datosActualizacion.email.toLowerCase().trim();
    }
    if (datosActualizacion.telefono !== undefined) {
      medico.telefono = datosActualizacion.telefono;
    }
    if (datosActualizacion.especialidad !== undefined) {
      medico.especialidad = datosActualizacion.especialidad;
    }
    if (datosActualizacion.numeroColegiatura !== undefined) {
      medico.numeroColegiatura = datosActualizacion.numeroColegiatura;
    }
    if (datosActualizacion.logoUrl !== undefined) {
      medico.logoUrl = datosActualizacion.logoUrl || undefined;
    }
    if (datosActualizacion.firmaUrl !== undefined) {
      medico.firmaUrl = datosActualizacion.firmaUrl || undefined;
    }
    if (datosActualizacion.indicacionesAntesConsulta !== undefined) {
      medico.indicacionesAntesConsulta = datosActualizacion.indicacionesAntesConsulta ?? '';
    }

    await medico.save();

    // Retornar sin password
    const medicoActualizado = await Medico.findById(medicoId)
      .select('-password')
      .lean();

    return medicoActualizado as IMedico;
  }
}

export default new PerfilMedicoService();
