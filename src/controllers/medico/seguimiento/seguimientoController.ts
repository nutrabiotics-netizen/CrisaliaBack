/**
 * seguimientoController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-2 — Seguimiento clínico de pacientes del médico.
 *
 * Rutas:
 *   GET /medico/seguimiento                   → lista pacientes con estado de seguimiento
 *   GET /medico/seguimiento/paciente/:id      → detalle de seguimiento de un paciente
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import Cita from '../../../models/Cita';
import Interrogatorio from '../../../models/Interrogatorio';
import HistoriaClinica from '../../../models/HistoriaClinica';
import Paciente from '../../../models/Paciente';
import { handleError } from '../../../utils/errors';

// ─── Listar pacientes con su estado de seguimiento ───────────────────────────

/**
 * GET /medico/seguimiento
 * Para cada paciente del médico, devuelve:
 *  - Datos básicos del paciente
 *  - Próxima cita (si existe)
 *  - Última cita completada
 *  - Progreso anamnesis (última)
 *  - Total historias clínicas
 */
export const listarSeguimiento = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const medicoObjId = new mongoose.Types.ObjectId(medicoId);

    // 1. Pacientes únicos que tienen cita con este médico
    const pacientesIds = await Cita.distinct('pacienteId', { medicoId: medicoObjId });

    if (pacientesIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    // 2. Para cada paciente, obtener datos en paralelo
    const ahora = new Date();
    // Obtener la fecha de hoy en Colombia (UTC-5) y usar medianoche UTC de ese día
    // Esto incluye citas almacenadas como T00:00:00Z o T05:00:00Z
    const colombiaDateStr = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const inicioDia = new Date(colombiaDateStr + 'T00:00:00.000Z');

    const resultados = await Promise.all(
      pacientesIds.map(async (pacienteId) => {
        const [paciente, proximaCita, ultimaCita, ultimoInterrogatorio, totalHC] =
          await Promise.all([
            Paciente.findById(pacienteId)
              .select('nombre apellido email foto fechaNacimiento')
              .lean(),

            Cita.findOne({
              medicoId: medicoObjId,
              pacienteId,
              fecha: { $gte: inicioDia },
              estado: { $in: ['pendiente', 'confirmada', 'en_espera', 'en_consulta'] }
            })
              .sort({ fecha: 1 })
              .select('fecha hora tipo modalidad estado')
              .lean(),

            Cita.findOne({
              medicoId: medicoObjId,
              pacienteId,
              estado: 'completada'
            })
              .sort({ fecha: -1 })
              .select('fecha hora tipo')
              .lean(),

            Interrogatorio.findOne({ pacienteId })
              .sort({ createdAt: -1 })
              .select('tipo estado progreso analisisIA objetivos notasMedico updatedAt')
              .lean(),

            HistoriaClinica.countDocuments({
              medicoId: medicoObjId,
              pacienteId,
              activo: { $ne: false }
            })
          ]);

        if (!paciente) return null;

        return {
          paciente,
          proximaCita,
          ultimaCita,
          anamnesis: ultimoInterrogatorio
            ? {
                _id: ultimoInterrogatorio._id,
                tipo: (ultimoInterrogatorio as any).tipo,
                estado: (ultimoInterrogatorio as any).estado,
                progreso: (ultimoInterrogatorio as any).progreso ?? 0,
                tieneAnalisisIA: !!( ultimoInterrogatorio as any).analisisIA,
                notasMedico: (ultimoInterrogatorio as any).notasMedico ?? null,
                updatedAt: (ultimoInterrogatorio as any).updatedAt
              }
            : null,
          totalHistoriasClinicas: totalHC
        };
      })
    );

    const data = resultados.filter(Boolean);

    res.json({ success: true, data });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Detalle de seguimiento de un paciente ────────────────────────────────────

/**
 * GET /medico/seguimiento/paciente/:pacienteId
 * Devuelve la línea de tiempo clínica del paciente:
 *  - Todas las citas (ordenadas desc)
 *  - Todos los interrogatorios
 *  - Últimas 5 historias clínicas
 *  - Evolución del progreso de anamnesis
 */
export const obtenerSeguimientoPaciente = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const medicoId = req.userId!;
    const { pacienteId } = req.params;
    const medicoObjId = new mongoose.Types.ObjectId(medicoId);
    const pacienteObjId = new mongoose.Types.ObjectId(String(pacienteId));

    // Verificar que el paciente pertenece a este médico
    const tieneCita = await Cita.findOne({ medicoId: medicoObjId, pacienteId: pacienteObjId })
      .select('_id')
      .lean();
    if (!tieneCita) {
      res.status(403).json({ success: false, message: 'Paciente no pertenece a este médico' });
      return;
    }

    const ahora = new Date();

    const [paciente, citas, interrogatorios, historias] = await Promise.all([
      Paciente.findById(pacienteId)
        .select('nombre apellido email foto fechaNacimiento genero telefono')
        .lean(),

      Cita.find({ medicoId: medicoObjId, pacienteId: pacienteObjId })
        .sort({ fecha: -1 })
        .select('fecha hora tipo modalidad estado createdAt')
        .lean(),

      Interrogatorio.find({ pacienteId: pacienteObjId })
        .sort({ createdAt: -1 })
        .select('tipo estado progreso analisisIA objetivos observacionesIA notasMedico createdAt updatedAt')
        .lean(),

      HistoriaClinica.find({
        medicoId: medicoObjId,
        pacienteId: pacienteObjId,
        activo: { $ne: false }
      })
        .sort({ fechaRegistro: -1 })
        .limit(5)
        .select('fechaRegistro motivo diagnostico tipo createdAt')
        .lean()
    ]);

    // Evolución progreso anamnesis
    const evolucionAnamnesis = interrogatorios.map((i: any) => ({
      _id: i._id,
      tipo: i.tipo,
      estado: i.estado,
      progreso: i.progreso ?? 0,
      fecha: i.createdAt
    }));

    // Próxima cita
    const proximaCita = citas.find(
      (c: any) =>
        new Date(c.fecha) >= ahora &&
        ['pendiente', 'confirmada'].includes(c.estado)
    ) ?? null;

    res.json({
      success: true,
      data: {
        paciente,
        proximaCita,
        totalCitas: citas.length,
        citas,
        evolucionAnamnesis,
        ultimoInterrogatorio: interrogatorios[0] ?? null,
        ultimasHistorias: historias
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};
