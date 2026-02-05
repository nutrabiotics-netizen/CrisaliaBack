import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import incapacidadService from '../../../services/medico/incapacidad/incapacidadService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import { generateIncapacidadPdf } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import Incapacidad from '../../../models/Incapacidad';
import Paciente from '../../../models/Paciente';
import mongoose from 'mongoose';

export const crearIncapacidad = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { citaId, pacienteId, doctorId, lugarExpedicion, fechaExpedicion, esProrroga, especialidadMedica, fechaInicial, dias, fechaFinal, diagnosticoPrincipal, observaciones } = req.body;

    // Validar datos requeridos
    if (!citaId || !pacienteId || !doctorId || !lugarExpedicion || !fechaExpedicion || !fechaInicial || !dias || !fechaFinal || !diagnosticoPrincipal || !diagnosticoPrincipal.descripcion) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: citaId, pacienteId, doctorId, lugarExpedicion, fechaExpedicion, fechaInicial, dias, fechaFinal y diagnosticoPrincipal son obligatorios'
      });
      return;
    }

    // Verificar que existe una historia clínica con diagnósticos para esta cita
    const verificacion = await incapacidadService.verificarHistoriaClinicaConDiagnosticos(
      citaId,
      medicoId
    );

    if (!verificacion.existe) {
      res.status(400).json({
        success: false,
        message: 'Debe crear y guardar la historia clínica antes de crear una incapacidad. Por favor, complete la historia clínica primero.'
      });
      return;
    }

    if (!verificacion.diagnosticos || verificacion.diagnosticos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La historia clínica debe tener al menos un diagnóstico antes de crear una incapacidad. Por favor, agregue diagnósticos en la Historia Clínica.'
      });
      return;
    }

    // Verificar si ya existe una incapacidad para esta cita
    const incapacidadExistente = await incapacidadService.obtenerIncapacidadPorCita(
      citaId,
      medicoId
    );

    if (incapacidadExistente) {
      res.status(409).json({
        success: false,
        message: 'Ya existe una incapacidad para esta cita',
        data: {
          incapacidadId: incapacidadExistente._id,
          pdfUrl: incapacidadExistente.pdfUrl
        }
      });
      return;
    }

    // Crear nueva incapacidad
    const nuevaIncapacidad = await incapacidadService.crearIncapacidad(
      {
        pacienteId,
        medicoId: new mongoose.Types.ObjectId(medicoId),
        citaId,
        historiaClinicaId: verificacion.historiaClinica._id,
        lugarExpedicion,
        fechaExpedicion: new Date(fechaExpedicion),
        esProrroga: esProrroga || false,
        especialidadMedica,
        fechaInicial: new Date(fechaInicial),
        dias: parseInt(dias),
        fechaFinal: new Date(fechaFinal),
        diagnosticoPrincipal,
        observaciones
      },
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'Incapacidad',
      nuevaIncapacidad._id.toString(),
      undefined,
      {
        pacienteId: nuevaIncapacidad.pacienteId,
        citaId: nuevaIncapacidad.citaId,
        dias: nuevaIncapacidad.dias
      }
    );

    let pdfUrl: string | undefined;
    try {
      const incapacidadPop = await Incapacidad.findById(nuevaIncapacidad._id)
        .populate('pacienteId', 'nombre apellido')
        .populate('medicoId', 'nombre apellido logoUrl')
        .lean();
      if (incapacidadPop) {
        const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(pacienteId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'incapacidad');
        const buffer = await generateIncapacidadPdf(incapacidadPop);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await Incapacidad.updateOne({ _id: nuevaIncapacidad._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error generando PDF de incapacidad:', err);
    }

    res.status(201).json({
      success: true,
      message: 'Incapacidad creada exitosamente',
      data: { ...nuevaIncapacidad.toObject(), pdfUrl: pdfUrl ?? nuevaIncapacidad.pdfUrl },
      pdfUrl: pdfUrl ?? nuevaIncapacidad.pdfUrl
    });
  } catch (error: any) {
    console.error('Error al crear incapacidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear incapacidad',
      error: error.message
    });
  }
};

