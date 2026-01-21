import Cita from '../../../models/Cita';
import { Cita as ICita } from '../../../types';
import mongoose from 'mongoose';

class AgendamientoService {
  async obtenerCitasMedico(medicoId: string, fechaInicio?: Date, fechaFin?: Date): Promise<ICita[]> {
    const query: any = { medicoId, estado: { $ne: 'cancelada' } };

    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) {
        query.fecha.$gte = fechaInicio;
      }
      if (fechaFin) {
        query.fecha.$lte = fechaFin;
      }
    }

    const citas = await Cita.find(query)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento fechaNacimiento genero sexoBiologico direccion estadoCivil grupoSanguineo rh escolaridad ocupacion condicionDesplazamiento grupoEtnico eps aseguradora')
      .sort({ fecha: 1, hora: 1 })
      .lean();

    return citas.map(cita => {
      let pacienteIdStr: string;
      let pacienteNombre: string | undefined;
      let pacienteApellido: string | undefined;
      let paciente: Record<string, unknown> | undefined;

      if (typeof cita.pacienteId === 'object' && cita.pacienteId !== null && '_id' in cita.pacienteId) {
        const pob = cita.pacienteId as any;
        pacienteIdStr = pob._id.toString();
        pacienteNombre = pob.nombre;
        pacienteApellido = pob.apellido;
        paciente = {
          _id: pob._id.toString(),
          nombre: pob.nombre,
          apellido: pob.apellido,
          email: pob.email,
          telefono: pob.telefono,
          tipoDocumento: pob.tipoDocumento,
          numeroDocumento: pob.numeroDocumento,
          fechaNacimiento: pob.fechaNacimiento,
          genero: pob.genero,
          sexoBiologico: pob.sexoBiologico,
          estadoCivil: pob.estadoCivil,
          nacionalidad: pob.nacionalidad,
          lugarResidencia: pob.lugarResidencia,
          direccion: pob.direccion,
          contactoEmergencia: pob.contactoEmergencia,
          regimenAfiliacion: pob.regimenAfiliacion,
          eps: pob.eps,
          numeroAfiliacion: pob.numeroAfiliacion,
          // Datos sociodemográficos y clínicos (perfil paciente → precargar en cita)
          grupoSanguineo: pob.grupoSanguineo,
          rh: pob.rh,
          escolaridad: pob.escolaridad,
          ocupacion: pob.ocupacion,
          condicionDesplazamiento: pob.condicionDesplazamiento,
          grupoEtnico: pob.grupoEtnico,
          aseguradora: pob.aseguradora || pob.eps,
        };
      } else {
        pacienteIdStr = (cita.pacienteId as any).toString();
      }

      const citaRetorno: ICita & { pacienteNombre?: string; pacienteApellido?: string; paciente?: Record<string, unknown> } = {
        _id: cita._id.toString(),
        pacienteId: pacienteIdStr,
        medicoId: cita.medicoId.toString(),
        fecha: cita.fecha,
        hora: this.formatearHoraDesde24Horas(cita.hora),
        tipo: cita.tipo,
        modalidad: cita.modalidad,
        estado: cita.estado,
        motivoCancelacion: cita.motivoCancelacion,
        creadoPor: cita.creadoPor?.toString(),
        creadoPorRol: cita.creadoPorRol,
        actualizadoPor: cita.actualizadoPor?.toString(),
        actualizadoPorRol: cita.actualizadoPorRol,
        canceladoPor: cita.canceladoPor?.toString(),
        canceladoPorRol: cita.canceladoPorRol,
        createdAt: cita.createdAt,
        updatedAt: cita.updatedAt
      };

      if (pacienteNombre) {
        citaRetorno.pacienteNombre = pacienteNombre;
      }
      if (pacienteApellido) {
        citaRetorno.pacienteApellido = pacienteApellido;
      }
      if (paciente) {
        citaRetorno.paciente = paciente;
      }

      return citaRetorno;
    });
  }

  async obtenerCitasHoy(medicoId: string): Promise<ICita[]> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    return this.obtenerCitasMedico(medicoId, hoy, mañana);
  }

  async confirmarCita(
    citaId: string, 
    medicoId: string,
    confirmadoPor?: string,
    confirmadoPorRol?: string
  ): Promise<ICita> {
    const cita = await Cita.findOne({ _id: citaId, medicoId });

    if (!cita) {
      throw new Error('Cita no encontrada');
    }

    if (cita.estado === 'cancelada') {
      throw new Error('No se puede confirmar una cita cancelada');
    }

    if (cita.estado === 'completada') {
      throw new Error('La cita ya está completada');
    }

    cita.estado = 'confirmada';
    cita.actualizadoPor = confirmadoPor ? cita.medicoId : undefined;
    cita.actualizadoPorRol = confirmadoPorRol || 'Medico';
    await cita.save();

    return {
      _id: cita._id.toString(),
      pacienteId: cita.pacienteId.toString(),
      medicoId: cita.medicoId.toString(),
      fecha: cita.fecha,
      hora: this.formatearHoraDesde24Horas(cita.hora),
      tipo: cita.tipo,
      modalidad: cita.modalidad,
      estado: cita.estado,
      motivoCancelacion: cita.motivoCancelacion,
      creadoPor: cita.creadoPor?.toString(),
      creadoPorRol: cita.creadoPorRol,
      actualizadoPor: cita.actualizadoPor?.toString(),
      actualizadoPorRol: cita.actualizadoPorRol,
      canceladoPor: cita.canceladoPor?.toString(),
      canceladoPorRol: cita.canceladoPorRol,
      createdAt: cita.createdAt,
      updatedAt: cita.updatedAt
    };
  }

  async cancelarCitaMedico(
    citaId: string, 
    medicoId: string,
    motivoCancelacion: string,
    canceladoPor?: string,
    canceladoPorRol?: string
  ): Promise<ICita> {
    const cita = await Cita.findOne({ _id: citaId, medicoId });

    if (!cita) {
      throw new Error('Cita no encontrada');
    }

    if (cita.estado === 'cancelada') {
      throw new Error('La cita ya está cancelada');
    }

    if (cita.estado === 'completada') {
      throw new Error('No se puede cancelar una cita completada');
    }

    cita.estado = 'cancelada';
    cita.motivoCancelacion = motivoCancelacion;
    cita.canceladoPor = canceladoPor ? cita.medicoId : undefined;
    cita.canceladoPorRol = canceladoPorRol || 'Medico';
    await cita.save();

    return {
      _id: cita._id.toString(),
      pacienteId: cita.pacienteId.toString(),
      medicoId: cita.medicoId.toString(),
      fecha: cita.fecha,
      hora: this.formatearHoraDesde24Horas(cita.hora),
      tipo: cita.tipo,
      modalidad: cita.modalidad,
      estado: cita.estado,
      motivoCancelacion: cita.motivoCancelacion,
      creadoPor: cita.creadoPor?.toString(),
      creadoPorRol: cita.creadoPorRol,
      actualizadoPor: cita.actualizadoPor?.toString(),
      actualizadoPorRol: cita.actualizadoPorRol,
      canceladoPor: cita.canceladoPor?.toString(),
      canceladoPorRol: cita.canceladoPorRol,
      createdAt: cita.createdAt,
      updatedAt: cita.updatedAt
    };
  }

  async completarCita(
    citaId: string, 
    medicoId: string,
    completadoPor?: string,
    completadoPorRol?: string
  ): Promise<ICita> {
    const cita = await Cita.findOne({ _id: citaId, medicoId });

    if (!cita) {
      throw new Error('Cita no encontrada');
    }

    if (cita.estado === 'cancelada') {
      throw new Error('No se puede completar una cita cancelada');
    }

    if (cita.estado === 'completada') {
      throw new Error('La cita ya está completada');
    }

    cita.estado = 'completada';
    cita.actualizadoPor = completadoPor ? new mongoose.Types.ObjectId(completadoPor) : cita.medicoId;
    cita.actualizadoPorRol = completadoPorRol || 'Medico';
    await cita.save();

    return {
      _id: cita._id.toString(),
      pacienteId: cita.pacienteId.toString(),
      medicoId: cita.medicoId.toString(),
      fecha: cita.fecha,
      hora: this.formatearHoraDesde24Horas(cita.hora),
      tipo: cita.tipo,
      modalidad: cita.modalidad,
      estado: cita.estado,
      motivoCancelacion: cita.motivoCancelacion,
      creadoPor: cita.creadoPor?.toString(),
      creadoPorRol: cita.creadoPorRol,
      actualizadoPor: cita.actualizadoPor?.toString(),
      actualizadoPorRol: cita.actualizadoPorRol,
      canceladoPor: cita.canceladoPor?.toString(),
      canceladoPorRol: cita.canceladoPorRol,
      createdAt: cita.createdAt,
      updatedAt: cita.updatedAt
    };
  }

  private formatearHoraDesde24Horas(hora24: string): string {
    const [horasStr, minutosStr] = hora24.split(':');
    const horas = parseInt(horasStr, 10);
    const minutos = minutosStr ? parseInt(minutosStr, 10) : 0;
    
    const periodo = horas >= 12 ? 'PM' : 'AM';
    const horas12 = horas > 12 ? horas - 12 : horas === 0 ? 12 : horas;
    
    return `${horas12.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')} ${periodo}`;
  }
}

export default new AgendamientoService();

