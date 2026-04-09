import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import formulaMedicaService from '../../../services/medico/formulaMedica/formulaMedicaService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import { generateFormulaPdf } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import FormulaMedica from '../../../models/FormulaMedica';
import Paciente from '../../../models/Paciente';
import mongoose from 'mongoose';

export const verificarYCrearFormulaMedica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { citaId, pacienteId, doctorId, medicamentos, sobrescribir } = req.body;

    // Validar datos requeridos
    if (!citaId || !pacienteId || !doctorId || !medicamentos || !Array.isArray(medicamentos) || medicamentos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: citaId, pacienteId, doctorId y medicamentos (array no vacío)'
      });
      return;
    }

    // Verificar que existe una historia clínica con diagnósticos para esta cita
    const verificacion = await formulaMedicaService.verificarHistoriaClinicaConDiagnosticos(
      citaId,
      medicoId
    );

    if (!verificacion.existe) {
      res.status(400).json({
        success: false,
        message: 'Debe crear y guardar la historia clínica antes de crear una fórmula médica. Por favor, complete la historia clínica primero.'
      });
      return;
    }

    if (!verificacion.diagnosticos || verificacion.diagnosticos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La historia clínica debe tener al menos un diagnóstico antes de crear una fórmula médica. Por favor, agregue diagnósticos en la Historia Clínica.'
      });
      return;
    }

    // Verificar si ya existe una fórmula médica para esta cita
    const formulaExistente = await formulaMedicaService.obtenerFormulaMedicaPorCita(
      citaId,
      medicoId
    );

    if (formulaExistente && !sobrescribir) {
      res.status(409).json({
        success: false,
        message: 'Ya existe una fórmula médica para esta cita',
        data: {
          formulaId: formulaExistente._id,
          pdfUrl: formulaExistente.pdfUrl
        }
      });
      return;
    }

    // Si existe y se quiere sobrescribir, eliminar la anterior
    if (formulaExistente && sobrescribir) {
      await formulaMedicaService.eliminarFormulaMedica(
        formulaExistente._id.toString(),
        medicoId
      );
    }

    // Crear nueva fórmula médica
    const nuevaFormula = await formulaMedicaService.crearFormulaMedica(
      {
        pacienteId,
        medicoId: new mongoose.Types.ObjectId(medicoId),
        citaId,
        historiaClinicaId: verificacion.historiaClinica._id,
        medicamentos,
        diagnosticos: verificacion.diagnosticos,
        observaciones: req.body.observaciones
      },
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      sobrescribir ? 'actualizar' : 'crear',
      'FormulaMedica',
      nuevaFormula._id.toString(),
      formulaExistente || undefined,
      {
        pacienteId: nuevaFormula.pacienteId,
        citaId: nuevaFormula.citaId,
        cantidadMedicamentos: nuevaFormula.medicamentos.length
      }
    );

    let pdfUrl: string | undefined;
    try {
      const formulaPop = await FormulaMedica.findById(nuevaFormula._id)
        .populate('pacienteId', 'nombre apellido')
        .populate('medicoId', 'nombre apellido logoUrl')
        .lean();
      if (formulaPop) {
        const paciente = await Paciente.findById(pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(pacienteId);
        const key = buildCitaDocumentKey(numeroDoc, citaId, 'formula-medica');
        const buffer = await generateFormulaPdf(formulaPop);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await FormulaMedica.updateOne({ _id: nuevaFormula._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error generando PDF de fórmula médica:', err);
    }

    res.status(201).json({
      success: true,
      message: sobrescribir 
        ? 'Fórmula médica actualizada exitosamente' 
        : 'Fórmula médica creada exitosamente',
      data: { ...nuevaFormula.toObject(), pdfUrl: pdfUrl ?? nuevaFormula.pdfUrl },
      pdfUrl: pdfUrl ?? nuevaFormula.pdfUrl
    });
  } catch (error: any) {
    console.error('Error al crear/actualizar fórmula médica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear/actualizar fórmula médica',
      error: error.message
    });
  }
};

export const obtenerFormulaMedicaPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const formula = await formulaMedicaService.obtenerFormulaMedicaPorCita(
      citaId as string,
      medicoId
    );

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
    console.error('Error al obtener fórmula médica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener fórmula médica',
      error: error.message
    });
  }
};

export const obtenerFormulasMedicasPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const formulas = await formulaMedicaService.obtenerFormulasMedicasPorPaciente(
      pacienteId as string,
      medicoId
    );

    res.json({
      success: true,
      data: formulas
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

export const obtenerFormulaMedicaPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { formulaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const formula = await formulaMedicaService.obtenerFormulaMedicaPorId(
      formulaId as string,
      medicoId
    );

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

export const eliminarFormulaMedica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { formulaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const formulaAnterior = await formulaMedicaService.obtenerFormulaMedicaPorId(
      formulaId as string,
      medicoId
    );

    if (!formulaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Fórmula médica no encontrada'
      });
      return;
    }

    const eliminada = await formulaMedicaService.eliminarFormulaMedica(
      formulaId as string,
      medicoId
    );

    if (!eliminada) {
      res.status(404).json({
        success: false,
        message: 'Fórmula médica no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'FormulaMedica',
      formulaId as string,
      formulaAnterior,
      undefined
    );

    res.json({
      success: true,
      message: 'Fórmula médica eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar fórmula médica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar fórmula médica',
      error: error.message
    });
  }
};
