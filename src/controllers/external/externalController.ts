import { Response } from 'express';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import Cita from '../../models/Cita';
import HistoriaClinica from '../../models/HistoriaClinica';
import FormulaMedica from '../../models/FormulaMedica';
import Interrogatorio from '../../models/Interrogatorio';
import Cups2026 from '../../models/Cups2026';
import ConfiguracionAgenda from '../../models/ConfiguracionAgenda';

/**
 * Controlador para APIs Externas - Solo lectura
 * Proporciona endpoints de consulta para servidores externos
 */

// ==================== PACIENTES ====================

export const obtenerTodosLosPacientes = async (_req: any, res: Response): Promise<void> => {
  try {
    const pacientes = await Paciente.find({ activo: true })
      .select('-password')
      .lean();

    res.json({
      success: true,
      data: pacientes,
      total: pacientes.length
    });
  } catch (error: any) {
    console.error('Error al obtener pacientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener pacientes',
      error: error.message
    });
  }
};

export const obtenerPacientePorId = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const paciente = await Paciente.findById(id)
      .select('-password')
      .lean();

    if (!paciente) {
      res.status(404).json({
        success: false,
        message: 'Paciente no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: paciente
    });
  } catch (error: any) {
    console.error('Error al obtener paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener paciente',
      error: error.message
    });
  }
};

// ==================== MÉDICOS ====================

export const obtenerTodosLosMedicos = async (_req: any, res: Response): Promise<void> => {
  try {
    const medicos = await Medico.find({ activo: true })
      .select('-password')
      .lean();

    res.json({
      success: true,
      data: medicos,
      total: medicos.length
    });
  } catch (error: any) {
    console.error('Error al obtener médicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener médicos',
      error: error.message
    });
  }
};

export const obtenerMedicoPorId = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const medico = await Medico.findById(id)
      .select('-password')
      .lean();

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

// ==================== CITAS ====================

export const obtenerTodasLasCitas = async (req: any, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin, estado } = req.query;
    const query: any = {};

    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    }

    if (estado) query.estado = estado;

    const citas = await Cita.find(query)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento fechaNacimiento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .sort({ fecha: -1, hora: 1 })
      .lean();

    res.json({
      success: true,
      data: citas,
      total: citas.length
    });
  } catch (error: any) {
    console.error('Error al obtener citas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener citas',
      error: error.message
    });
  }
};

export const obtenerCitaPorId = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const cita = await Cita.findById(id)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento fechaNacimiento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .lean();

    if (!cita) {
      res.status(404).json({
        success: false,
        message: 'Cita no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: cita
    });
  } catch (error: any) {
    console.error('Error al obtener cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cita',
      error: error.message
    });
  }
};

export const obtenerCitasPorMedico = async (req: any, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const { fechaInicio, fechaFin, estado } = req.query;

    const medico = await Medico.findById(medicoId);
    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    const query: any = { medicoId };
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    }
    if (estado) query.estado = estado;

    const citas = await Cita.find(query)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento fechaNacimiento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .sort({ fecha: -1, hora: 1 })
      .lean();

    res.json({
      success: true,
      data: citas,
      total: citas.length,
      medico: {
        _id: medico._id.toString(),
        nombre: medico.nombre,
        apellido: medico.apellido,
        especialidad: medico.especialidad
      }
    });
  } catch (error: any) {
    console.error('Error al obtener citas del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener citas del médico',
      error: error.message
    });
  }
};

export const obtenerCitasPorPaciente = async (req: any, res: Response): Promise<void> => {
  try {
    const { pacienteId } = req.params;
    const { fechaInicio, fechaFin, estado } = req.query;

    const paciente = await Paciente.findById(pacienteId);
    if (!paciente) {
      res.status(404).json({
        success: false,
        message: 'Paciente no encontrado'
      });
      return;
    }

    const query: any = { pacienteId };
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    }
    if (estado) query.estado = estado;

    const citas = await Cita.find(query)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento fechaNacimiento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .sort({ fecha: -1, hora: 1 })
      .lean();

    res.json({
      success: true,
      data: citas,
      total: citas.length,
      paciente: {
        _id: paciente._id.toString(),
        nombre: paciente.nombre,
        apellido: paciente.apellido,
        email: paciente.email
      }
    });
  } catch (error: any) {
    console.error('Error al obtener citas del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener citas del paciente',
      error: error.message
    });
  }
};

// ==================== HISTORIAS CLÍNICAS ====================

