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
import { registrarAccion } from '../../../utils/auditoriaHelper';

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
      .select('_id tipo estado progreso analisisIA objetivos notasMedico respuestas revisadoPorMedico revisadoEn createdAt updatedAt')
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

    const nuevaNota = { texto: notas.trim(), creadoEn: new Date() };

    const actualizado = await Interrogatorio.findByIdAndUpdate(
      interrogatorioId,
      { $push: { notasHistorial: nuevaNota } },
      { new: true }
    ).select('_id notasHistorial updatedAt');

    res.json({
      success: true,
      message: 'Nota agregada correctamente',
      data: actualizado
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const editarNotaMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const interrogatorioId = String(req.params.interrogatorioId);
    const notaId = String(req.params.notaId);
    const { texto } = req.body;

    if (typeof texto !== 'string' || !texto.trim()) {
      res.status(400).json({ success: false, message: 'El campo "texto" es requerido.' });
      return;
    }

    const interrogatorio = await Interrogatorio.findById(interrogatorioId).lean();
    if (!interrogatorio) { res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' }); return; }

    const esMiPaciente = await verificarPacienteDelMedico(medicoId, interrogatorio.pacienteId.toString());
    if (!esMiPaciente) { res.status(403).json({ success: false, message: 'Acceso no autorizado' }); return; }

    if (!mongoose.Types.ObjectId.isValid(notaId)) {
      res.status(400).json({ success: false, message: 'ID de nota inválido' });
      return;
    }

    const actualizado = await Interrogatorio.findOneAndUpdate(
      { _id: interrogatorioId, 'notasHistorial._id': new mongoose.Types.ObjectId(String(notaId)) },
      { $set: { 'notasHistorial.$.texto': texto.trim() } },
      { new: true }
    ).select('_id notasHistorial updatedAt');

    if (!actualizado) { res.status(404).json({ success: false, message: 'Nota no encontrada' }); return; }

    res.json({ success: true, message: 'Nota actualizada', data: actualizado });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const eliminarNotaMedico = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const interrogatorioId = String(req.params.interrogatorioId);
    const notaId = String(req.params.notaId);

    const interrogatorio = await Interrogatorio.findById(interrogatorioId).lean();
    if (!interrogatorio) { res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' }); return; }

    const esMiPaciente = await verificarPacienteDelMedico(medicoId, interrogatorio.pacienteId.toString());
    if (!esMiPaciente) { res.status(403).json({ success: false, message: 'Acceso no autorizado' }); return; }

    if (!mongoose.Types.ObjectId.isValid(notaId)) {
      res.status(400).json({ success: false, message: 'ID de nota inválido' });
      return;
    }

    const actualizado = await Interrogatorio.findByIdAndUpdate(
      interrogatorioId,
      { $pull: { notasHistorial: { _id: new mongoose.Types.ObjectId(String(notaId)) } } },
      { new: true }
    ).select('_id notasHistorial updatedAt');

    res.json({ success: true, message: 'Nota eliminada', data: actualizado });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const marcarPreconsultaRevisada = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { interrogatorioId } = req.params;

    if (!medicoId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const actualizado = await Interrogatorio.findByIdAndUpdate(
      interrogatorioId,
      { $set: { revisadoPorMedico: medicoId, revisadoEn: new Date() } },
      { new: true }
    ).select('_id revisadoPorMedico revisadoEn updatedAt');

    if (!actualizado) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' });
      return;
    }

    await registrarAccion(req, 'actualizar', 'Interrogatorio', String(interrogatorioId));

    res.json({ success: true, message: 'Preconsulta marcada como revisada', data: actualizado });
  } catch (err: any) {
    handleError(err, res);
  }
};

export const quitarRevisionPreconsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const { interrogatorioId } = req.params;

    if (!medicoId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const actualizado = await Interrogatorio.findByIdAndUpdate(
      interrogatorioId,
      { $set: { revisadoPorMedico: null, revisadoEn: null } },
      { new: true }
    ).select('_id revisadoPorMedico revisadoEn updatedAt');

    if (!actualizado) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' });
      return;
    }

    await registrarAccion(req, 'actualizar', 'Interrogatorio', String(interrogatorioId));

    res.json({ success: true, message: 'Revisión quitada', data: actualizado });
  } catch (err: any) {
    handleError(err, res);
  }
};
