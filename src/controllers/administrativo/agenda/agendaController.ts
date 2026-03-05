import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth';
import Cita from '../../../models/Cita';
import mongoose from 'mongoose';

/** Formatear hora 24h a formato 12h AM/PM */
function formatearHora(hora24: string): string {
  if (!hora24) return hora24;
  const [hStr, mStr] = hora24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ? parseInt(mStr, 10) : 0;
  const periodo = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${periodo}`;
}

/** Parsea YYYY-MM-DD a Date inicio del día UTC */
function parseFechaInicio(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 0, 0, 0, 0));
}

/** Parsea YYYY-MM-DD a Date fin del día UTC (23:59:59.999) */
function parseFechaFin(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 23, 59, 59, 999));
}

/**
 * Listar citas para el panel analítico (administrativo).
 * Query: fecha (un día) O fechaInicio + fechaFin (rango), medicoId (opcional).
 * Devuelve citas no canceladas con paciente y médico poblados.
 */
export const listarCitas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const hoyStr = new Date().toISOString().split('T')[0];
    const fechaStr = (req.query.fecha as string) || '';
    const fechaInicioStr = (req.query.fechaInicio as string) || '';
    const fechaFinStr = (req.query.fechaFin as string) || '';
    const medicoId = req.query.medicoId as string | undefined;

    let inicio: Date;
    let fin: Date;

    if (fechaInicioStr && fechaFinStr) {
      const parsedInicio = parseFechaInicio(fechaInicioStr);
      const parsedFin = parseFechaFin(fechaFinStr);
      if (!parsedInicio || !parsedFin) {
        res.status(400).json({ success: false, message: 'Formato de fecha inválido. Use YYYY-MM-DD en fechaInicio y fechaFin' });
        return;
      }
      if (parsedInicio > parsedFin) {
        res.status(400).json({ success: false, message: 'fechaInicio debe ser anterior o igual a fechaFin' });
        return;
      }
      inicio = parsedInicio;
      fin = parsedFin;
    } else {
      const str = fechaStr || hoyStr;
      const parsed = parseFechaInicio(str);
      if (!parsed) {
        res.status(400).json({ success: false, message: 'Formato de fecha inválido. Use YYYY-MM-DD' });
        return;
      }
      inicio = parsed;
      fin = new Date(parsed);
      fin.setUTCDate(fin.getUTCDate() + 1);
      fin.setUTCMilliseconds(-1);
    }

    const query: Record<string, unknown> = {
      estado: { $ne: 'cancelada' },
      fecha: { $gte: inicio, $lte: fin }
    };
    if (medicoId && mongoose.Types.ObjectId.isValid(medicoId)) {
      query.medicoId = new mongoose.Types.ObjectId(medicoId);
    }

    const citas = await Cita.find(query)
      .populate('pacienteId', 'nombre apellido')
      .populate('medicoId', 'nombre apellido especialidad')
      .sort({ fecha: 1, hora: 1 })
      .lean();

    const data = citas.map((c: any) => {
      const paciente = c.pacienteId as { nombre?: string; apellido?: string } | null;
      const medico = c.medicoId as { nombre?: string; apellido?: string; especialidad?: string } | null;
      return {
        _id: c._id.toString(),
        pacienteId: typeof c.pacienteId === 'object' && c.pacienteId?._id ? c.pacienteId._id.toString() : c.pacienteId?.toString(),
        medicoId: typeof c.medicoId === 'object' && c.medicoId?._id ? c.medicoId._id.toString() : c.medicoId?.toString(),
        fecha: c.fecha,
        hora: formatearHora(c.hora),
        hora24: c.hora,
        tipo: c.tipo,
        modalidad: c.modalidad,
        estado: c.estado,
        pacienteNombre: paciente ? [paciente.nombre, paciente.apellido].filter(Boolean).join(' ') : '',
        medicoNombre: medico ? [medico.nombre, medico.apellido].filter(Boolean).join(' ') : '',
        medicoEspecialidad: medico?.especialidad
      };
    });

    // Resumen para KPIs (mismo conjunto de citas)
    const total = data.length;
    const confirmadas = data.filter((x: { estado: string }) => x.estado === 'confirmada').length;
    const completadas = data.filter((x: { estado: string }) => x.estado === 'completada').length;
    const pendientes = data.filter((x: { estado: string }) => x.estado === 'pendiente').length;
    const tasaConfirmacion = total > 0 ? Math.round((confirmadas / total) * 100) : 0;
    const tasaCompletadas = total > 0 ? Math.round((completadas / total) * 100) : 0;
    const tasaOcupacion = total > 0 ? Math.min(100, Math.round((confirmadas / total) * 100)) : 0;

    res.json({
      success: true,
      data: {
        citas: data,
        resumen: {
          total,
          confirmadas,
          completadas,
          pendientes,
          tasaConfirmacion,
          tasaCompletadas,
          tasaOcupacion
        }
      }
    });
  } catch (error: any) {
    console.error('Error al listar citas (panel agenda):', error);
    res.status(500).json({ success: false, message: 'Error al listar citas', error: error.message });
  }
};
