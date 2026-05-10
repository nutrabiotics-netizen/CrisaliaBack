/**
 * consultaController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-7 — Ciclo de vida de la consulta presencial / virtual.
 *
 * GET  /medico/consulta/:citaId        → datos completos de la cita + contexto paciente
 * PUT  /medico/consulta/:citaId/iniciar → estado 'en_consulta'
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import Cita from '../../../models/Cita';
import Interrogatorio from '../../../models/Interrogatorio';
import HistoriaClinica from '../../../models/HistoriaClinica';
import { handleError } from '../../../utils/errors';

// ─── Obtener consulta ─────────────────────────────────────────────────────────

export const obtenerConsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const { citaId } = req.params;

    const cita = await Cita.findOne({ _id: citaId, medicoId })
      .populate('pacienteId', 'nombre apellido email telefono fechaNacimiento genero')
      .lean();

    if (!cita) {
      res.status(404).json({ success: false, message: 'Cita no encontrada.' });
      return;
    }

    const pacienteId = cita.pacienteId as mongoose.Types.ObjectId;

    // Contexto clínico del paciente (en paralelo)
    const [ultimoInterrogatorio, totalHC, ultimaHC] = await Promise.all([
      Interrogatorio.findOne({ pacienteId })
        .sort({ createdAt: -1 })
        .select('analisisIA objetivos estado progreso')
        .lean(),

      HistoriaClinica.countDocuments({
        medicoId,
        pacienteId,
        activo: { $ne: false }
      }),

      HistoriaClinica.findOne({
        medicoId,
        pacienteId,
        activo: { $ne: false }
      })
        .sort({ fechaRegistro: -1 })
        .select('motivo diagnostico fechaRegistro')
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        cita,
        contexto: {
          interrogatorio: ultimoInterrogatorio ?? null,
          totalHistoriasClinicas: totalHC,
          ultimaHistoriaClinica: ultimaHC ?? null
        }
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Iniciar consulta ─────────────────────────────────────────────────────────

export const iniciarConsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const { citaId } = req.params;

    const cita = await Cita.findOneAndUpdate(
      {
        _id: citaId,
        medicoId,
        estado: { $in: ['pendiente', 'confirmada', 'en_espera'] }
      },
      {
        $set: {
          estado: 'en_consulta',
          horaLlegada: new Date()
        }
      },
      { new: true }
    ).lean();

    if (!cita) {
      res.status(404).json({
        success: false,
        message: 'Cita no encontrada o ya no se puede iniciar.'
      });
      return;
    }

    res.json({ success: true, data: cita });
  } catch (err: any) {
    handleError(err, res);
  }
};
