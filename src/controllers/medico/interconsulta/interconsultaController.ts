import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import interconsultaService from '../../../services/medico/interconsulta/interconsultaService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import { generateInterconsultaPdf } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import Interconsulta from '../../../models/Interconsulta';
import Paciente from '../../../models/Paciente';
import mongoose from 'mongoose';

export const crearInterconsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { citaId, pacienteId, doctorId, servicioQueSolicita, serviciosRemitidos, motivo } = req.body;

    // Validar datos requeridos
    if (!citaId || !pacienteId || !doctorId || !servicioQueSolicita || !serviciosRemitidos || !Array.isArray(serviciosRemitidos) || serviciosRemitidos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: citaId, pacienteId, doctorId, servicioQueSolicita y serviciosRemitidos (array con al menos un elemento) son obligatorios'
      });
      return;
    }

    // Validar que cada servicio tenga motivo
    for (const servicio of serviciosRemitidos) {
      if (!servicio.motivo || servicio.motivo.trim() === '') {
        res.status(400).json({
          success: false,
          message: 'Cada servicio remitido debe tener un motivo'
        });
        return;
      }
    }

    // Verificar que existe una historia clínica con diagnósticos para esta cita
    const verificacion = await interconsultaService.verificarHistoriaClinicaConDiagnosticos(
      citaId,
      medicoId
    );

    if (!verificacion.existe) {
      res.status(400).json({
        success: false,
        message: 'Debe crear y guardar la historia clínica antes de crear una interconsulta. Por favor, complete la historia clínica primero.'
      });
      return;
    }

    if (!verificacion.diagnosticos || verificacion.diagnosticos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La historia clínica debe tener al menos un diagnóstico antes de crear una interconsulta. Por favor, agregue diagnósticos en la Historia Clínica.'
      });
      return;
    }

    // Verificar si ya existe una interconsulta para esta cita
    const interconsultaExistente = await interconsultaService.obtenerInterconsultaPorCita(
      citaId,
      medicoId
    );

    if (interconsultaExistente) {
      res.status(409).json({
        success: false,
        message: 'Ya existe una interconsulta para esta cita',
        data: {
          interconsultaId: interconsultaExistente._id
        }
      });
      return;
    }

    // Crear nueva interconsulta
    const nuevaInterconsulta = await interconsultaService.crearInterconsulta(
      {
        pacienteId,
        medicoId: new mongoose.Types.ObjectId(medicoId),
        citaId,
        historiaClinicaId: verificacion.historiaClinica._id,
        servicioQueSolicita,
        serviciosRemitidos,
        motivo,
        estado: 'pendiente'
      },
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'Interconsulta',
      nuevaInterconsulta._id.toString(),
      undefined,
      {
        pacienteId: nuevaInterconsulta.pacienteId,
        citaId: nuevaInterconsulta.citaId,
        serviciosRemitidos: nuevaInterconsulta.serviciosRemitidos.length
      }
    );

    let pdfUrl: string | undefined;
    try {
      const interconsultaLean = await Interconsulta.findById(nuevaInterconsulta._id)
        .populate('medicoId', 'nombre apellido logoUrl')
        .lean();
      if (interconsultaLean) {
        const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(pacienteId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'interconsulta');
        const buffer = await generateInterconsultaPdf(interconsultaLean);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await Interconsulta.updateOne({ _id: nuevaInterconsulta._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error generando PDF de interconsulta:', err);
    }

    res.status(201).json({
      success: true,
      message: 'Interconsulta creada exitosamente',
      data: { ...nuevaInterconsulta.toObject(), pdfUrl: pdfUrl ?? (nuevaInterconsulta as any).pdfUrl },
      pdfUrl
    });
  } catch (error: any) {
    console.error('Error al crear interconsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear interconsulta',
      error: error.message
    });
  }
};

export const obtenerInterconsultaPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const interconsulta = await interconsultaService.obtenerInterconsultaPorCita(
      citaId,
      medicoId
    );

    if (!interconsulta) {
      res.status(404).json({
        success: false,
        message: 'Interconsulta no encontrada para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: interconsulta
    });
  } catch (error: any) {
    console.error('Error al obtener interconsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interconsulta',
      error: error.message
    });
  }
};

export const obtenerInterconsultasPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const interconsultas = await interconsultaService.obtenerInterconsultasPorPaciente(
      pacienteId,
      medicoId
    );

    res.json({
      success: true,
      data: interconsultas
    });
  } catch (error: any) {
    console.error('Error al obtener interconsultas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interconsultas',
      error: error.message
    });
  }
};

export const obtenerInterconsultaPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { interconsultaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interconsulta = await interconsultaService.obtenerInterconsultaPorId(
      interconsultaId,
      medicoId
    );

    if (!interconsulta) {
      res.status(404).json({
        success: false,
        message: 'Interconsulta no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: interconsulta
    });
  } catch (error: any) {
    console.error('Error al obtener interconsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interconsulta',
      error: error.message
    });
  }
};

export const actualizarInterconsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { interconsultaId } = req.params;
    const datosActualizados = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const interconsultaAnterior = await interconsultaService.obtenerInterconsultaPorId(
      interconsultaId,
      medicoId
    );

    if (!interconsultaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Interconsulta no encontrada'
      });
      return;
    }

    const interconsultaActualizada = await interconsultaService.actualizarInterconsulta(
      interconsultaId,
      medicoId,
      datosActualizados,
      medicoId,
      'Medico'
    );

    if (!interconsultaActualizada) {
      res.status(404).json({
        success: false,
        message: 'Interconsulta no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'Interconsulta',
      interconsultaId,
      interconsultaAnterior,
      interconsultaActualizada
    );

    res.json({
      success: true,
      message: 'Interconsulta actualizada exitosamente',
      data: interconsultaActualizada
    });
  } catch (error: any) {
    console.error('Error al actualizar interconsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar interconsulta',
      error: error.message
    });
  }
};

export const eliminarInterconsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { interconsultaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const interconsultaAnterior = await interconsultaService.obtenerInterconsultaPorId(
      interconsultaId,
      medicoId
    );

    if (!interconsultaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Interconsulta no encontrada'
      });
      return;
    }

    const eliminada = await interconsultaService.eliminarInterconsulta(
      interconsultaId,
      medicoId
    );

    if (!eliminada) {
      res.status(404).json({
        success: false,
        message: 'Interconsulta no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'Interconsulta',
      interconsultaId,
      interconsultaAnterior,
      undefined
    );

    res.json({
      success: true,
      message: 'Interconsulta eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar interconsulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar interconsulta',
      error: error.message
    });
  }
};
