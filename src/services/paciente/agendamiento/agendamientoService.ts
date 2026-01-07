import Medico from '../../../models/Medico';
import Cita from '../../../models/Cita';
import ConfiguracionAgenda from '../../../models/ConfiguracionAgenda';
import { Cita as ICita } from '../../../types';

export interface MedicoDisponible {
  _id: string;
  nombre: string;
  apellido: string;
  especialidad?: string;
  disponibilidad?: string;
}

export interface HorarioDisponible {
  fecha: string;
  hora: string;
  disponible: boolean;
}

class AgendamientoService {
  async obtenerMedicosDisponibles(busqueda?: string): Promise<MedicoDisponible[]> {
    const query: any = { activo: true };
    
    if (busqueda) {
      query.$or = [
        { nombre: { $regex: busqueda, $options: 'i' } },
        { apellido: { $regex: busqueda, $options: 'i' } },
        { especialidad: { $regex: busqueda, $options: 'i' } }
      ];
    }

    const medicos = await Medico.find(query)
      .select('nombre apellido especialidad')
      .lean();

    return medicos.map(medico => ({
      _id: medico._id.toString(),
      nombre: medico.nombre,
      apellido: medico.apellido,
      especialidad: medico.especialidad,
      disponibilidad: 'Consultar disponibilidad'
    }));
  }

  async obtenerMedicoPorId(medicoId: string): Promise<MedicoDisponible | null> {
    const medico = await Medico.findById(medicoId)
      .select('nombre apellido especialidad')
      .lean();

    if (!medico) {
      return null;
    }

    return {
      _id: medico._id.toString(),
      nombre: medico.nombre,
      apellido: medico.apellido,
      especialidad: medico.especialidad,
      disponibilidad: 'Consultar disponibilidad'
    };
  }

  async obtenerHorariosDisponibles(medicoId: string, fecha: string): Promise<HorarioDisponible[]> {
    const configuracion = await ConfiguracionAgenda.findOne({ medico: medicoId });
    
    if (!configuracion) {
      return [];
    }

    const fechaObj = new Date(fecha);
    const diaSemana = this.obtenerDiaSemana(fechaObj);
    const jornada = configuracion.jornadas.find(j => j.dia === diaSemana && j.activa);

    if (!jornada) {
      return [];
    }

    const horarios: HorarioDisponible[] = [];
    const [horaInicio, minutoInicio] = jornada.horaInicio.split(':').map(Number);
    const [horaFin, minutoFin] = jornada.horaFin.split(':').map(Number);

    let horaActual = horaInicio * 60 + minutoInicio;
    const horaFinMinutos = horaFin * 60 + minutoFin;

    while (horaActual + jornada.duracionConsulta <= horaFinMinutos) {
      const horaFormato = this.formatearHora(horaActual);
      
      const estaEnInactividad = jornada.tiemposInactividad.some(inactividad => {
        const [inicioH, inicioM] = inactividad.inicio.split(':').map(Number);
        const [finH, finM] = inactividad.fin.split(':').map(Number);
        const inicioMinutos = inicioH * 60 + inicioM;
        const finMinutos = finH * 60 + finM;
        return horaActual >= inicioMinutos && horaActual < finMinutos;
      });

      if (!estaEnInactividad) {
        const fechaHoraCompleta = new Date(fechaObj);
        fechaHoraCompleta.setHours(Math.floor(horaActual / 60), horaActual % 60, 0, 0);

        const citasExistentes = await Cita.find({
          medicoId,
          fecha: {
            $gte: new Date(fechaHoraCompleta.setHours(0, 0, 0, 0)),
            $lt: new Date(fechaHoraCompleta.setHours(23, 59, 59, 999))
          },
          estado: { $in: ['pendiente', 'confirmada'] }
        });

        const horaOcupada = citasExistentes.some(cita => {
          const [citaHora, citaMinuto] = cita.hora.split(':').map(Number);
          const citaMinutos = citaHora * 60 + citaMinuto;
          const diferenciaMinutos = Math.abs(citaMinutos - horaActual);
          return diferenciaMinutos < jornada.duracionConsulta;
        });

        horarios.push({
          fecha: fecha,
          hora: horaFormato,
          disponible: !horaOcupada
        });
      }

      horaActual += jornada.duracionConsulta;
    }

    return horarios;
  }