export const obtenerTodasLasHistoriasClinicas = async (req: any, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin, pacienteId, medicoId } = req.query;
    const query: any = {};

    if (fechaInicio || fechaFin) {
      query.fechaRegistro = {};
      if (fechaInicio) query.fechaRegistro.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fechaRegistro.$lte = new Date(fechaFin as string);
    }
    if (pacienteId) query.pacienteId = pacienteId;
    if (medicoId) query.medicoId = medicoId;

    const historias = await HistoriaClinica.find(query)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ fechaRegistro: -1 })
      .lean();

    res.json({
      success: true,
      data: historias,
      total: historias.length
    });
  } catch (error: any) {
    console.error('Error al obtener historias clínicas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historias clínicas',
      error: error.message
    });
  }
};

export const obtenerHistoriaClinicaPorId = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const historia = await HistoriaClinica.findById(id)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    if (!historia) {
      res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: historia
    });
  } catch (error: any) {
    console.error('Error al obtener historia clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historia clínica',
      error: error.message
    });
  }
};

export const obtenerHistoriasClinicasPorPaciente = async (req: any, res: Response): Promise<void> => {
  try {
    const { pacienteId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const paciente = await Paciente.findById(pacienteId);
    if (!paciente) {
      res.status(404).json({
        success: false,
        message: 'Paciente no encontrado'
      });
      return;
    }

    const query: any = { pacienteId };
    if (fechaInicio || fechaFin) {
      query.fechaRegistro = {};
      if (fechaInicio) query.fechaRegistro.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fechaRegistro.$lte = new Date(fechaFin as string);
    }

    const historias = await HistoriaClinica.find(query)
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ fechaRegistro: -1 })
      .lean();

    res.json({
      success: true,
      data: historias,
      total: historias.length,
      paciente: {
        _id: paciente._id.toString(),
        nombre: paciente.nombre,
        apellido: paciente.apellido
      }
    });
  } catch (error: any) {
    console.error('Error al obtener historias clínicas del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historias clínicas del paciente',
      error: error.message
    });
  }
};

export const obtenerHistoriasClinicasPorMedico = async (req: any, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const medico = await Medico.findById(medicoId);
    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    const query: any = { medicoId };
    if (fechaInicio || fechaFin) {
      query.fechaRegistro = {};
      if (fechaInicio) query.fechaRegistro.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fechaRegistro.$lte = new Date(fechaFin as string);
    }

    const historias = await HistoriaClinica.find(query)
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .sort({ fechaRegistro: -1 })
      .lean();

    res.json({
      success: true,
      data: historias,
      total: historias.length,
      medico: {
        _id: medico._id.toString(),
        nombre: medico.nombre,
        apellido: medico.apellido,
        especialidad: medico.especialidad
      }
    });
  } catch (error: any) {
    console.error('Error al obtener historias clínicas del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historias clínicas del médico',
      error: error.message
    });
  }
};

export const obtenerHistoriaClinicaPorCita = async (req: any, res: Response): Promise<void> => {
  try {
    const { citaId } = req.params;
    const historia = await HistoriaClinica.findOne({ citaId })
      .populate('pacienteId', 'nombre apellido email telefono tipoDocumento numeroDocumento')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo modalidad estado')
      .lean();

    if (!historia) {
      res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: historia
    });
  } catch (error: any) {
    console.error('Error al obtener historia clínica por cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historia clínica por cita',
      error: error.message
    });
  }
};

// ==================== FÓRMULAS MÉDICAS ====================

export const obtenerTodasLasFormulasMedicas = async (req: any, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin, pacienteId, medicoId } = req.query;
    const query: any = {};

    if (fechaInicio || fechaFin) {
      query.createdAt = {};
      if (fechaInicio) query.createdAt.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.createdAt.$lte = new Date(fechaFin as string);
    }
    if (pacienteId) query.pacienteId = pacienteId;
    if (medicoId) query.medicoId = medicoId;

    const formulas = await FormulaMedica.find(query)
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo estado')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: formulas,
      total: formulas.length
    });
  } catch (error: any) {
    console.error('Error al obtener fórmulas médicas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener fórmulas médicas',
      error: error.message
    });
  }
};

export const obtenerFormulaMedicaPorId = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const formula = await FormulaMedica.findById(id)
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo estado')
      .lean();

    if (!formula) {
      res.status(404).json({
        success: false,
        message: 'Fórmula médica no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: formula
    });
  } catch (error: any) {
    console.error('Error al obtener fórmula médica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener fórmula médica',
      error: error.message
    });
  }
};

