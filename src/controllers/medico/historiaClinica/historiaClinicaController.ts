import { Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../../../middleware/auth';
import historiaClinicaService from '../../../services/medico/historiaClinica/historiaClinicaService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import HistoriaClinica from '../../../models/HistoriaClinica';
import { summarizeLastClinicalHistory } from '../../../services/ai/bedrock.service';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';


/**
 * GET /api/public/hc/:token
 * Devuelve la HC sin autenticación (token de 48h generado al crear la HC).
 */
export const obtenerHCPublica = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    let payload: { historiaId: string };
    try {
      payload = jwt.verify(token as string, JWT_SECRET) as unknown as { historiaId: string };
    } catch {
      res.status(401).json({ mensaje: 'Enlace inválido o expirado.' });
      return;
    }
    const historia = await HistoriaClinica.findById(payload.historiaId)
      .populate('medicoId', 'nombre apellido especialidad')
      .lean();
    if (!historia) {
      res.status(404).json({ mensaje: 'Historia clínica no encontrada.' });
      return;
    }
    res.json({ success: true, data: historia });
  } catch (err) {
    console.error('[hc-publica]:', err);
    res.status(500).json({ mensaje: 'Error al obtener la historia clínica.' });
  }
};

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

    const { borrador, ...camposHistoria } = historiaData;

    // ─── Modo borrador: upsert sin PDF (guardar avance durante la consulta) ───
    if (borrador) {
      const historiaExistente = await historiaClinicaService.obtenerHistoriaClinicaPorCita(
        camposHistoria.citaId,
        medicoId
      );
      if (historiaExistente) {
        // Actualizar borrador existente sin generar PDF
        const actualizada = await historiaClinicaService.actualizarHistoriaClinica(
          String(historiaExistente._id),
          medicoId,
          camposHistoria
        );
        res.status(200).json({ success: true, message: 'Borrador actualizado', data: actualizada });
      } else {
        // Crear nuevo borrador sin PDF
        const nuevoBorrador = await historiaClinicaService.crearHistoriaClinica(
          { ...camposHistoria, medicoId },
          medicoId,
          'Medico'
        );
        res.status(201).json({ success: true, message: 'Borrador creado', data: nuevoBorrador });
      }
      return;
    }

    // ─── Flujo normal: crear/actualizar con PDF ──────────────────────────────
    const historiaExistente = await historiaClinicaService.obtenerHistoriaClinicaPorCita(
      camposHistoria.citaId,
      medicoId
    );

    // Si ya existe un borrador, actualizarlo con los datos finales
    let nuevaHistoria: any;
    if (historiaExistente) {
      nuevaHistoria = await historiaClinicaService.actualizarHistoriaClinica(
        String(historiaExistente._id),
        medicoId,
        camposHistoria
      );
      if (!nuevaHistoria) {
        res.status(400).json({ success: false, message: 'No se pudo actualizar la historia clínica existente' });
        return;
      }
    } else {
      nuevaHistoria = await historiaClinicaService.crearHistoriaClinica(
        { ...camposHistoria, medicoId },
        medicoId,
        'Medico'
      );
    }

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

    res.status(201).json({
      success: true,
      message: 'Historia clínica creada exitosamente',
      data: nuevaHistoria.toObject(),
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
      historiaId as string,
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
      citaId as string,
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
      pacienteId as string,
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
      historiaId as string,
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
      historiaId as string,
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
      historiaId as string,
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
      historiaId as string,
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
      historiaId as string,
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

    console.log('[HistoriaClinicaController] Historia buscada para paciente:', {
      pacienteId,
      encontrada: !!ultimaHistoria
    });

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
