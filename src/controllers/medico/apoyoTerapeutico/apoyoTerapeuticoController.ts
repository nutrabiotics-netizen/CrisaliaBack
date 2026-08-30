import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import apoyoTerapeuticoService from '../../../services/medico/apoyoTerapeutico/apoyoTerapeuticoService';
import { registrarAccion } from '../../../utils/auditoriaHelper';
import mongoose from 'mongoose';

export const crearApoyoTerapeutico = async (req: AuthRequest, res: Response): Promise<void> => {
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
    const verificacion = await apoyoTerapeuticoService.verificarHistoriaClinicaConDiagnosticos(
      citaId,
      medicoId
    );

    if (!verificacion.existe) {
      res.status(400).json({
        success: false,
        message: 'Debe crear y guardar la historia clínica antes de crear un apoyo terapéutico. Por favor, complete la historia clínica primero.'
      });
      return;
    }

    if (!verificacion.diagnosticos || verificacion.diagnosticos.length === 0) {
      res.status(400).json({
        success: false,
        message: 'La historia clínica debe tener al menos un diagnóstico antes de crear un apoyo terapéutico. Por favor, agregue diagnósticos en la Historia Clínica.'
      });
      return;
    }

    // Verificar si ya existe un apoyo terapéutico para esta cita
    const apoyoTerapeuticoExistente = await apoyoTerapeuticoService.obtenerApoyoTerapeuticoPorCita(
      citaId,
      medicoId
    );

    if (apoyoTerapeuticoExistente) {
      res.status(409).json({
        success: false,
        message: 'Ya existe un apoyo terapéutico para esta cita',
        data: {
          apoyoTerapeuticoId: apoyoTerapeuticoExistente._id
        }
      });
      return;
    }

    // Crear nuevo apoyo terapéutico
    const nuevoApoyoTerapeutico = await apoyoTerapeuticoService.crearApoyoTerapeutico(
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
      'ApoyoTerapeutico',
      nuevoApoyoTerapeutico._id.toString(),
      undefined,
      {
        pacienteId: nuevoApoyoTerapeutico.pacienteId,
        citaId: nuevoApoyoTerapeutico.citaId,
        serviciosRemitidos: nuevoApoyoTerapeutico.serviciosRemitidos.length
      }
    );

    res.status(201).json({
      success: true,
      message: 'Apoyo terapéutico creado exitosamente',
      data: nuevoApoyoTerapeutico.toObject?.() ?? nuevoApoyoTerapeutico,
    });
  } catch (error: any) {
    console.error('Error al crear apoyo terapéutico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear apoyo terapéutico',
      error: error.message
    });
  }
};

export const obtenerApoyoTerapeuticoPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const apoyoTerapeutico = await apoyoTerapeuticoService.obtenerApoyoTerapeuticoPorCita(
      citaId as string,
      medicoId
    );

    if (!apoyoTerapeutico) {
      res.status(404).json({
        success: false,
        message: 'Apoyo terapéutico no encontrado para esta cita'
      });
      return;
    }

    res.json({
      success: true,
      data: apoyoTerapeutico
    });
  } catch (error: any) {
    console.error('Error al obtener apoyo terapéutico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener apoyo terapéutico',
      error: error.message
    });
  }
};

export const obtenerApoyosTerapeuticosPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const apoyosTerapeuticos = await apoyoTerapeuticoService.obtenerApoyosTerapeuticosPorPaciente(
      pacienteId as string,
      medicoId
    );

    res.json({
      success: true,
      data: apoyosTerapeuticos
    });
  } catch (error: any) {
    console.error('Error al obtener apoyos terapéuticos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener apoyos terapéuticos',
      error: error.message
    });
  }
};