export const obtenerFormulasMedicasPorPaciente = async (req: any, res: Response): Promise<void> => {
  try {
    const { pacienteId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const paciente = await Paciente.findById(pacienteId);
    if (!paciente) {
      res.status(404).json({
        success: false,
        message: 'Paciente no encontrado'
      });
      return;
    }

    const query: any = { pacienteId };
    if (fechaInicio || fechaFin) {
      query.createdAt = {};
      if (fechaInicio) query.createdAt.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.createdAt.$lte = new Date(fechaFin as string);
    }

    const formulas = await FormulaMedica.find(query)
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo estado')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: formulas,
      total: formulas.length,
      paciente: {
        _id: paciente._id.toString(),
        nombre: paciente.nombre,
        apellido: paciente.apellido
      }
    });
  } catch (error: any) {
    console.error('Error al obtener fórmulas médicas del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener fórmulas médicas del paciente',
      error: error.message
    });
  }
};

export const obtenerFormulasMedicasPorCita = async (req: any, res: Response): Promise<void> => {
  try {
    const { citaId } = req.params;
    const formula = await FormulaMedica.findOne({ citaId })
      .populate('pacienteId', 'nombre apellido email telefono')
      .populate('medicoId', 'nombre apellido especialidad numeroColegiatura')
      .populate('citaId', 'fecha hora tipo estado')
      .lean();

    if (!formula) {
      res.status(404).json({
        success: false,
        message: 'Fórmula médica no encontrada para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: formula
    });
  } catch (error: any) {
    console.error('Error al obtener fórmula médica por cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener fórmula médica por cita',
      error: error.message
    });
  }
};

// ==================== INTERROGATORIOS ====================

export const obtenerInterrogatoriosPorPaciente = async (req: any, res: Response): Promise<void> => {
  try {
    const { pacienteId } = req.params;
    const { tipo, estado } = req.query;

    const paciente = await Paciente.findById(pacienteId);
    if (!paciente) {
      res.status(404).json({
        success: false,
        message: 'Paciente no encontrado'
      });
      return;
    }

    const query: any = { pacienteId };
    if (tipo) query.tipo = tipo;
    if (estado) query.estado = estado;

    const interrogatorios = await Interrogatorio.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: interrogatorios,
      total: interrogatorios.length,
      paciente: {
        _id: paciente._id.toString(),
        nombre: paciente.nombre,
        apellido: paciente.apellido
      }
    });
  } catch (error: any) {
    console.error('Error al obtener interrogatorios del paciente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interrogatorios del paciente',
      error: error.message
    });
  }
};

export const obtenerInterrogatorioPorId = async (req: any, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const interrogatorio = await Interrogatorio.findById(id)
      .populate('pacienteId', 'nombre apellido email telefono')
      .lean();

    if (!interrogatorio) {
      res.status(404).json({
        success: false,
        message: 'Interrogatorio no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: interrogatorio
    });
  } catch (error: any) {
    console.error('Error al obtener interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interrogatorio',
      error: error.message
    });
  }
};

// ==================== CUPS2026 ====================

export const buscarCups2026 = async (req: any, res: Response): Promise<void> => {
  try {
    const { codigo, nombre, limit = 50 } = req.query;
    const query: any = {};

    if (codigo) {
      query.codigo = { $regex: codigo, $options: 'i' };
    }
    if (nombre) {
      query.nombre = { $regex: nombre, $options: 'i' };
    }

    const cups = await Cups2026.find(query)
      .limit(parseInt(limit as string))
      .sort({ codigo: 1 })
      .lean();

    res.json({
      success: true,
      data: cups,
      total: cups.length
    });
  } catch (error: any) {
    console.error('Error al buscar CUPS2026:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar CUPS2026',
      error: error.message
    });
  }
};

export const obtenerCups2026PorCodigo = async (req: any, res: Response): Promise<void> => {
  try {
    const { codigo } = req.params;
    const cups = await Cups2026.findOne({ codigo }).lean();

    if (!cups) {
      res.status(404).json({
        success: false,
        message: 'Código CUPS2026 no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: cups
    });
  } catch (error: any) {
    console.error('Error al obtener CUPS2026 por código:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener CUPS2026 por código',
      error: error.message
    });
  }
};

// ==================== DISPONIBILIDAD Y ESTADÍSTICAS ====================

/**
 * Obtener disponibilidad/configuración de agenda de un médico
 * GET /api/external/medicos/:medicoId/disponibilidad
 */
