import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Cita from '../../models/Cita';

const UMBRAL_DEMORA_MIN = 10; // minutos antes de considerar demora

/**
 * GET /api/administrativo/demoras/activas
 * Devuelve citas de hoy con estado pendiente/confirmada/en_espera que han superado
 * su hora programada + UMBRAL_DEMORA_MIN sin pasar a en_consulta.
 */
export const demorasActivas = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ahora = new Date();
    const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);

    const citas = await Cita.find({
      fecha: { $gte: inicioDia, $lt: finDia },
      estado: { $in: ['pendiente', 'confirmada', 'en_espera'] }
    })
      .populate('pacienteId', 'nombre apellido')
      .populate('medicoId', 'nombre apellido')
      .lean();

    // Filtrar las que ya superaron su hora + umbral
    const demoradas = citas
      .map((c) => {
        const [hh, mm] = (c.hora ?? '00:00').split(':').map(Number);
        const horaInicio = new Date(c.fecha);
        horaInicio.setHours(hh, mm, 0, 0);
        const minDemora = Math.floor((ahora.getTime() - horaInicio.getTime()) / 60000);
        return { ...c, minutosDemora: minDemora };
      })
      .filter((c) => c.minutosDemora >= UMBRAL_DEMORA_MIN)
      .sort((a, b) => b.minutosDemora - a.minutosDemora);

    res.json({ success: true, demoradas, total: demoradas.length });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error al obtener demoras activas.', error: err.message });
  }
};

/**
 * POST /api/administrativo/demoras/:citaId/registrar
 * Registra el motivo de la demora y actualiza el sub-documento en Cita.
 */
export const registrarDemora = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { citaId } = req.params;
    const { motivo } = req.body;
    if (!motivo?.trim()) {
      res.status(400).json({ mensaje: 'El motivo de la demora es obligatorio.' });
      return;
    }

    const ahora = new Date();
    const cita = await Cita.findById(citaId).lean();
    if (!cita) { res.status(404).json({ mensaje: 'Cita no encontrada.' }); return; }

    const [hh, mm] = (cita.hora ?? '00:00').split(':').map(Number);
    const horaInicio = new Date(cita.fecha);
    horaInicio.setHours(hh, mm, 0, 0);
    const minutosDemora = Math.max(0, Math.floor((ahora.getTime() - horaInicio.getTime()) / 60000));

    const updated = await Cita.findByIdAndUpdate(
      citaId,
      {
        $set: {
          demora: {
            detectadaEn: ahora,
            minutosDemora,
            motivo: motivo.trim(),
            registradoPor: req.userId
          }
        }
      },
      { new: true }
    ).lean();

    res.json({ success: true, cita: updated });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error al registrar la demora.', error: err.message });
  }
};

/**
 * GET /api/administrativo/demoras/reporte
 * Reporte histórico de citas con demora registrada (últimos 30 días).
 */
export const reporteDemoras = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dias = parseInt(String(req.query.dias ?? '30'), 10);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const citas = await Cita.find({
      'demora': { $exists: true },
      fecha: { $gte: desde }
    })
      .populate('pacienteId', 'nombre apellido')
      .populate('medicoId', 'nombre apellido')
      .sort({ 'demora.detectadaEn': -1 })
      .lean();

    const promedio =
      citas.length > 0
        ? Math.round(citas.reduce((sum, c) => sum + (c.demora?.minutosDemora ?? 0), 0) / citas.length)
        : 0;

    res.json({ success: true, citas, total: citas.length, promedioMinutos: promedio });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error al generar el reporte.', error: err.message });
  }
};
