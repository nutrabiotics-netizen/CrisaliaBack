import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import interrogatorioService from '../../../services/paciente/interrogatorio/interrogatorioService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import Interrogatorio from '../../../models/Interrogatorio';
import { AIService } from '../../../services/ai/AIService';

export const crearInterrogatorio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { tipo } = req.body;

    // Verificar si ya existe un interrogatorio activo del mismo tipo
    const interrogatorioActivo = await interrogatorioService.obtenerInterrogatorioActivo(
      pacienteId,
      tipo || 'primera_vez'
    );

    if (interrogatorioActivo) {
      res.status(400).json({
        success: false,
        message: 'Ya existe un interrogatorio en proceso',
        data: {
          _id: interrogatorioActivo._id?.toString(),
          estado: interrogatorioActivo.estado,
          progreso: interrogatorioActivo.progreso
        }
      });
      return;
    }

    const interrogatorio = await interrogatorioService.crearInterrogatorio({
      pacienteId,
      tipo: tipo || 'primera_vez',
      creadoPor: pacienteId,
      creadoPorRol: 'Paciente'
    });

    // Registrar en auditoría
    await registrarAccion(
      req,
      'crear',
      'Interrogatorio',
      interrogatorio._id.toString(),
      undefined,
      {
        pacienteId: interrogatorio.pacienteId.toString(),
        tipo: interrogatorio.tipo,
        estado: interrogatorio.estado
      }
    );

    res.status(201).json({
      success: true,
      message: 'Interrogatorio creado exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        pacienteId: interrogatorio.pacienteId.toString(),
        tipo: interrogatorio.tipo,
        estado: interrogatorio.estado,
        progreso: interrogatorio.progreso,
        respuestas: interrogatorio.respuestas,
        createdAt: interrogatorio.createdAt,
        updatedAt: interrogatorio.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error al crear interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear interrogatorio',
      error: error.message
    });
  }
};

export const obtenerInterrogatorios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const { tipo, estado } = req.query;

    const interrogatorios = await interrogatorioService.obtenerInterrogatoriosPaciente(
      pacienteId,
      tipo as any,
      estado as any
    );

    res.json({
      success: true,
      data: interrogatorios.map(i => ({
        _id: i._id?.toString(),
        tipo: i.tipo,
        estado: i.estado,
        progreso: i.progreso,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt
      }))
    });
  } catch (error: any) {
    console.error('Error al obtener interrogatorios:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interrogatorios',
      error: error.message
    });
  }
};

export const obtenerInterrogatorioPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interrogatorio = await interrogatorioService.obtenerInterrogatorioPorId(
      interrogatorioId,
      pacienteId
    );

    if (!interrogatorio) {
      res.status(404).json({
        success: false,
        message: 'Interrogatorio no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: interrogatorio._id?.toString(),
        pacienteId: interrogatorio.pacienteId.toString(),
        tipo: interrogatorio.tipo,
        estado: interrogatorio.estado,
        progreso: interrogatorio.progreso,
        respuestas: interrogatorio.respuestas,
        observacionesIA: interrogatorio.observacionesIA,
        analisisIA: interrogatorio.analisisIA,
        objetivos: interrogatorio.objetivos,
        createdAt: interrogatorio.createdAt,
        updatedAt: interrogatorio.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error al obtener interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener interrogatorio',
      error: error.message
    });
  }
};

export const verificarIncoherencias = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;
    const { mapaCorporal, respuestas } = req.body;

    if (!pacienteId || !interrogatorioId) {
      res.status(400).json({ success: false, message: 'Faltan parámetros' });
      return;
    }

    const incoherencias = await AIService.detectarIncoherencias(mapaCorporal, respuestas);

    res.json({
      success: true,
      data: { incoherencias }
    });
  } catch (error: any) {
    console.error('Error al verificar incoherencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error en la verificación de IA',
      error: error.message
    });
  }
};

export const actualizarRespuestas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;
    const { respuestas } = req.body;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    if (!respuestas || typeof respuestas !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Las respuestas son requeridas y deben ser un objeto'
      });
      return;
    }

    // Obtener interrogatorio anterior para auditoría
    const interrogatorioAnterior = await Interrogatorio.findById(interrogatorioId).lean();
    if (!interrogatorioAnterior) {
      res.status(404).json({
        success: false,
        message: 'Interrogatorio no encontrado'
      });
      return;
    }

    const datosAnteriores = {
      respuestas: interrogatorioAnterior.respuestas,
      progreso: interrogatorioAnterior.progreso,
      estado: interrogatorioAnterior.estado
    };

    const interrogatorio = await interrogatorioService.actualizarRespuestas(
      interrogatorioId,
      pacienteId,
      {
        respuestas,
        actualizadoPor: pacienteId,
        actualizadoPorRol: 'Paciente'
      }
    );

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'Interrogatorio',
      interrogatorioId,
      datosAnteriores,
      {
        respuestas: interrogatorio.respuestas,
        progreso: interrogatorio.progreso,
        estado: interrogatorio.estado
      }
    );

    res.json({
      success: true,
      message: 'Respuestas actualizadas exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        progreso: interrogatorio.progreso,
        estado: interrogatorio.estado,
        respuestas: interrogatorio.respuestas
      }
    });
  } catch (error: any) {
    console.error('Error al actualizar respuestas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar respuestas',
      error: error.message
    });
  }
};

export const completarInterrogatorio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interrogatorio = await interrogatorioService.completarInterrogatorio(
      interrogatorioId,
      pacienteId
    );

    res.json({
      success: true,
      message: 'Interrogatorio completado exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        estado: interrogatorio.estado,
        analisisIA: interrogatorio.analisisIA,
        objetivos: interrogatorio.objetivos
      }
    });
  } catch (error: any) {
    console.error('Error al completar interrogatorio:', error);
    res.status(500).json({
      success: false,
      message: 'Error al completar interrogatorio',
      error: error.message
    });
  }
};

export const generarAnalisisIA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    const { interrogatorioId } = req.params;

    if (!pacienteId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const interrogatorio = await interrogatorioService.generarAnalisisIA(
      interrogatorioId,
      pacienteId
    );

    res.json({
      success: true,
      message: 'Análisis IA generado exitosamente',
      data: {
        _id: interrogatorio._id.toString(),
        analisisIA: interrogatorio.analisisIA,
        objetivos: interrogatorio.objetivos,
        observacionesIA: interrogatorio.observacionesIA
      }
    });
  } catch (error: any) {
    console.error('Error al generar análisis IA:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar análisis IA',
      error: error.message
    });
  }
};
