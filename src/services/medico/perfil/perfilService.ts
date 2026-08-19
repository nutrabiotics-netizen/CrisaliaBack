import Medico from '../../../models/Medico';
import { IMedico } from '../../../models/Medico';

const CAMPOS_PERFIL_VERIFICACION = [
  'genero', 'fechaNacimiento', 'tipoDocumento', 'numeroDocumento', 'pais', 'ciudadVivienda',
  'direccionVivienda', 'codigoPostal', 'celularContacto', 'fotoMedicoUrl', 'fotoEntornoClinicoUrl',
  'rethusTarjetaProfesional', 'tituloUniversitario', 'tituloEspecialidad', 'formacionMedicinaFuncional',
  'anosExperiencia', 'biografiaProfesional', 'subespecialidad', 'idiomas',
  'estiloPractica', 'modalidadesTerapeuticas', 'gruposInteres', 'motivosConsultaQueAtiende',
  'registroMinisterioSalud', 'direccionConsultorioHabilitado', 'telefonoLugarTrabajo'
] as const;

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
  // Campos de perfilVerificacion (el front envía todo plano)
  genero?: string;
  fechaNacimiento?: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  pais?: string;
  ciudadVivienda?: string;
  direccionVivienda?: string;
  codigoPostal?: string;
  celularContacto?: string;
  fotoMedicoUrl?: string;
  fotoEntornoClinicoUrl?: string;
  rethusTarjetaProfesional?: string;
  tituloUniversitario?: string;
  tituloEspecialidad?: string;
  formacionMedicinaFuncional?: string;
  anosExperiencia?: number;
  biografiaProfesional?: string;
  subespecialidad?: string;
  idiomas?: string[];
  estiloPractica?: string;
  modalidadesTerapeuticas?: string[];
  gruposInteres?: string[];
  motivosConsultaQueAtiende?: string[];
  registroMinisterioSalud?: string;
  direccionConsultorioHabilitado?: string;
  telefonoLugarTrabajo?: string;
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
      medico.indicacionesAntesConsulta = Array.isArray(datosActualizacion.indicacionesAntesConsulta) ? datosActualizacion.indicacionesAntesConsulta : [];
    }

    // Actualizar perfilVerificacion (campos para filtros y verificación)
    const perfilVerificacion = (medico.perfilVerificacion && typeof medico.perfilVerificacion === 'object')
      ? { ...medico.perfilVerificacion }
      : {};
    for (const key of CAMPOS_PERFIL_VERIFICACION) {
      const val = (datosActualizacion as Record<string, unknown>)[key];
      if (val !== undefined) {
        (perfilVerificacion as Record<string, unknown>)[key] = val;
      }
    }
    medico.perfilVerificacion = perfilVerificacion;

    await medico.save();

    // Retornar sin password
    const medicoActualizado = await Medico.findById(medicoId)
      .select('-password')
      .lean();

    return medicoActualizado as unknown as IMedico;
  }
}

export default new PerfilMedicoService();
