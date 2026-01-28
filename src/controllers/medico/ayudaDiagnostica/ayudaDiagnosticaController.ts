import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import ayudaDiagnosticaService from '../../../services/medico/ayudaDiagnostica/ayudaDiagnosticaService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import mongoose from 'mongoose';
import { generateAyudaDiagnosticaPdf } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import AyudaDiagnostica from '../../../models/AyudaDiagnostica';
import Paciente from '../../../models/Paciente';

export const crearAyudaDiagnostica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { citaId, pacienteId, doctorId, ayudasDiagnosticas } = req.body;

    // Validar datos requeridos
    if (!citaId || !pacienteId || !doctorId || !ayudasDiagnosticas || !Array.isArray(ayudasDiagnosticas) || ayudasDiagnosticas.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: citaId, pacienteId, doctorId y ayudasDiagnosticas (array con al menos un elemento) son obligatorios'
      });
      return;
    }

    // Validar que cada ayuda diagnóstica tenga los campos requeridos
    for (const ayuda of ayudasDiagnosticas) {
      if (!ayuda.codigoCups || !ayuda.descripcionCups || !ayuda.cantidad || ayuda.cantidad < 1) {
        res.status(400).json({
          success: false,
          message: 'Cada ayuda diagnóstica debe tener código CUPS, descripción y cantidad (mínimo 1)'
        });
        return;
      }
    }

    // Verificar que existe una historia clínica con diagnósticos para esta cita
    const verificacion = await ayudaDiagnosticaService.verificarHistoriaClinicaConDiagnosticos(
      citaId,
      medicoId
    );

    if (!verificacion.existe) {
      res.status(400).json({
        success: false,
        message: 'Debe crear y guardar la historia clínica antes de crear una orden de ayudas diagnósticas. Por favor, complete la historia clínica primero.'
      });
      return;
    }

    if (!verificacion.diagnosticos || verificacion.diagnosticos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La historia clínica debe tener al menos un diagnóstico antes de crear una orden de ayudas diagnósticas. Por favor, agregue diagnósticos en la Historia Clínica.'
      });
      return;
    }

    // Verificar si ya existe una orden de ayudas diagnósticas para esta cita
    const ayudaDiagnosticaExistente = await ayudaDiagnosticaService.obtenerAyudaDiagnosticaPorCita(
      citaId,
      medicoId
    );

    if (ayudaDiagnosticaExistente) {
      res.status(409).json({
        success: false,
        message: 'Ya existe una orden de ayudas diagnósticas para esta cita',
        data: {
          ayudaDiagnosticaId: ayudaDiagnosticaExistente._id
        }
      });
      return;
    }

    // Crear nueva orden de ayudas diagnósticas
    const nuevaAyudaDiagnostica = await ayudaDiagnosticaService.crearAyudaDiagnostica(
      {
        pacienteId,
        medicoId: new mongoose.Types.ObjectId(medicoId),
        citaId,
        historiaClinicaId: verificacion.historiaClinica._id,
        ayudasDiagnosticas,
        estado: 'pendiente'
      },
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'AyudaDiagnostica',
      nuevaAyudaDiagnostica._id.toString(),
      undefined,
      {
        pacienteId: nuevaAyudaDiagnostica.pacienteId,
        citaId: nuevaAyudaDiagnostica.citaId,
        cantidadAyudasDiagnosticas: nuevaAyudaDiagnostica.ayudasDiagnosticas.length
      }
    );

    // Generar PDF y subir a S3
    let pdfUrl: string | undefined;
    try {
      const ayudaPop = await AyudaDiagnostica.findById(nuevaAyudaDiagnostica._id)
        .populate('pacienteId', 'nombre apellido numeroDocumento')
        .populate('medicoId', 'nombre apellido')
        .lean();
      if (ayudaPop) {
        const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(pacienteId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'ayudas-diagnosticas');
        const buffer = await generateAyudaDiagnosticaPdf(ayudaPop);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await AyudaDiagnostica.updateOne({ _id: nuevaAyudaDiagnostica._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error generando PDF de orden de ayudas diagnósticas:', err);
    }

    res.status(201).json({
      success: true,
      message: 'Orden de ayudas diagnósticas creada exitosamente',
      data: { ...(nuevaAyudaDiagnostica.toObject?.() ?? nuevaAyudaDiagnostica), pdfUrl: pdfUrl ?? (nuevaAyudaDiagnostica as any).pdfUrl },
      pdfUrl: pdfUrl ?? (nuevaAyudaDiagnostica as any).pdfUrl
    });
  } catch (error: any) {
    console.error('Error al crear orden de ayudas diagnósticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear orden de ayudas diagnósticas',
      error: error.message
    });
  }
};

export const obtenerAyudaDiagnosticaPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const ayudaDiagnostica = await ayudaDiagnosticaService.obtenerAyudaDiagnosticaPorCita(
      citaId,
      medicoId
    );

    if (!ayudaDiagnostica) {
      res.status(404).json({
        success: false,
        message: 'Orden de ayudas diagnósticas no encontrada para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: ayudaDiagnostica
    });
  } catch (error: any) {
    console.error('Error al obtener orden de ayudas diagnósticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener orden de ayudas diagnósticas',
      error: error.message
    });
  }
};

export const obtenerAyudasDiagnosticasPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const ayudasDiagnosticas = await ayudaDiagnosticaService.obtenerAyudasDiagnosticasPorPaciente(
      pacienteId,
      medicoId
    );

    res.json({
      success: true,
      data: ayudasDiagnosticas
    });
  } catch (error: any) {
    console.error('Error al obtener órdenes de ayudas diagnósticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener órdenes de ayudas diagnósticas',
      error: error.message
    });
  }
};

export const obtenerAyudaDiagnosticaPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { ayudaDiagnosticaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const ayudaDiagnostica = await ayudaDiagnosticaService.obtenerAyudaDiagnosticaPorId(
      ayudaDiagnosticaId,
      medicoId
    );

    if (!ayudaDiagnostica) {
      res.status(404).json({
        success: false,
        message: 'Orden de ayudas diagnósticas no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: ayudaDiagnostica
    });
  } catch (error: any) {
    console.error('Error al obtener orden de ayudas diagnósticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener orden de ayudas diagnósticas',
      error: error.message
    });
  }
};

export const actualizarAyudaDiagnostica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { ayudaDiagnosticaId } = req.params;
    const datosActualizados = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Validar ayudasDiagnosticas si se están actualizando
    if (datosActualizados.ayudasDiagnosticas) {
      if (!Array.isArray(datosActualizados.ayudasDiagnosticas) || datosActualizados.ayudasDiagnosticas.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Debe haber al menos una ayuda diagnóstica en la orden'
        });
        return;
      }

      // Validar que cada ayuda diagnóstica tenga los campos requeridos
      for (const ayuda of datosActualizados.ayudasDiagnosticas) {
        if (!ayuda.codigoCups || !ayuda.descripcionCups || !ayuda.cantidad || ayuda.cantidad < 1) {
          res.status(400).json({
            success: false,
            message: 'Cada ayuda diagnóstica debe tener código CUPS, descripción y cantidad (mínimo 1)'
          });
          return;
        }
      }
    }

    // Obtener datos anteriores para auditoría
    const ayudaDiagnosticaAnterior = await ayudaDiagnosticaService.obtenerAyudaDiagnosticaPorId(
      ayudaDiagnosticaId,
      medicoId
    );

    if (!ayudaDiagnosticaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Orden de ayudas diagnósticas no encontrada'
      });
      return;
    }

    const ayudaDiagnosticaActualizada = await ayudaDiagnosticaService.actualizarAyudaDiagnostica(
      ayudaDiagnosticaId,
      medicoId,
      datosActualizados,
      medicoId,
      'Medico'
    );

    if (!ayudaDiagnosticaActualizada) {
      res.status(404).json({
        success: false,
        message: 'Orden de ayudas diagnósticas no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'AyudaDiagnostica',
      ayudaDiagnosticaId,
      ayudaDiagnosticaAnterior,
      ayudaDiagnosticaActualizada
    );

    // Regenerar PDF con los datos actualizados y reemplazar en S3
    let pdfUrl: string | undefined;
    try {
      const ayudaPop = await AyudaDiagnostica.findById(ayudaDiagnosticaActualizada._id)
        .populate('pacienteId', 'nombre apellido numeroDocumento')
        .populate('medicoId', 'nombre apellido')
        .lean();
      if (ayudaPop) {
        const paciente = await Paciente.findById(ayudaPop.pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(ayudaPop.pacienteId);
        const citaId = String(ayudaPop.citaId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'ayudas-diagnosticas');
        const buffer = await generateAyudaDiagnosticaPdf(ayudaPop);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await AyudaDiagnostica.updateOne({ _id: ayudaDiagnosticaActualizada._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error regenerando PDF de orden de ayudas diagnósticas:', err);
    }

    res.json({
      success: true,
      message: 'Orden de ayudas diagnósticas actualizada exitosamente',
      data: { ...(ayudaDiagnosticaActualizada.toObject?.() ?? ayudaDiagnosticaActualizada), pdfUrl: pdfUrl ?? (ayudaDiagnosticaActualizada as any).pdfUrl },
      pdfUrl: pdfUrl ?? (ayudaDiagnosticaActualizada as any).pdfUrl
    });
  } catch (error: any) {
    console.error('Error al actualizar orden de ayudas diagnósticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar orden de ayudas diagnósticas',
      error: error.message
    });
  }
};

export const eliminarAyudaDiagnostica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { ayudaDiagnosticaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const ayudaDiagnosticaAnterior = await ayudaDiagnosticaService.obtenerAyudaDiagnosticaPorId(
      ayudaDiagnosticaId,
      medicoId
    );

    if (!ayudaDiagnosticaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Orden de ayudas diagnósticas no encontrada'
      });
      return;
    }

    const eliminada = await ayudaDiagnosticaService.eliminarAyudaDiagnostica(
      ayudaDiagnosticaId,
      medicoId
    );

    if (!eliminada) {
      res.status(404).json({
        success: false,
        message: 'Orden de ayudas diagnósticas no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'AyudaDiagnostica',
      ayudaDiagnosticaId,
      ayudaDiagnosticaAnterior,
      undefined
    );

    res.json({
      success: true,
      message: 'Orden de ayudas diagnósticas eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar orden de ayudas diagnósticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar orden de ayudas diagnósticas',
      error: error.message
    });
  }
};
