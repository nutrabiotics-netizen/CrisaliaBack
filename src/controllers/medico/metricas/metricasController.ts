/**
 * metricasController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MD-6 — Dashboard de métricas reales del médico.
 *
 * GET /medico/metricas/dashboard
 *   → KPIs del período seleccionado (defecto: mes actual)
 *   Query: ?desde=ISO&hasta=ISO
 *
 * GET /medico/metricas/tendencia
 *   → Serie mensual de los últimos 6 meses (citas + pacientes)
 *
 * GET /medico/metricas/motivos-consulta
 *   → Top 10 motivos de consulta del historial clínico
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import Cita from '../../../models/Cita';
import Interrogatorio from '../../../models/Interrogatorio';
import HistoriaClinica from '../../../models/HistoriaClinica';
import { handleError } from '../../../utils/errors';

// ─── helpers ──────────────────────────────────────────────────────────────────

function rangoMesActual() {
  const ahora = new Date();
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
  return { inicio, fin };
}

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

export const getDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);

    const { desde, hasta } = req.query;
    let inicio: Date;
    let fin: Date;

    if (desde && hasta) {
      inicio = new Date(String(desde));
      fin = new Date(String(hasta));
    } else {
      ({ inicio, fin } = rangoMesActual());
    }

    // ── Citas del período ────────────────────────────────────────────────────
    const [citasDelPeriodo, citasHoy, totalPacientesUnicos] = await Promise.all([
      Cita.find({
        medicoId,
        fecha: { $gte: inicio, $lte: fin }
      }).select('estado pacienteId tipo fecha').lean(),

      Cita.find({
        medicoId,
        fecha: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999))
        }
      }).select('estado pacienteId tipo').lean(),

      Cita.distinct('pacienteId', { medicoId })
    ]);

    const completadas = citasDelPeriodo.filter((c: any) => c.estado === 'completada');
    const canceladas  = citasDelPeriodo.filter((c: any) => c.estado === 'cancelada');
    const pendientes  = citasDelPeriodo.filter((c: any) =>
      ['pendiente', 'confirmada', 'en_espera', 'en_consulta'].includes(c.estado)
    );

    const pacientesUnicos = new Set(citasDelPeriodo.map((c: any) => String(c.pacienteId)));
    const pacientesNuevos = new Set(
      citasDelPeriodo.filter((c: any) => c.tipo === 'consulta').map((c: any) => String(c.pacienteId))
    );

    // ── Anamnesis completadas del período ────────────────────────────────────
    const [anamnesisCompletadas, totalInterrogatorios] = await Promise.all([
      Interrogatorio.countDocuments({
        pacienteId: { $in: Array.from(pacientesUnicos) },
        estado: 'completado',
        updatedAt: { $gte: inicio, $lte: fin }
      }),
      Interrogatorio.countDocuments({
        pacienteId: { $in: Array.from(pacientesUnicos) }
      })
    ]);

    // ── Historias clínicas del período ───────────────────────────────────────
    const hcDelPeriodo = await HistoriaClinica.countDocuments({
      medicoId,
      fechaRegistro: { $gte: inicio, $lte: fin },
      activo: { $ne: false }
    });

    // ── Por tipo de cita ─────────────────────────────────────────────────────
    const porTipo: Record<string, number> = {};
    for (const c of citasDelPeriodo as any[]) {
      porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;
    }

    // ── Citas hoy ────────────────────────────────────────────────────────────
    const hoyPorEstado: Record<string, number> = {};
    for (const c of citasHoy as any[]) {
      hoyPorEstado[c.estado] = (hoyPorEstado[c.estado] ?? 0) + 1;
    }

    // ── Tasa de retención simple ─────────────────────────────────────────────
    // % de pacientes que tienen >1 cita completada con este médico
    const pacientesConMasDeUna = await Cita.aggregate([
      { $match: { medicoId, estado: 'completada' } },
      { $group: { _id: '$pacienteId', total: { $sum: 1 } } },
      { $match: { total: { $gt: 1 } } },
      { $count: 'retenidos' }
    ]);
    const retenidos = pacientesConMasDeUna[0]?.retenidos ?? 0;
    const tasaRetencion = totalPacientesUnicos.length > 0
      ? Math.round((retenidos / totalPacientesUnicos.length) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        periodo: { desde: inicio, hasta: fin },
        kpis: {
          citasTotales: citasDelPeriodo.length,
          citasCompletadas: completadas.length,
          citasCanceladas: canceladas.length,
          citasPendientes: pendientes.length,
          citasHoy: citasHoy.length,
          hoyPorEstado,
          pacientesUnicos: pacientesUnicos.size,
          pacientesNuevos: pacientesNuevos.size,
          totalPacientesCartera: totalPacientesUnicos.length,
          anamnesisCompletadas,
          totalInterrogatorios,
          tasaAnamnesisCompletion: totalInterrogatorios > 0
            ? Math.round((anamnesisCompletadas / totalInterrogatorios) * 100)
            : 0,
          historiasClinicas: hcDelPeriodo,
          tasaRetencion,
          porTipoCita: porTipo
        }
      }
    });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Serie mensual (tendencia últimos 6 meses) ────────────────────────────────

export const getTendencia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);

    // Rango: 6 meses atrás
    const ahora = new Date();
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 5, 1);

    const serie = await Cita.aggregate([
      {
        $match: {
          medicoId,
          fecha: { $gte: inicio }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$fecha' },
            month: { $month: '$fecha' }
          },
          totalCitas: { $sum: 1 },
          completadas: {
            $sum: { $cond: [{ $eq: ['$estado', 'completada'] }, 1, 0] }
          },
          canceladas: {
            $sum: { $cond: [{ $eq: ['$estado', 'cancelada'] }, 1, 0] }
          },
          pacientesUnicos: { $addToSet: '$pacienteId' }
        }
      },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          totalCitas: 1,
          completadas: 1,
          canceladas: 1,
          pacientesUnicos: { $size: '$pacientesUnicos' }
        }
      },
      { $sort: { year: 1, month: 1 } }
    ]);

    // Rellenar meses vacíos
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const resultado = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = serie.find((s: any) => s.year === y && s.month === m);
      resultado.push({
        label: `${meses[m - 1]} ${y}`,
        mes: m,
        year: y,
        totalCitas: found?.totalCitas ?? 0,
        completadas: found?.completadas ?? 0,
        canceladas: found?.canceladas ?? 0,
        pacientesUnicos: found?.pacientesUnicos ?? 0
      });
    }

    res.json({ success: true, data: resultado });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Top motivos de consulta ──────────────────────────────────────────────────

export const getMotivoConsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);

    const top = await HistoriaClinica.aggregate([
      { $match: { medicoId, activo: { $ne: false }, motivo: { $exists: true, $ne: '' } } },
      { $group: { _id: '$motivo', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, motivo: '$_id', total: 1 } }
    ]);

    // Top diagnósticos
    const topDx = await HistoriaClinica.aggregate([
      {
        $match: {
          medicoId,
          activo: { $ne: false },
          'diagnostico.codigo': { $exists: true }
        }
      },
      { $unwind: '$diagnostico' },
      {
        $group: {
          _id: { codigo: '$diagnostico.codigo', nombre: '$diagnostico.nombre' },
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          codigo: '$_id.codigo',
          nombre: '$_id.nombre',
          total: 1
        }
      }
    ]);

    res.json({ success: true, data: { topMotivos: top, topDiagnosticos: topDx } });
  } catch (err: any) {
    handleError(err, res);
  }
};

// ─── Generar reporte (CSV o PDF simple) ──────────────────────────────────────

export const generarReporte = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = new mongoose.Types.ObjectId(req.userId!);
    const { dias = '30', formato = 'csv' } = req.body as {
      dias?: string;
      formato?: 'csv' | 'pdf';
    };

    const fin = new Date();
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - Number(dias));

    const citas = await Cita.find({
      medicoId,
      fecha: { $gte: inicio, $lte: fin },
      activo: { $ne: false },
    }).populate('pacienteId', 'nombre apellido email').lean();

    if (formato === 'csv') {
      const rows: string[] = [];
      rows.push('Fecha,Estado,Tipo,Modalidad,Paciente');
      for (const c of citas) {
        const pac = c.pacienteId as any;
        const nombre = pac ? `${pac.nombre ?? ''} ${pac.apellido ?? ''}`.trim() : 'N/A';
        const fecha = new Date(c.fecha).toLocaleDateString('es-CO');
        rows.push(`"${fecha}","${c.estado}","${c.tipo ?? ''}","${c.modalidad ?? ''}","${nombre}"`);
      }
      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-crisal-${Date.now()}.csv"`);
      res.send('﻿' + csv);
      return;
    }

    // PDF simple con PDFKit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-crisal-${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).fillColor('#2C497A').text('Reporte de actividad — Crisal-iA', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#6b7280').text(`Período: ${inicio.toLocaleDateString('es-CO')} — ${fin.toLocaleDateString('es-CO')}`, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(13).fillColor('#2C497A').text('Resumen de citas');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#374151');
    doc.text(`Total citas: ${citas.length}`);
    doc.text(`Completadas: ${citas.filter((c: any) => c.estado === 'completada').length}`);
    doc.text(`Canceladas: ${citas.filter((c: any) => c.estado === 'cancelada').length}`);
    doc.text(`Pacientes únicos: ${new Set(citas.map((c: any) => String(c.pacienteId?._id ?? c.pacienteId))).size}`);
    doc.moveDown(1);

    doc.fontSize(13).fillColor('#2C497A').text('Detalle de citas');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#374151');
    for (const c of citas) {
      const pac = c.pacienteId as any;
      const nombre = pac ? `${pac.nombre ?? ''} ${pac.apellido ?? ''}`.trim() : 'N/A';
      const fecha = new Date(c.fecha).toLocaleDateString('es-CO');
      doc.text(`• ${fecha} | ${c.estado} | ${c.tipo ?? '-'} | ${nombre}`);
    }

    doc.end();
  } catch (err: any) {
    handleError(err, res);
  }
};
