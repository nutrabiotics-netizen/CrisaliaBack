import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import historiaClinicaService from '../../../services/medico/historiaClinica/historiaClinicaService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import { generateHistoriaPdf } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import HistoriaClinica from '../../../models/HistoriaClinica';
import Paciente from '../../../models/Paciente';
import { summarizeLastClinicalHistory } from '../../../services/ai/bedrock.service';

export const crearHistoriaClinica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const historiaData = req.body;

    // Validar campos requeridos
    if (!historiaData.pacienteId || !historiaData.citaId) {
      res.status(400).json({
        success: false,
        message: 'pacienteId y citaId son requeridos'
      });
      return;
    }

    // Verificar si ya existe una historia clínica para esta cita
    const historiaExistente = await historiaClinicaService.obtenerHistoriaClinicaPorCita(
      historiaData.citaId,
      medicoId
    );

    if (historiaExistente) {
      res.status(400).json({
        success: false,
        message: 'Ya existe una historia clínica para esta cita'
      });
      return;
    }

    const nuevaHistoria = await historiaClinicaService.crearHistoriaClinica(
      {
        ...historiaData,
        medicoId
      },
      medicoId,
      'Medico'
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'HistoriaClinica',
      nuevaHistoria._id.toString(),
      undefined,
      {
        pacienteId: nuevaHistoria.pacienteId,
        citaId: nuevaHistoria.citaId,
        tipoActividad: nuevaHistoria.tipoActividad
      }
    );

    let pdfUrl: string | undefined;
    try {
      const historiaParaPdf = await HistoriaClinica.findById(nuevaHistoria._id)
        .populate('medicoId', 'nombre apellido logoUrl')
        .lean();
      if (historiaParaPdf) {
        const paciente = await Paciente.findById(nuevaHistoria.pacienteId).select('numeroDocumento').lean();
        const numeroDoc = paciente?.numeroDocumento ?? String(nuevaHistoria.pacienteId);
        const citaIdStr = String(nuevaHistoria.citaId);
        const key = buildCitaDocumentKey(numeroDoc, citaIdStr, 'historia-clinica');
        const buffer = await generateHistoriaPdf(historiaParaPdf);
        pdfUrl = await uploadPDFAndGetUrl(buffer, key);
        await HistoriaClinica.updateOne({ _id: nuevaHistoria._id }, { pdfUrl });
      }
    } catch (err) {
      console.error('Error generando PDF de historia clínica:', err);
    }

    res.status(201).json({
      success: true,
      message: 'Historia clínica creada exitosamente',
      data: { ...nuevaHistoria.toObject(), pdfUrl: pdfUrl ?? (nuevaHistoria as any).pdfUrl },
      pdfUrl
    });
  } catch (error: any) {
    console.error('Error al crear historia clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear historia clínica',
      error: error.message
    });
  }
};

export const obtenerHistoriaClinica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { historiaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const historia = await historiaClinicaService.obtenerHistoriaClinicaPorId(
      historiaId,
      medicoId
    );

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

export const obtenerHistoriaClinicaPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const historia = await historiaClinicaService.obtenerHistoriaClinicaPorCita(
      citaId,
      medicoId
    );

    res.json({
      success: true,
      data: historia
    });
  } catch (error: any) {
    console.error('Error al obtener historia clínica por cita:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historia clínica',
      error: error.message
    });
  }
};

export const obtenerHistoriasClinicasPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const historias = await historiaClinicaService.obtenerHistoriasClinicasPorPaciente(
      pacienteId,
      medicoId
    );

    res.json({
      success: true,
      data: historias
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

export const actualizarHistoriaClinica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { historiaId } = req.params;
    const datosActualizados = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const historiaAnterior = await historiaClinicaService.obtenerHistoriaClinicaPorId(
      historiaId,
      medicoId
    );

    if (!historiaAnterior) {
      res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
      return;
    }

    const historiaActualizada = await historiaClinicaService.actualizarHistoriaClinica(
      historiaId,
      medicoId,
      datosActualizados,
      medicoId,
      'Medico'
    );

    if (!historiaActualizada) {
      res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'HistoriaClinica',
      historiaId,
      historiaAnterior,
      historiaActualizada
    );

    res.json({
      success: true,
      message: 'Historia clínica actualizada exitosamente',
      data: historiaActualizada
    });
  } catch (error: any) {
    console.error('Error al actualizar historia clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar historia clínica',
      error: error.message
    });
  }
};

export const eliminarHistoriaClinica = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { historiaId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const eliminada = await historiaClinicaService.eliminarHistoriaClinica(
      historiaId,
      medicoId
    );

    if (!eliminada) {
      res.status(404).json({
        success: false,
        message: 'Historia clínica no encontrada'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'HistoriaClinica',
      historiaId,
      undefined,
      undefined
    );

    res.json({
      success: true,
      message: 'Historia clínica eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar historia clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar historia clínica',
      error: error.message
    });
  }
};

export const obtenerResumenUltimaHistoria = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { pacienteId } = req.params;

    if (!medicoId) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      return;
    }

    // Buscar la historia más reciente del paciente
    const ultimaHistoria = await HistoriaClinica.findOne({ pacienteId })
      .sort({ fechaRegistro: -1 })
      .lean();

    if (!ultimaHistoria) {
      res.json({
        success: true,
        data: {
          resumen: 'No se encontraron historias clínicas previas para este paciente.',
          fecha: null
        }
      });
      return;
    }

    // Generar resumen con Bedrock
    const resumen = await summarizeLastClinicalHistory(ultimaHistoria);

    res.json({
      success: true,
      data: {
        resumen,
        fecha: ultimaHistoria.fechaRegistro,
        tipoActividad: ultimaHistoria.tipoActividad
      }
    });
  } catch (error: any) {
    console.error('Error al obtener resumen de última historia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener resumen de la historia clínica',
      error: error.message
    });
  }
};
