import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import agendamientoService from '../../../services/paciente/agendamiento/agendamientoService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import { notificarCitaAgendadaPaciente } from '../../../services/notifications/citaWhatsAppNotifier';
import { getRecordingPlaybackUrl } from '../../../utils/s3Documents';
import Cita from '../../../models/Cita';
import Meeting from '../../../models/Meeting';
import mongoose from 'mongoose';

/** Normaliza hora "08:00 AM" / "08:00" al formato 24h que guarda el servicio (ej. "08:00") */
function horaA24Horas(hora: string): string {
  const s = String(hora).trim();
  const tieneAMPM = /AM|PM/i.test(s);
  if (!tieneAMPM) return s;
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return s;
  let h = parseInt(match[1], 10);
  const m = match[2];
  if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  else if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
}

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

export const obtenerMedicosRecomendados = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const medicos = await agendamientoService.obtenerMedicosRecomendados(pacienteId!);

    res.json({
      success: true,
      data: medicos
    });
  } catch (error: any) {
    console.error('Error al obtener médicos recomendados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener recomendaciones',
      error: error.message
    });
  }
};

export const obtenerMedicoPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const medico = await agendamientoService.obtenerMedicoPorId(medicoId as string);

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

export const obtenerConfiguracionFlujoMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const flujoPaciente = await agendamientoService.obtenerConfiguracionFlujoMedico(medicoId as string);
    res.json({
      success: true,
      data: flujoPaciente
    });
  } catch (error: any) {
    console.error('Error al obtener configuración de flujo del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la configuración',
      error: error.message
    });
  }
};

export const obtenerSedesMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const sedes = await agendamientoService.obtenerSedes(medicoId as string);

    res.json({
      success: true,
      data: sedes
    });
  } catch (error: any) {
    console.error('Error al obtener sedes del médico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener sedes',
      error: error.message
    });
  }
};

export const obtenerHorariosDisponibles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { medicoId } = req.params;
    const { fecha, sedeIndex } = req.query;
    const pacienteId = req.userId ?? undefined;

    if (!fecha) {
      res.status(400).json({
        success: false,
        message: 'La fecha es requerida'
      });
      return;
    }

    const parsed = sedeIndex != null ? parseInt(String(sedeIndex), 10) : NaN;
    const idx = !isNaN(parsed) ? parsed : undefined;
    const horarios = await agendamientoService.obtenerHorariosDisponibles(medicoId as string, fecha as string, idx, pacienteId);

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

    const { medicoId, fecha, hora, tipo, modalidad, modulo } = req.body;

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

    // Validar que el paciente no tenga ya una cita en la misma fecha y hora (evitar duplicados)
    const parte = String(fecha).split('T')[0];
    const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(parte) ? parte.split('-').map(Number) : [fechaObj.getFullYear(), fechaObj.getMonth() + 1, fechaObj.getDate()];
    const inicioDia = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const finDia = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
    const hora24 = horaA24Horas(String(hora));
    const citaExistente = await Cita.findOne({
      pacienteId,
      estado: { $in: ['pendiente', 'confirmada', 'completada'] },
      fecha: { $gte: inicioDia, $lt: finDia },
      hora: hora24
    });
    if (citaExistente) {
      res.status(400).json({
        success: false,
        message: 'Ya tiene una cita agendada para esta fecha y hora. No puede crear otra cita en el mismo horario.'
      });
      return;
    }

    const cita = await agendamientoService.crearCita({
      pacienteId,
      medicoId,
      fecha: fechaObj,
      hora,
      tipo,
      modalidad,
      ...(modulo && ['general', 'heridas'].includes(modulo) ? { modulo } : {})
    } as any, pacienteId, 'Paciente');

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

    if (cita._id) {
      void notificarCitaAgendadaPaciente(String(cita._id));
    }
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

/**
 * Obtener URL firmada para ver la grabación de la videoconsulta (solo paciente de la cita).
 */
export const obtenerRecordingUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(citaId as string) || !mongoose.Types.ObjectId.isValid(pacienteId as string)) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }
    const cita = await Cita.findOne({
      _id: new mongoose.Types.ObjectId(citaId as string),
      pacienteId: new mongoose.Types.ObjectId(pacienteId)
    }).lean();
    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }
    let grabacionUrl = (cita as any).grabacionUrl;
    if (!grabacionUrl && (cita as any).meetingId) {
      const meeting = await Meeting.findOne({
        meetingId: (cita as any).meetingId,
        citaId: new mongoose.Types.ObjectId(citaId as string)
      }).lean();
      if (meeting?.grabacionUrl) {
        grabacionUrl = meeting.grabacionUrl;
        await Cita.findByIdAndUpdate(citaId as string, { grabacionUrl });
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
      citaId as string, 
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
      citaId as string,
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

/**
 * PUT /api/paciente/agendamiento/citas/:citaId/confirmar
 *
 * Marca una cita como `confirmada` después de un pago exitoso.
 * Hoy el "pago" es mock desde el checkout; cuando se integre pasarela real
 * (Wompi/PSE), idealmente este endpoint quedaría detrás de la verificación
 * del webhook de pago en vez de ser llamado directamente por el front.
 */
export const confirmarPagoCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { citaId } = req.params;
    const { metodoPago, aseguradora } = req.body ?? {};

    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    const cita = await Cita.findOne({ _id: citaId, pacienteId });
    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada' });
      return;
    }

    if (cita.estado === 'cancelada') {
      res.status(400).json({ success: false, message: 'No se puede confirmar una cita cancelada' });
      return;
    }
    if (cita.estado === 'completada') {
      res.status(400).json({ success: false, message: 'La cita ya está completada' });
      return;
    }

    const estadoAnterior = cita.estado;
    cita.estado = 'confirmada';
    if (metodoPago) (cita as any).metodoPago = String(metodoPago);
    if (aseguradora) (cita as any).aseguradora = String(aseguradora);
    await cita.save();

    await registrarAccion(
      req,
      'actualizar',
      'Cita',
      citaId as string,
      { estado: estadoAnterior },
      { estado: cita.estado, metodoPago, aseguradora },
      'Pago confirmado por paciente'
    );

    res.json({
      success: true,
      message: 'Cita confirmada exitosamente',
      data: cita
    });
  } catch (error: any) {
    console.error('Error al confirmar pago de cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al confirmar cita',
      error: error.message
    });
  }
};