export const obtenerApoyoTerapeuticoPorId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { apoyoTerapeuticoId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    const apoyoTerapeutico = await apoyoTerapeuticoService.obtenerApoyoTerapeuticoPorId(
      apoyoTerapeuticoId as string,
      medicoId
    );

    if (!apoyoTerapeutico) {
      res.status(404).json({
        success: false,
        message: 'Apoyo terapéutico no encontrado'
      });
      return;
    }

    res.json({
      success: true,
      data: apoyoTerapeutico
    });
  } catch (error: any) {
    console.error('Error al obtener apoyo terapéutico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener apoyo terapéutico',
      error: error.message
    });
  }
};

export const actualizarApoyoTerapeutico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { apoyoTerapeuticoId } = req.params;
    const datosActualizados = req.body;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Validar serviciosRemitidos si se están actualizando
    if (datosActualizados.serviciosRemitidos) {
      if (!Array.isArray(datosActualizados.serviciosRemitidos) || datosActualizados.serviciosRemitidos.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Debe haber al menos un servicio remitido'
        });
        return;
      }

      // Validar que cada servicio tenga motivo
      for (const servicio of datosActualizados.serviciosRemitidos) {
        if (!servicio.motivo || servicio.motivo.trim() === '') {
          res.status(400).json({
            success: false,
            message: 'Cada servicio remitido debe tener un motivo'
          });
          return;
        }
      }
    }

    // Obtener datos anteriores para auditoría
    const apoyoTerapeuticoAnterior = await apoyoTerapeuticoService.obtenerApoyoTerapeuticoPorId(
      apoyoTerapeuticoId as string,
      medicoId
    );

    if (!apoyoTerapeuticoAnterior) {
      res.status(404).json({
        success: false,
        message: 'Apoyo terapéutico no encontrado'
      });
      return;
    }

    const apoyoTerapeuticoActualizado = await apoyoTerapeuticoService.actualizarApoyoTerapeutico(
      apoyoTerapeuticoId as string,
      medicoId,
      datosActualizados,
      medicoId,
      'Medico'
    );

    if (!apoyoTerapeuticoActualizado) {
      res.status(404).json({
        success: false,
        message: 'Apoyo terapéutico no encontrado'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'actualizar',
      'ApoyoTerapeutico',
      apoyoTerapeuticoId as string,
      apoyoTerapeuticoAnterior,
      apoyoTerapeuticoActualizado
    );

    res.json({
      success: true,
      message: 'Apoyo terapéutico actualizado exitosamente',
      data: apoyoTerapeuticoActualizado.toObject?.() ?? apoyoTerapeuticoActualizado,
    });
  } catch (error: any) {
    console.error('Error al actualizar apoyo terapéutico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar apoyo terapéutico',
      error: error.message
    });
  }
};

export const eliminarApoyoTerapeutico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { apoyoTerapeuticoId } = req.params;

    if (!medicoId) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    // Obtener datos anteriores para auditoría
    const apoyoTerapeuticoAnterior = await apoyoTerapeuticoService.obtenerApoyoTerapeuticoPorId(
      apoyoTerapeuticoId as string,
      medicoId
    );

    if (!apoyoTerapeuticoAnterior) {
      res.status(404).json({
        success: false,
        message: 'Apoyo terapéutico no encontrado'
      });
      return;
    }

    const eliminado = await apoyoTerapeuticoService.eliminarApoyoTerapeutico(
      apoyoTerapeuticoId as string,
      medicoId
    );

    if (!eliminado) {
      res.status(404).json({
        success: false,
        message: 'Apoyo terapéutico no encontrado'
      });
      return;
    }

    // Registrar en auditoría
    await registrarAccion(
      req,
      'eliminar',
      'ApoyoTerapeutico',
      apoyoTerapeuticoId as string,
      apoyoTerapeuticoAnterior,
      undefined
    );

    res.json({
      success: true,
      message: 'Apoyo terapéutico eliminado exitosamente'
    });
  } catch (error: any) {
    console.error('Error al eliminar apoyo terapéutico:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar apoyo terapéutico',
      error: error.message
    });
  }
};
