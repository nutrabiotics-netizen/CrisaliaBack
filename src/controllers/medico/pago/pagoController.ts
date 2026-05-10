/**
 * pagoController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-7 — Gestión de pagos de consultas (médico ve sus cobros).
 *
 * GET  /medico/pago                    → historial paginado con filtros
 * POST /medico/pago                    → registrar pago manual
 * GET  /medico/pago/estadisticas       → totales del mes + por tipo
 * PUT  /medico/pago/:pagoId/estado     → marcar como completado / reembolsado
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import PagoConsulta from '../../../models/PagoConsulta';
import Cita from '../../../models/Cita';
import { handleError } from '../../../utils/errors';

// ─── Listar pagos ─────────────────────────────────────────────────────────────

export const listarPagos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const { desde, hasta, estado, tipo, page = '1', limit = '20' } = req.query;

    const filter: Record<string, unknown> = { medicoId };
    if (estado) filter.estado = estado;
    if (tipo) filter.tipo = tipo;
    if (desde || hasta) {
      filter.createdAt = {};
      if (desde) (filter.createdAt as any).$gte = new Date(String(desde));
      if (hasta) (filter.createdAt as any).$lte = new Date(String(hasta));
    }

    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const [pagos, total] = await Promise.all([
      PagoConsulta.find(filter)
        .populate('pacienteId', 'nombre apellido')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      PagoConsulta.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        pagos,
        pagination: {
          total,
          page: parseInt(String(page)),
          limit: parseInt(String(limit)),
          pages: Math.ceil(total / parseInt(String(limit)))
        }
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Registrar pago ───────────────────────────────────────────────────────────

export const registrarPago = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const { citaId, pacienteId, tipo, monto, metodo, referencia, notas, fechaPago } = req.body;

    if (!pacienteId || !tipo || !monto || !metodo) {
      res.status(400).json({
        success: false,
        message: 'pacienteId, tipo, monto y metodo son requeridos.'
      });
      return;
    }

    // Si viene citaId, verificar que pertenece al médico
    if (citaId) {
      const cita = await Cita.findOne({ _id: citaId, medicoId }).lean();
      if (!cita) {
        res.status(404).json({ success: false, message: 'Cita no encontrada.' });
        return;
      }
    }

    const pago = await PagoConsulta.create({
      medicoId,
      pacienteId,
      citaId: citaId || undefined,
      tipo,
      monto: Number(monto),
      metodo,
      referencia: referencia || undefined,
      notas: notas || undefined,
      fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
      estado: 'completado'
    });

    res.status(201).json({ success: true, data: pago });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Estadísticas del mes ─────────────────────────────────────────────────────

export const getEstadisticas = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);

    const [totalMes, porTipo, porMetodo, ultimos6Meses] = await Promise.all([
      // Total del mes (completados)
      PagoConsulta.aggregate([
        {
          $match: {
            medicoId,
            estado: 'completado',
            createdAt: { $gte: inicioMes, $lte: finMes }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$monto' },
            cantidad: { $sum: 1 }
          }
        }
      ]),

      // Por tipo (mes actual)
      PagoConsulta.aggregate([
        {
          $match: {
            medicoId,
            estado: 'completado',
            createdAt: { $gte: inicioMes, $lte: finMes }
          }
        },
        {
          $group: {
            _id: '$tipo',
            total: { $sum: '$monto' },
            cantidad: { $sum: 1 }
          }
        }
      ]),

      // Por método de pago (mes actual)
      PagoConsulta.aggregate([
        {
          $match: {
            medicoId,
            estado: 'completado',
            createdAt: { $gte: inicioMes, $lte: finMes }
          }
        },
        { $group: { _id: '$metodo', total: { $sum: '$monto' }, cantidad: { $sum: 1 } } }
      ]),

      // Serie últimos 6 meses
      PagoConsulta.aggregate([
        {
          $match: {
            medicoId,
            estado: 'completado',
            createdAt: {
              $gte: new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1)
            }
          }
        },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            total: { $sum: '$monto' },
            cantidad: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const serieMeses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = ultimos6Meses.find((s: any) => s._id.year === y && s._id.month === m);
      serieMeses.push({
        label: `${meses[m - 1]} ${y}`,
        total: found?.total ?? 0,
        cantidad: found?.cantidad ?? 0
      });
    }

    res.json({
      success: true,
      data: {
        mes: {
          total: totalMes[0]?.total ?? 0,
          cantidad: totalMes[0]?.cantidad ?? 0
        },
        porTipo: porTipo.map((t: any) => ({ tipo: t._id, total: t.total, cantidad: t.cantidad })),
        porMetodo: porMetodo.map((m: any) => ({ metodo: m._id, total: m.total, cantidad: m.cantidad })),
        tendencia: serieMeses
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Actualizar estado ────────────────────────────────────────────────────────

export const actualizarEstado = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const { pagoId } = req.params;
    const { estado } = req.body;

    if (!['pendiente', 'completado', 'reembolsado'].includes(estado)) {
      res.status(400).json({ success: false, message: 'Estado inválido.' });
      return;
    }

    const pago = await PagoConsulta.findOneAndUpdate(
      { _id: pagoId, medicoId },
      { $set: { estado, ...(estado === 'completado' ? { fechaPago: new Date() } : {}) } },
      { new: true }
    ).lean();

    if (!pago) {
      res.status(404).json({ success: false, message: 'Pago no encontrado.' });
      return;
    }

    res.json({ success: true, data: pago });
  } catch (err: any) {
    handleError(err, res);
  }
};
