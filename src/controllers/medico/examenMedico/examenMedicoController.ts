import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import examenMedicoService from '../../../services/medico/examenMedico/examenMedicoService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import mongoose from 'mongoose';
import { generateExamenMedicoPdf } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import ExamenMedico from '../../../models/ExamenMedico';
import Paciente from '../../../models/Paciente';

export const crearExamenMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { citaId, pacienteId, doctorId, examenes } = req.body;

    // Validar datos requeridos
    if (!citaId || !pacienteId || !doctorId || !examenes || !Array.isArray(examenes) || examenes.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: citaId, pacienteId, doctorId y examenes (array con al menos un elemento) son obligatorios'
      });
      return;
    }

    // Validar que cada examen tenga los campos requeridos
    for (const examen of examenes) {
      if (!examen.codigoCups || !examen.descripcionCups || !examen.cantidad || examen.cantidad < 1) {
        res.status(400).json({
          success: false,
          message: 'Cada examen debe tener código CUPS, descripción y cantidad (mínimo 1)'
        });
        return;
      }
    }

    // Verificar que existe una historia clínica con diagnósticos para esta cita
    const verificacion = await examenMedicoService.verificarHistoriaClinicaConDiagnosticos(
      citaId,
      medicoId
    );

    if (!verificacion.existe) {
      res.status(400).json({
        success: false,
        message: 'Debe crear y guardar la historia clínica antes de crear una orden de exámenes. Por favor, complete la historia clínica primero.'
      });
      return;
    }

    if (!verificacion.diagnosticos || verificacion.diagnosticos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La historia clínica debe tener al menos un diagnóstico antes de crear una orden de exámenes. Por favor, agregue diagnósticos en la Historia Clínica.'
      });
      return;
    }

    // Verificar si ya existe una orden de exámenes para esta cita
    const examenMedicoExistente = await examenMedicoService.obtenerExamenMedicoPorCita(
      citaId,
      medicoId
    );

    if (examenMedicoExistente) {
      res.status(409).json({
        success: false,
        message: 'Ya existe una orden de exámenes para esta cita',
        data: {
          examenMedicoId: examenMedicoExistente._id
        }
      });
      return;
    }

    // Crear nueva orden de exámenes
    const nuevoExamenMedico = await examenMedicoService.crearExamenMedico(
      {
        pacienteId,
        medicoId: new mongoose.Types.ObjectId(medicoId),
        citaId,
        historiaClinicaId: verificacion.historiaClinica._id,
        examenes,
        estado: 'pendiente'
      },
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'ExamenMedico',
      nuevoExamenMedico._id.toString(),
      undefined,
      {
        pacienteId: nuevoExamenMedico.pacienteId,
        citaId: nuevoExamenMedico.citaId,
        cantidadExamenes: nuevoExamenMedico.examenes.length
      }
    );

    // Generar PDF y subir a S3
    let pdfUrl: string | undefined;
    try {
      const examenPop = await ExamenMedico.findById(nuevoExamenMedico._id)
        .populate('pacienteId', 'nombre apellido numeroDocumento')
        .populate('medicoId', 'nombre apellido')
        .lean();
      if (examenPop) {
        const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(pacienteId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'examenes-laboratorio');
        const buffer = await generateExamenMedicoPdf(examenPop);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await ExamenMedico.updateOne({ _id: nuevoExamenMedico._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error generando PDF de orden de exámenes:', err);
    }

    res.status(201).json({
      success: true,
      message: 'Orden de exámenes creada exitosamente',
      data: { ...(nuevoExamenMedico.toObject?.() ?? nuevoExamenMedico), pdfUrl: pdfUrl ?? (nuevoExamenMedico as any).pdfUrl },
      pdfUrl: pdfUrl ?? (nuevoExamenMedico as any).pdfUrl
    });
  } catch (error: any) {
    console.error('Error al crear orden de exámenes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear orden de exámenes',
      error: error.message
    });
  }
};

export const obtenerExamenMedicoPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const examenMedico = await examenMedicoService.obtenerExamenMedicoPorCita(
      citaId,
      medicoId
    );

    if (!examenMedico) {
      res.status(404).json({
        success: false,
        message: 'Orden de exámenes no encontrada para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: examenMedico
    });
  } catch (error: any) {
    console.error('Error al obtener orden de exámenes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener orden de exámenes',
      error: error.message
    });
  }
};

export const obtenerExamenesMedicosPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const examenesMedicos = await examenMedicoService.obtenerExamenesMedicosPorPaciente(
      pacienteId,
      medicoId
    );

    res.json({
      success: true,
      data: examenesMedicos
    });
  } catch (error: any) {
    console.error('Error al obtener órdenes de exámenes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener órdenes de exámenes',
      error: error.message
    });
  }
};

export const obtenerExamenMedicoPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { examenMedicoId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const examenMedico = await examenMedicoService.obtenerExamenMedicoPorId(
      examenMedicoId,
      medicoId
    );

    if (!examenMedico) {
      res.status(404).json({
        success: false,
        message: 'Orden de exámenes no encontrada'
      });
      return;
    }

    res.json({
      success: true,
      data: examenMedico
    });
  } catch (error: any) {
    console.error('Error al obtener orden de exámenes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener orden de exámenes',
      error: error.message
    });
  }
};

export const actualizarExamenMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { examenMedicoId } = req.params;
    const datosActualizados = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Validar examenes si se están actualizando
    if (datosActualizados.examenes) {
      if (!Array.isArray(datosActualizados.examenes) || datosActualizados.examenes.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Debe haber al menos un examen en la orden'
        });
        return;
      }

      // Validar que cada examen tenga los campos requeridos
      for (const examen of datosActualizados.examenes) {
        if (!examen.codigoCups || !examen.descripcionCups || !examen.cantidad || examen.cantidad < 1) {
          res.status(400).json({
            success: false,
            message: 'Cada examen debe tener código CUPS, descripción y cantidad (mínimo 1)'
          });
          return;
        }
      }
    }

    // Obtener datos anteriores para auditoría
    const examenMedicoAnterior = await examenMedicoService.obtenerExamenMedicoPorId(
      examenMedicoId,
      medicoId
    );

    if (!examenMedicoAnterior) {
      res.status(404).json({
        success: false,
        message: 'Orden de exámenes no encontrada'
      });
      return;
    }

    const examenMedicoActualizado = await examenMedicoService.actualizarExamenMedico(
      examenMedicoId,
      medicoId,
      datosActualizados,
      medicoId,
      'Medico'
    );

    if (!examenMedicoActualizado) {
      res.status(404).json({
        success: false,
        message: 'Orden de exámenes no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'ExamenMedico',
      examenMedicoId,
      examenMedicoAnterior,
      examenMedicoActualizado
    );

    // Regenerar PDF con los datos actualizados y reemplazar en S3
    let pdfUrl: string | undefined;
    try {
      const examenPop = await ExamenMedico.findById(examenMedicoActualizado._id)
        .populate('pacienteId', 'nombre apellido numeroDocumento')
        .populate('medicoId', 'nombre apellido')
        .lean();
      if (examenPop) {
        const paciente = await Paciente.findById(examenPop.pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(examenPop.pacienteId);
        const citaId = String(examenPop.citaId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'examenes-laboratorio');
        const buffer = await generateExamenMedicoPdf(examenPop);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await ExamenMedico.updateOne({ _id: examenMedicoActualizado._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error regenerando PDF de orden de exámenes:', err);
    }

    res.json({
      success: true,
      message: 'Orden de exámenes actualizada exitosamente',
      data: { ...(examenMedicoActualizado.toObject?.() ?? examenMedicoActualizado), pdfUrl: pdfUrl ?? (examenMedicoActualizado as any).pdfUrl },
      pdfUrl: pdfUrl ?? (examenMedicoActualizado as any).pdfUrl
    });
  } catch (error: any) {
    console.error('Error al actualizar orden de exámenes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar orden de exámenes',
      error: error.message
    });
  }
};

export const eliminarExamenMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { examenMedicoId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const examenMedicoAnterior = await examenMedicoService.obtenerExamenMedicoPorId(
      examenMedicoId,
      medicoId
    );

    if (!examenMedicoAnterior) {
      res.status(404).json({
        success: false,
        message: 'Orden de exámenes no encontrada'
      });
      return;
    }

    const eliminada = await examenMedicoService.eliminarExamenMedico(
      examenMedicoId,
      medicoId
    );

    if (!eliminada) {
      res.status(404).json({
        success: false,
        message: 'Orden de exámenes no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'ExamenMedico',
      examenMedicoId,
      examenMedicoAnterior,
      undefined
    );

    res.json({
      success: true,
      message: 'Orden de exámenes eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar orden de exámenes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar orden de exámenes',
      error: error.message
    });
  }
};
