import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import ConfiguracionAgenda, { IJornadaConfig, ISedeAgenda } from '../../models/ConfiguracionAgenda';
import agendamientoService from '../../services/medico/agendamiento/agendamientoService';
import historiaClinicaService from '../../services/medico/historiaClinica/historiaClinicaService';
import formulaMedicaService from '../../services/medico/formulaMedica/formulaMedicaService';
import incapacidadService from '../../services/medico/incapacidad/incapacidadService';
import interconsultaService from '../../services/medico/interconsulta/interconsultaService';
import { registrarAccion } from '../../utils/auditoriaHelper';
import { generateCitaResumenPdf } from '../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey, getRecordingPlaybackUrl } from '../../utils/s3Documents';
import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Meeting from '../../models/Meeting';
import mongoose from 'mongoose';

const crearJornadasPorDefecto = (): IJornadaConfig[] => {
  const bloquesLab = { horaInicio: '08:00', horaFin: '18:00', modalidad: 'presencial' as const, duracionConsulta: 30, tiemposInactividad: [{ inicio: '12:00', fin: '13:00', tipo: 'Almuerzo' }] };
  return [
    { dia: 'Lunes', activa: true, bloquesHorarios: [bloquesLab] },
    { dia: 'Martes', activa: true, bloquesHorarios: [bloquesLab] },
    { dia: 'Miércoles', activa: true, bloquesHorarios: [bloquesLab] },
    { dia: 'Jueves', activa: true, bloquesHorarios: [bloquesLab] },
    { dia: 'Viernes', activa: true, bloquesHorarios: [bloquesLab] },
    { dia: 'Sábado', activa: false, bloquesHorarios: [] },
    { dia: 'Domingo', activa: false, bloquesHorarios: [] },
  ];
};

export const obtenerConfiguracion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({ message: 'Usuario no autenticado' });
      return;
    }

    let configuracion = await ConfiguracionAgenda.findOne({ medico: medicoId });

    // Si no existe configuración, crear una por defecto con una sede
    if (!configuracion) {
      const sedesPorDefecto: ISedeAgenda[] = [
        { nombre: 'Consultorio Principal', direccion: '', jornadas: crearJornadasPorDefecto() }
      ];
      configuracion = await ConfiguracionAgenda.create({
        medico: medicoId,
        optimizacionAutomatica: true,
        flexibilidadReubicacion: false,
        sedes: sedesPorDefecto,
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

    const { optimizacionAutomatica, flexibilidadReubicacion, sedes, notificacionesAgendamiento } = req.body;

    // Validar datos requeridos
    if (!sedes || !Array.isArray(sedes)) {
      res.status(400).json({
        success: false,
        message: 'Las sedes son requeridas y deben ser un array'
      });
      return;
    }

    // Normalizar: jornadas con activa=false no deben guardar bloques (el médico no configuró nada ese día)
    const sedesNormalizadas = sedes.map((s: any) => ({
      ...s,
      jornadas: (s.jornadas || []).map((j: any) => ({
        ...j,
        bloquesHorarios: j.activa === false ? [] : (j.bloquesHorarios || [])
      }))
    }));

    // Buscar configuración existente o crear nueva
    let configuracion = await ConfiguracionAgenda.findOne({ medico: medicoId });

    if (configuracion) {
      // Actualizar configuración existente
      configuracion.optimizacionAutomatica = optimizacionAutomatica !== undefined ? optimizacionAutomatica : true;
      configuracion.flexibilidadReubicacion = flexibilidadReubicacion !== undefined ? flexibilidadReubicacion : false;
      configuracion.sedes = sedesNormalizadas;
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
        optimizacionAutomatica: optimizacionAutomatica !== undefined ? optimizacionAutomatica : true,
        flexibilidadReubicacion: flexibilidadReubicacion !== undefined ? flexibilidadReubicacion : false,
        sedes: sedesNormalizadas,
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

export const completarCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const cita = await agendamientoService.completarCita(
      citaId, 
      medicoId,
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'completar',
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
      message: 'Cita completada exitosamente',
      data: cita
    });
  } catch (error: any) {
    console.error('Error al completar cita:', error);
    
    if (error.message === 'Cita no encontrada') {
      res.status(404).json({
        success: false,
        message: error.message
      });
      return;
    }

    if (error.message === 'No se puede completar una cita cancelada' || error.message === 'La cita ya está completada') {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error al completar cita',
      error: error.message
    });
  }
};

/** Genera el PDF resumen de la cita (historia + fórmula + incapacidad + interconsulta) y lo sube a S3. */
export const generarResumenPdfCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;

    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const cita = await Cita.findOne({ _id: citaId, medicoId }).lean();
    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    const [historia, formula, incapacidad, interconsulta] = await Promise.all([
      historiaClinicaService.obtenerHistoriaClinicaPorCita(citaId, medicoId),
      formulaMedicaService.obtenerFormulaMedicaPorCita(citaId, medicoId),
      incapacidadService.obtenerIncapacidadPorCita(citaId, medicoId),
      interconsultaService.obtenerInterconsultaPorCita(citaId, medicoId)
    ]);

    const buffer = await generateCitaResumenPdf({
      historia: historia || undefined,
      formula: formula || undefined,
      incapacidad: incapacidad || undefined,
      interconsulta: interconsulta || undefined
    });

    const paciente = await Paciente.findById(cita.pacienteId).select('numeroDocumento').lean();
    const numeroDoc = paciente?.numeroDocumento ?? String(cita.pacienteId);
    const key = buildCitaDocumentKey(numeroDoc, citaId, 'resumen');
    const pdfResumenUrl = await uploadPDFAndGetUrl(buffer, key);
    await Cita.updateOne({ _id: citaId }, { pdfResumenUrl });

    res.json({
      success: true,
      message: 'PDF resumen generado correctamente',
      pdfResumenUrl
    });
  } catch (error: any) {
    console.error('Error al generar PDF resumen de cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar PDF resumen',
      error: error.message
    });
  }
};

/**
 * Obtener URL firmada para ver la grabación de la videoconsulta (solo médico de la cita).
 */
export const obtenerRecordingUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { citaId } = req.params;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    const cita = await Cita.findOne({
      _id: new mongoose.Types.ObjectId(citaId),
      medicoId: new mongoose.Types.ObjectId(medicoId)
    }).lean();
    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }
    let grabacionUrl = (cita as any).grabacionUrl;
    if (!grabacionUrl && (cita as any).meetingId) {
      const meeting = await Meeting.findOne({
        meetingId: (cita as any).meetingId,
        citaId: new mongoose.Types.ObjectId(citaId)
      }).lean();
      if (meeting?.grabacionUrl) {
        grabacionUrl = meeting.grabacionUrl;
        await Cita.findByIdAndUpdate(citaId, { grabacionUrl });
      }
    }
    if (!grabacionUrl) {
      res.status(404).json({ success: false, message: 'No hay grabación disponible para esta cita' });
      return;
    }
    const url = await getRecordingPlaybackUrl(grabacionUrl);
    if (!url) {
      res.status(404).json({
        success: false,
        message: 'No se encontraron archivos de grabación en S3. Compruebe que el bucket esté en la región correcta (AWS_CHIME_S3_RECORDING_REGION o AWS_REGION) y que el IAM tenga s3:ListBucket y s3:GetObject sobre el bucket de grabaciones.'
      });
      return;
    }
    res.json({ success: true, url });
  } catch (error: any) {
    console.error('Error al obtener URL de grabación:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener enlace de grabación',
      error: error.message
    });
  }
};

