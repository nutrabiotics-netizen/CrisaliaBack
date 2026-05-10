/**
 * anamnesisController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-2 — El médico consulta y anota sobre el interrogatorio / anamnesis
 * de sus pacientes.
 *
 * Rutas:
 *   GET  /medico/anamnesis/paciente/:pacienteId        → listado de interrogatorios
 *   GET  /medico/anamnesis/:interrogatorioId           → detalle completo
 *   PUT  /medico/anamnesis/:interrogatorioId/notas     → guardar/actualizar notas médico
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import Cita from '../../../models/Cita';
import Interrogatorio from '../../../models/Interrogatorio';
import Paciente from '../../../models/Paciente';
import { handleError } from '../../../utils/errors';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Verifica que el paciente esté asociado al médico (tiene al menos una cita). */
async function verificarPacienteDelMedico(
  medicoId: string,
  pacienteId: string
): Promise<boolean> {
  const cita = await Cita.findOne({
    medicoId: new mongoose.Types.ObjectId(medicoId),
    pacienteId: new mongoose.Types.ObjectId(pacienteId)
  })
    .select('_id')
    .lean();
  return cita !== null;
}

// ─── Controladores ───────────────────────────────────────────────────────────

/**
 * GET /medico/anamnesis/paciente/:pacienteId
 * Lista todos los interrogatorios del paciente (más reciente primero).
 */
export const listarAnamnesisDelPaciente = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const { pacienteId } = req.params;

    const esMiPaciente = await verificarPacienteDelMedico(medicoId, String(pacienteId));
    if (!esMiPaciente) {
      res.status(403).json({ success: false, message: 'Paciente no pertenece a este médico' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId)
      .select('nombre apellido email foto')
      .lean();

    const interrogatorios = await Interrogatorio.find({ pacienteId })
      .sort({ createdAt: -1 })
      .select('_id tipo estado progreso analisisIA objetivos notasMedico createdAt updatedAt')
      .lean();

    res.json({
      success: true,
      data: { paciente, interrogatorios }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * GET /medico/anamnesis/:interrogatorioId
 * Devuelve el interrogatorio completo (respuestas, IA, notas médico).
 */
export const obtenerAnamnesisDetalle = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const { interrogatorioId } = req.params;

    const interrogatorio = await Interrogatorio.findById(interrogatorioId).lean();
    if (!interrogatorio) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' });
      return;
    }

    const pacienteId = interrogatorio.pacienteId.toString();
    const esMiPaciente = await verificarPacienteDelMedico(medicoId, pacienteId);
    if (!esMiPaciente) {
      res.status(403).json({ success: false, message: 'Paciente no pertenece a este médico' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId)
      .select('nombre apellido email foto fechaNacimiento genero')
      .lean();

    res.json({
      success: true,
      data: { interrogatorio, paciente }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

/**
 * PUT /medico/anamnesis/:interrogatorioId/notas
 * El médico guarda o actualiza sus propias notas clínicas sobre la anamnesis.
 * Body: { notas: string }
 */
export const guardarNotasMedico = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const { interrogatorioId } = req.params;
    const { notas } = req.body;

    if (typeof notas !== 'string') {
      res.status(400).json({ success: false, message: 'El campo "notas" es requerido y debe ser texto.' });
      return;
    }

    const interrogatorio = await Interrogatorio.findById(interrogatorioId).lean();
    if (!interrogatorio) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' });
      return;
    }

    const esMiPaciente = await verificarPacienteDelMedico(
      medicoId,
      interrogatorio.pacienteId.toString()
    );
    if (!esMiPaciente) {
      res.status(403).json({ success: false, message: 'Paciente no pertenece a este médico' });
      return;
    }

    const actualizado = await Interrogatorio.findByIdAndUpdate(
      interrogatorioId,
      { $set: { notasMedico: notas.trim() } },
      { new: true }
    ).select('_id notasMedico updatedAt');

    res.json({
      success: true,
      message: 'Notas guardadas correctamente',
      data: actualizado
    });
  } catch (err: any) {
    handleError(err, res);
  }
};
