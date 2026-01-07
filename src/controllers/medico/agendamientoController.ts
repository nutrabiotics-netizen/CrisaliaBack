import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ConfiguracionAgenda, { IJornadaConfig } from '../../models/ConfiguracionAgenda';
import agendamientoService from '../../services/medico/agendamiento/agendamientoService';
import { registrarAccion } from '../../utils/auditoriaHelper';
import Cita from '../../models/Cita';

export const obtenerConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    let configuracion = await ConfiguracionAgenda.findOne({ medico: medicoId });

    // Si no existe configuración, crear una por defecto
    if (!configuracion) {
      const jornadasPorDefecto: IJornadaConfig[] = [
        { dia: 'Lunes', activa: true, horaInicio: '08:00', horaFin: '18:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [{ inicio: '12:00', fin: '13:00', tipo: 'Almuerzo' }] },
        { dia: 'Martes', activa: true, horaInicio: '08:00', horaFin: '18:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [{ inicio: '12:00', fin: '13:00', tipo: 'Almuerzo' }] },
        { dia: 'Miércoles', activa: true, horaInicio: '08:00', horaFin: '18:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [{ inicio: '12:00', fin: '13:00', tipo: 'Almuerzo' }] },
        { dia: 'Jueves', activa: true, horaInicio: '08:00', horaFin: '18:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [{ inicio: '12:00', fin: '13:00', tipo: 'Almuerzo' }] },
        { dia: 'Viernes', activa: true, horaInicio: '08:00', horaFin: '18:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [{ inicio: '12:00', fin: '13:00', tipo: 'Almuerzo' }] },
        { dia: 'Sábado', activa: false, horaInicio: '08:00', horaFin: '13:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [] },
        { dia: 'Domingo', activa: false, horaInicio: '08:00', horaFin: '13:00', modalidad: 'presencial', duracionConsulta: 30, tiemposInactividad: [] },
      ];

      configuracion = await ConfiguracionAgenda.create({
        medico: medicoId,
        direccionConsultorio: '',
        optimizacionAutomatica: true,
        flexibilidadReubicacion: false,
        jornadas: jornadasPorDefecto,
        notificacionesAgendamiento: {
          notificacionAutomaticaPaciente: true,
          recordatorio24Horas: true,
          recordatorio2Horas: true,
          notificacionMedicoPreconsulta: true,
          notificacionMedicoConsulta: true,
          notificacionMedicoControl: true
        }
      });
    }

    res.json({
      success: true,
      data: configuracion
    });
  } catch (error: any) {
    console.error('Error al obtener configuración de agenda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la configuración de agenda',
      error: error.message
    });
  }
};

export const guardarConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    const { direccionConsultorio, optimizacionAutomatica, flexibilidadReubicacion, jornadas, notificacionesAgendamiento } = req.body;

    // Validar datos requeridos
    if (!jornadas || !Array.isArray(jornadas)) {
      res.status(400).json({
        success: false,
        message: 'Las jornadas son requeridas y deben ser un array'
      });
      return;
    }

    // Buscar configuración existente o crear nueva
    let configuracion = await ConfiguracionAgenda.findOne({ medico: medicoId });

    if (configuracion) {
      // Actualizar configuración existente
      configuracion.direccionConsultorio = direccionConsultorio || '';
      configuracion.optimizacionAutomatica = optimizacionAutomatica !== undefined ? optimizacionAutomatica : true;
      configuracion.flexibilidadReubicacion = flexibilidadReubicacion !== undefined ? flexibilidadReubicacion : false;
      configuracion.jornadas = jornadas;
      if (notificacionesAgendamiento) {
        configuracion.notificacionesAgendamiento = {
          ...configuracion.notificacionesAgendamiento,
          ...notificacionesAgendamiento
        };
      }
      await configuracion.save();
    } else {
      // Crear nueva configuración
      const notificacionesPorDefecto = notificacionesAgendamiento || {
        notificacionAutomaticaPaciente: true,
        recordatorio24Horas: true,
        recordatorio2Horas: true,
        notificacionMedicoPreconsulta: true,
        notificacionMedicoConsulta: true,
        notificacionMedicoControl: true
      };
      
      configuracion = await ConfiguracionAgenda.create({
        medico: medicoId,
        direccionConsultorio: direccionConsultorio || '',
        optimizacionAutomatica: optimizacionAutomatica !== undefined ? optimizacionAutomatica : true,
        flexibilidadReubicacion: flexibilidadReubicacion !== undefined ? flexibilidadReubicacion : false,
        jornadas: jornadas,
        notificacionesAgendamiento: notificacionesPorDefecto
      });
    }

    res.json({
      success: true,
      message: 'Configuración de agenda guardada exitosamente',
      data: configuracion
    });
  } catch (error: any) {
    console.error('Error al guardar configuración de agenda:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar la configuración de agenda',
      error: error.message
    });
  }
};