export const obtenerDisponibilidadMedico = async (req: any, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;

    const medico = await Medico.findById(medicoId);
    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    const configuracion = await ConfiguracionAgenda.findOne({ medico: medicoId })
      .populate('medico', 'nombre apellido especialidad')
      .lean();

    res.json({
      success: true,
      data: {
        medico: {
          _id: medico._id.toString(),
          nombre: medico.nombre,
          apellido: medico.apellido,
          especialidad: medico.especialidad
        },
        configuracion: configuracion || null,
        tieneConfiguracion: !!configuracion
      }
    });
  } catch (error: any) {
    console.error('Error al obtener disponibilidad del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener disponibilidad del médico',
      error: error.message
    });
  }
};

/**
 * Obtener estadísticas de citas por médico
 * GET /api/external/medicos/:medicoId/estadisticas-citas
 * Query params opcionales: fechaInicio, fechaFin
 */
export const obtenerEstadisticasCitasPorMedico = async (req: any, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const medico = await Medico.findById(medicoId);
    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    // Construir query base
    const query: any = { medicoId };
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    }

    // Obtener todas las citas del médico
    const citas = await Cita.find(query).lean();

    // Calcular estadísticas
    const totalCitas = citas.length;
    const porEstado = {
      pendiente: citas.filter(c => c.estado === 'pendiente').length,
      confirmada: citas.filter(c => c.estado === 'confirmada').length,
      cancelada: citas.filter(c => c.estado === 'cancelada').length,
      completada: citas.filter(c => c.estado === 'completada').length
    };

    const porTipo = {
      preconsulta: citas.filter(c => c.tipo === 'preconsulta').length,
      consulta: citas.filter(c => c.tipo === 'consulta').length,
      control: citas.filter(c => c.tipo === 'control').length
    };

    const porModalidad = {
      presencial: citas.filter(c => c.modalidad === 'presencial').length,
      virtual: citas.filter(c => c.modalidad === 'virtual').length
    };

    // Estadísticas por mes (últimos 6 meses si no hay filtro de fecha)
    const estadisticasPorMes: any[] = [];
    if (!fechaInicio && !fechaFin) {
      const ahora = new Date();
      for (let i = 5; i >= 0; i--) {
        const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        const fechaFinMes = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0);
        
        const citasMes = citas.filter(c => {
          const fechaCita = new Date(c.fecha);
          return fechaCita >= fecha && fechaCita <= fechaFinMes;
        });

        estadisticasPorMes.push({
          mes: fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' }),
          fechaInicio: fecha,
          fechaFin: fechaFinMes,
          total: citasMes.length,
          porEstado: {
            pendiente: citasMes.filter(c => c.estado === 'pendiente').length,
            confirmada: citasMes.filter(c => c.estado === 'confirmada').length,
            cancelada: citasMes.filter(c => c.estado === 'cancelada').length,
            completada: citasMes.filter(c => c.estado === 'completada').length
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        medico: {
          _id: medico._id.toString(),
          nombre: medico.nombre,
          apellido: medico.apellido,
          especialidad: medico.especialidad
        },
        periodo: {
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null
        },
        estadisticas: {
          totalCitas,
          porEstado,
          porTipo,
          porModalidad,
          porcentajeCompletadas: totalCitas > 0 
            ? Math.round((porEstado.completada / totalCitas) * 100) 
            : 0,
          porcentajeCanceladas: totalCitas > 0 
            ? Math.round((porEstado.cancelada / totalCitas) * 100) 
            : 0
        },
        estadisticasPorMes: estadisticasPorMes.length > 0 ? estadisticasPorMes : null
      }
    });
  } catch (error: any) {
    console.error('Error al obtener estadísticas de citas del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas de citas del médico',
      error: error.message
    });
  }
};

/**
 * Obtener cantidad de citas por médico (resumen simple)
 * GET /api/external/medicos/:medicoId/cantidad-citas
 * Query params opcionales: fechaInicio, fechaFin, estado
 */
export const obtenerCantidadCitasPorMedico = async (req: any, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const { fechaInicio, fechaFin, estado } = req.query;

    const medico = await Medico.findById(medicoId);
    if (!medico) {
      res.status(404).json({
        success: false,
        message: 'Médico no encontrado'
      });
      return;
    }

    const query: any = { medicoId };
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    }
    if (estado) query.estado = estado;

    const cantidad = await Cita.countDocuments(query);

    res.json({
      success: true,
      data: {
        medico: {
          _id: medico._id.toString(),
          nombre: medico.nombre,
          apellido: medico.apellido,
          especialidad: medico.especialidad
        },
        cantidadCitas: cantidad,
        filtros: {
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null,
          estado: estado || null
        }
      }
    });
  } catch (error: any) {
    console.error('Error al obtener cantidad de citas del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cantidad de citas del médico',
      error: error.message
    });
  }
};
