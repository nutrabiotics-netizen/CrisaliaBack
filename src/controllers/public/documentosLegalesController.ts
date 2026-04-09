import { Request, Response } from 'express';
import DocumentoLegal from '../../models/DocumentoLegal';
import ConfiguracionSeguridadPaciente from '../../models/ConfiguracionSeguridadPaciente';
import { AuthRequest } from '../../middleware/auth';

/**
 * Obtiene todos los documentos legales activos.
 */
export const obtenerDocumentosActivos = async (_req: Request, res: Response): Promise<void> => {
  try {
    const documentos = await DocumentoLegal.find({ activo: true }).sort({ createdAt: 1 });
    res.json({
      success: true,
      data: documentos
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener documentos legales',
      error: error.message
    });
  }
};

/**
 * Registra la aceptación de un documento por parte del paciente.
 */
export const aceptarDocumento = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { slug } = req.body;

    if (!pacienteId) {
       res.status(401).json({ success: false, message: 'Usuario no autenticado' });
       return;
    }

    const documento = await DocumentoLegal.findOne({ slug, activo: true });
    if (!documento) {
       res.status(404).json({ success: false, message: 'Documento no encontrado o inactivo' });
       return;
    }

    // Actualizar configuración de seguridad del paciente
    let config = await ConfiguracionSeguridadPaciente.findOne({ paciente: pacienteId });
    if (!config) {
      config = new ConfiguracionSeguridadPaciente({ paciente: pacienteId });
    }

    if (!config.consentimientosDetalle) {
      config.consentimientosDetalle = {};
    }

    // Guardar fecha de aceptación para el slug específico
    config.consentimientosDetalle[slug] = new Date().toISOString();
    
    // Marcar flags genéricos según el tipo si es necesario
    if (documento.tipo === 'terminos') config.aceptaTerminos = true;
    if (documento.tipo === 'consentimiento') config.aceptaConsentimiento = true;

    await config.save();

    res.json({
      success: true,
      message: `Documento ${documento.titulo} aceptado correctamente`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al registrar aceptación',
      error: error.message
    });
  }
};
