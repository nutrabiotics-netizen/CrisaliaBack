import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import agendamientoService from '../../../services/paciente/agendamiento/agendamientoService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import Cita from '../../../models/Cita';

export const obtenerMedicosDisponibles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const busqueda = req.query.busqueda as string | undefined;
    const medicos = await agendamientoService.obtenerMedicosDisponibles(busqueda);

    res.json({
      success: true,
      data: medicos
    });
  } catch (error: any) {
    console.error('Error al obtener médicos disponibles:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener médicos disponibles',
      error: error.message
    });
  }
};

export const obtenerMedicoPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const medico = await agendamientoService.obtenerMedicoPorId(medicoId);

    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: medico
    });
  } catch (error: any) {
    console.error('Error al obtener médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener médico',
      error: error.message
    });
  }
};

export const obtenerHorariosDisponibles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const { fecha } = req.query;

    if (!fecha) {
      res.status(400).json({
        success: false,
        message: 'La fecha es requerida'
      });
      return;
    }

    const horarios = await agendamientoService.obtenerHorariosDisponibles(medicoId, fecha as string);

    res.json({
      success: true,
      data: horarios
    });
  } catch (error: any) {
    console.error('Error al obtener horarios disponibles:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener horarios disponibles',
      error: error.message
    });
  }
};

export const crearCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { medicoId, fecha, hora, tipo, modalidad } = req.body;

    if (!medicoId || !fecha || !hora || !tipo || !modalidad) {
      res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos: medicoId, fecha, hora, tipo, modalidad'
      });
      return;
    }

    if (!['preconsulta', 'consulta', 'control'].includes(tipo)) {
      res.status(400).json({
        success: false,
        message: 'Tipo de cita inválido. Debe ser: preconsulta, consulta o control'
      });
      return;
    }

    if (!['presencial', 'virtual'].includes(modalidad)) {
      res.status(400).json({
        success: false,
        message: 'Modalidad inválida. Debe ser: presencial o virtual'
      });
      return;
    }

    const fechaObj = new Date(fecha);
    if (isNaN(fechaObj.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Fecha inválida'
      });
      return;
    }

    const cita = await agendamientoService.crearCita({
      pacienteId,
      medicoId,
      fecha: fechaObj,
      hora,
      tipo,
      modalidad
    }, pacienteId, 'Paciente');

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'Cita',
      cita._id!,
      undefined,
      {
        pacienteId: cita.pacienteId,
        medicoId: cita.medicoId,
        fecha: cita.fecha,
        hora: cita.hora,
        tipo: cita.tipo,
        estado: cita.estado
      }
    );

    res.status(201).json({
      success: true,
      message: 'Cita creada exitosamente',
      data: cita
    });
  } catch (error: any) {
    console.error('Error al crear cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear cita',
      error: error.message
    });
  }
};

export const obtenerCitasPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const citas = await agendamientoService.obtenerCitasPaciente(pacienteId);

    res.json({
      success: true,
      data: citas
    });
  } catch (error: any) {
    console.error('Error al obtener citas del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener citas',
      error: error.message
    });
  }
};

export const cancelarCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    const { motivoCancelacion } = req.body;

    if (!pacienteId) {
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

    const cita = await agendamientoService.cancelarCita(
      citaId, 
      pacienteId, 
      motivoCancelacion,
      pacienteId,
      'Paciente'
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