export const obtenerIncapacidadPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const incapacidad = await incapacidadService.obtenerIncapacidadPorCita(
      citaId,
      medicoId
    );

    if (!incapacidad) {
      res.status(404).json({
        success: false,
        message: 'Incapacidad no encontrada para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: incapacidad
    });
  } catch (error: any) {
    console.error('Error al obtener incapacidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener incapacidad',
      error: error.message
    });
  }
};

export const obtenerIncapacidadesPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { pacienteId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const incapacidades = await incapacidadService.obtenerIncapacidadesPorPaciente(
      pacienteId,
      medicoId
    );

    res.json({
      success: true,
      data: incapacidades
    });
  } catch (error: any) {
    console.error('Error al obtener incapacidades:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener incapacidades',
      error: error.message
    });
  }
};

export const obtenerIncapacidadPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { incapacidadId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const incapacidad = await incapacidadService.obtenerIncapacidadPorId(
      incapacidadId,
      medicoId
    );

    if (!incapacidad) {
      res.status(404).json({
        success: false,
        message: 'Incapacidad no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: incapacidad
    });
  } catch (error: any) {
    console.error('Error al obtener incapacidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener incapacidad',
      error: error.message
    });
  }
};

export const actualizarIncapacidad = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { incapacidadId } = req.params;
    const datosActualizados = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Convertir fechas si vienen como strings
    if (datosActualizados.fechaExpedicion) {
      datosActualizados.fechaExpedicion = new Date(datosActualizados.fechaExpedicion);
    }
    if (datosActualizados.fechaInicial) {
      datosActualizados.fechaInicial = new Date(datosActualizados.fechaInicial);
    }
    if (datosActualizados.fechaFinal) {
      datosActualizados.fechaFinal = new Date(datosActualizados.fechaFinal);
    }
    if (datosActualizados.dias) {
      datosActualizados.dias = parseInt(datosActualizados.dias);
    }

    // Obtener datos anteriores para auditoría
    const incapacidadAnterior = await incapacidadService.obtenerIncapacidadPorId(
      incapacidadId,
      medicoId
    );

    if (!incapacidadAnterior) {
      res.status(404).json({
        success: false,
        message: 'Incapacidad no encontrada'
      });
      return;
    }

    const incapacidadActualizada = await incapacidadService.actualizarIncapacidad(
      incapacidadId,
      medicoId,
      datosActualizados,
      medicoId,
      'Medico'
    );

    if (!incapacidadActualizada) {
      res.status(404).json({
        success: false,
        message: 'Incapacidad no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'Incapacidad',
      incapacidadId,
      incapacidadAnterior,
      incapacidadActualizada
    );

    res.json({
      success: true,
      message: 'Incapacidad actualizada exitosamente',
      data: incapacidadActualizada
    });
  } catch (error: any) {
    console.error('Error al actualizar incapacidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar incapacidad',
      error: error.message
    });
  }
};

export const eliminarIncapacidad = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { incapacidadId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const incapacidadAnterior = await incapacidadService.obtenerIncapacidadPorId(
      incapacidadId,
      medicoId
    );

    if (!incapacidadAnterior) {
      res.status(404).json({
        success: false,
        message: 'Incapacidad no encontrada'
      });
      return;
    }

    const eliminada = await incapacidadService.eliminarIncapacidad(
      incapacidadId,
      medicoId
    );

    if (!eliminada) {
      res.status(404).json({
        success: false,
        message: 'Incapacidad no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'Incapacidad',
      incapacidadId,
      incapacidadAnterior,
      undefined
    );

    res.json({
      success: true,
      message: 'Incapacidad eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar incapacidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar incapacidad',
      error: error.message
    });
  }
};