export const obtenerCitas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { fechaInicio, fechaFin } = req.query;
    const fechaInicioObj = fechaInicio ? new Date(fechaInicio as string) : undefined;
    const fechaFinObj = fechaFin ? new Date(fechaFin as string) : undefined;

    const citas = await agendamientoService.obtenerCitasMedico(medicoId, fechaInicioObj, fechaFinObj);

    res.json({
      success: true,
      data: citas
    });
  } catch (error: any) {
    console.error('Error al obtener citas del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener citas',
      error: error.message
    });
  }
};

export const obtenerCitasHoy = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const citas = await agendamientoService.obtenerCitasHoy(medicoId);

    res.json({
      success: true,
      data: citas
    });
  } catch (error: any) {
    console.error('Error al obtener citas de hoy:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener citas de hoy',
      error: error.message
    });
  }
};

export const confirmarCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener cita anterior para auditoría
    const citaAnterior = await Cita.findById(citaId).lean();
    if (!citaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Cita no encontrada'
      });
      return;
    }

    const datosAnteriores = {
      estado: citaAnterior.estado
    };

    const cita = await agendamientoService.confirmarCita(citaId, medicoId, medicoId, 'Medico');

    // Registrar en auditoría
    await registrarAccion(
      req,
      'confirmar',
      'Cita',
      citaId,
      datosAnteriores,
      {
        estado: cita.estado,
        actualizadoPor: cita.actualizadoPor,
        actualizadoPorRol: cita.actualizadoPorRol
      }
    );

    res.json({
      success: true,
      message: 'Cita confirmada exitosamente',
      data: cita
    });
  } catch (error: any) {
    console.error('Error al confirmar cita:', error);
    
    if (error.message === 'Cita no encontrada') {
      res.status(404).json({
        success: false,
        message: error.message
      });
      return;
    }

    if (error.message === 'No se puede confirmar una cita cancelada' || error.message === 'La cita ya está completada') {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error al confirmar cita',
      error: error.message
    });
  }
};

export const cancelarCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;
    const { motivoCancelacion } = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    if (!motivoCancelacion || motivoCancelacion.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'El motivo de cancelación es requerido'
      });
      return;
    }

    // Obtener cita anterior para auditoría
    const citaAnterior = await Cita.findById(citaId).lean();
    if (!citaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Cita no encontrada'
      });
      return;
    }

    const datosAnteriores = {
      estado: citaAnterior.estado,
      motivoCancelacion: citaAnterior.motivoCancelacion
    };

    const cita = await agendamientoService.cancelarCitaMedico(
      citaId, 
      medicoId,
      motivoCancelacion,
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'cancelar',
      'Cita',
      citaId,
      datosAnteriores,
      {
        estado: cita.estado,
        motivoCancelacion: cita.motivoCancelacion,
        canceladoPor: cita.canceladoPor,
        canceladoPorRol: cita.canceladoPorRol
      },
      motivoCancelacion
    );

    res.json({
      success: true,
      message: 'Cita cancelada exitosamente',
      data: cita
    });
  } catch (error: any) {
    console.error('Error al cancelar cita:', error);
    
    if (error.message === 'Cita no encontrada') {
      res.status(404).json({
        success: false,
        message: error.message
      });
      return;
    }

    if (error.message === 'La cita ya está cancelada' || error.message === 'No se puede cancelar una cita completada') {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error al cancelar cita',
      error: error.message
    });
  }
};