  async crearCita(
    citaData: Omit<ICita, '_id' | 'createdAt' | 'updatedAt' | 'estado'>,
    creadoPor?: string,
    creadoPorRol?: string
  ): Promise<ICita> {
    const horaFormato24 = this.convertirHoraA24Horas(citaData.hora);
    
    const nuevaCita = await Cita.create({
      ...citaData,
      hora: horaFormato24,
      estado: 'pendiente',
      creadoPor: creadoPor ? citaData.pacienteId : undefined,
      creadoPorRol: creadoPorRol || 'Paciente'
    });

    return {
      _id: nuevaCita._id.toString(),
      pacienteId: nuevaCita.pacienteId.toString(),
      medicoId: nuevaCita.medicoId.toString(),
      fecha: nuevaCita.fecha,
      hora: nuevaCita.hora,
      tipo: nuevaCita.tipo,
      modalidad: nuevaCita.modalidad,
      estado: nuevaCita.estado,
      creadoPor: nuevaCita.creadoPor?.toString(),
      creadoPorRol: nuevaCita.creadoPorRol,
      createdAt: nuevaCita.createdAt,
      updatedAt: nuevaCita.updatedAt
    };
  }

  async obtenerCitasPaciente(pacienteId: string): Promise<(ICita & { pacienteNombre?: string; pacienteApellido?: string })[]> {
    const citas = await Cita.find({ pacienteId })
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('pacienteId', 'nombre apellido')
      .sort({ fecha: 1, hora: 1 })
      .lean();

    return citas.map(cita => {
      let medicoIdStr: string;
      
      if (typeof cita.medicoId === 'object' && cita.medicoId !== null && '_id' in cita.medicoId) {
        medicoIdStr = (cita.medicoId as any)._id.toString();
      } else {
        medicoIdStr = (cita.medicoId as any).toString();
      }

      return {
        _id: cita._id.toString(),
        pacienteId: cita.pacienteId.toString(),
        medicoId: medicoIdStr,
        fecha: cita.fecha,
        hora: this.formatearHoraDesde24Horas(cita.hora),
        tipo: cita.tipo,
        modalidad: cita.modalidad,
        estado: cita.estado,
        createdAt: cita.createdAt,
        updatedAt: cita.updatedAt
      };
    });
  }

  async cancelarCita(
    citaId: string, 
    pacienteId: string, 
    motivoCancelacion: string,
    canceladoPor?: string,
    canceladoPorRol?: string
  ): Promise<ICita> {
    const cita = await Cita.findOne({ _id: citaId, pacienteId });

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
    cita.canceladoPor = canceladoPor ? cita.pacienteId : undefined;
    cita.canceladoPorRol = canceladoPorRol || 'Paciente';
    await cita.save();

    return {
      _id: cita._id.toString(),
      pacienteId: cita.pacienteId.toString(),
      medicoId: cita.medicoId.toString(),
      fecha: cita.fecha,
      hora: cita.hora,
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

  private obtenerDiaSemana(fecha: Date): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias[fecha.getDay()];
  }

  private formatearHora(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    const periodo = horas >= 12 ? 'PM' : 'AM';
    const horas12 = horas > 12 ? horas - 12 : horas === 0 ? 12 : horas;
    return `${horas12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${periodo}`;
  }

  private convertirHoraA24Horas(hora: string): string {
    const horaSinEspacios = hora.trim();
    const tieneAMPM = horaSinEspacios.includes('AM') || horaSinEspacios.includes('PM');
    
    if (!tieneAMPM) {
      return horaSinEspacios;
    }

    const [tiempo, periodo] = horaSinEspacios.split(/(AM|PM)/i);
    const [horasStr, minutosStr] = tiempo.split(':').map(s => s.trim());
    let horas = parseInt(horasStr, 10);
    const minutos = minutosStr ? parseInt(minutosStr, 10) : 0;

    if (periodo.toUpperCase() === 'PM' && horas !== 12) {
      horas += 12;
    } else if (periodo.toUpperCase() === 'AM' && horas === 12) {
      horas = 0;
    }

    return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
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

