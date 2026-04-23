import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { buildRipsPackage } from '../../services/ripsGeneratorService';
import RipsPaquete from '../../models/RipsPaquete';
import archiver from 'archiver';

// ─── Fases existentes ─────────────────────────────────────────────────────────

export const obtenerConsolidadoMes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const periodo = (req.query.periodo as string) || new Date().toISOString().substring(0, 7);
    const data = await buildRipsPackage(periodo);

    const archivos = [
      { code: 'US', name: 'Datos del Usuario', status: data.US.length > 0 ? 'completo' : 'pendiente', records: data.US.length },
      { code: 'AC', name: 'Consultas', status: data.AC.length > 0 ? 'completo' : 'pendiente', records: data.AC.length },
      { code: 'AM', name: 'Medicamentos', status: 'no-aplica', records: data.AM.length },
      { code: 'AP', name: 'Procedimientos', status: 'no-aplica', records: data.AP.length },
      { code: 'AF', name: 'Factura', status: data.AF.length > 0 ? 'completo' : 'pendiente', records: data.AF.length },
      { code: 'CT', name: 'Control Maestro', status: data.CT.length > 0 ? 'completo' : 'pendiente', records: data.CT.length }
    ];

    res.json({ success: true, data: archivos });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error consolidando mes', error: error.message });
  }
};

export const validarDatosMes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const periodo = (req.body.periodo as string) || new Date().toISOString().substring(0, 7);
    const data = await buildRipsPackage(periodo);

    const check = [
      { archivo: 'US', estado: data.US.length > 0 ? 'Validado' : 'Pendiente validación', registros: data.US.length },
      { archivo: 'AC', estado: data.AC.length > 0 ? 'Validado' : 'Pendiente validación', registros: data.AC.length },
      { archivo: 'AF', estado: data.AF.length > 0 ? 'Validado' : 'Pendiente validación', registros: data.AF.length },
    ];

    res.json({ success: true, data: check });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error validando', error: error.message });
  }
};

export const generarZipRips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const periodo = (req.query.periodo as string) || new Date().toISOString().substring(0, 7);
    const data = await buildRipsPackage(periodo);
    const totalRegistros = data.US.length + data.AC.length + data.AF.length + data.CT.length;

    await RipsPaquete.create({
      periodo,
      totalRegistros,
      archivosGenerados: ['US', 'AC', 'AF', 'CT'],
      faseActual: 'enviado',
      estado: 'Enviado',
      erroresValidacion: [],
      generadoPor: req.userId
    });

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="RIPS_${periodo}.zip"`
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { if (!res.headersSent) res.status(500).end(err.message); });
    archive.pipe(res);
    archive.append(JSON.stringify(data.US, null, 2), { name: `US${periodo}.json` });
    archive.append(JSON.stringify(data.AC, null, 2), { name: `AC${periodo}.json` });
    archive.append(JSON.stringify(data.AF, null, 2), { name: `AF${periodo}.json` });
    archive.append(JSON.stringify(data.CT, null, 2), { name: `CT${periodo}.json` });
    await archive.finalize();
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error al generar ZIP', error: error.message });
    }
  }
};

export const listarHistorial = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const historial = await RipsPaquete.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: historial });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error listando', error: error.message });
  }
};

// ─── Fase 3 — Validación técnica ─────────────────────────────────────────────

/**
 * POST /api/administrativo/rips/:paqueteId/validar
 * Valida campos obligatorios según estructura RIPS (Resolución 3374/2000).
 */
export const validarRips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paqueteId } = req.params;
    const paquete = await RipsPaquete.findById(paqueteId).lean();
    if (!paquete) { res.status(404).json({ mensaje: 'Paquete no encontrado.' }); return; }

    const errores: string[] = [];
    if (!paquete.periodo) errores.push('Campo periodo es obligatorio (YYYY-MM).');
    if (!/^\d{4}-\d{2}$/.test(paquete.periodo)) errores.push('Formato de periodo inválido. Use YYYY-MM.');
    if (paquete.totalRegistros <= 0) errores.push('El paquete no tiene registros (totalRegistros = 0).');
    if (!paquete.archivosGenerados?.includes('US')) errores.push('Archivo US (Usuarios) es obligatorio.');
    if (!paquete.archivosGenerados?.includes('AC')) errores.push('Archivo AC (Consultas) es obligatorio.');

    const faseActual = errores.length === 0 ? 'validado' : 'consolidado';
    await RipsPaquete.findByIdAndUpdate(paqueteId, {
      $set: { faseActual, erroresValidacion: errores }
    });

    res.json({
      success: true,
      valido: errores.length === 0,
      errores,
      faseActual
    });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error validando RIPS.', error: err.message });
  }
};

// ─── Fase 4 — Generar archivo + marcar enviado ────────────────────────────────

/**
 * POST /api/administrativo/rips/:paqueteId/generar-archivo
 * Genera el JSON del RIPS para el paquete ya validado.
 */
export const generarArchivoRips = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paqueteId } = req.params;
    const paquete = await RipsPaquete.findById(paqueteId).lean();
    if (!paquete) { res.status(404).json({ mensaje: 'Paquete no encontrado.' }); return; }
    if (paquete.faseActual === 'borrador' || paquete.faseActual === 'consolidado') {
      res.status(400).json({ mensaje: 'El paquete debe estar en fase "validado" o superior antes de generar el archivo.' });
      return;
    }

    const data = await buildRipsPackage(paquete.periodo);
    const jsonContent = JSON.stringify({ US: data.US, AC: data.AC, AF: data.AF, CT: data.CT }, null, 2);
    const fileName = `RIPS_${paquete.periodo}.json`;

    // Actualizar fase
    await RipsPaquete.findByIdAndUpdate(paqueteId, {
      $set: { faseActual: 'validado', archivoGeneradoUrl: fileName }
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(jsonContent);
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error generando archivo RIPS.', error: err.message });
  }
};

/**
 * POST /api/administrativo/rips/:paqueteId/marcar-enviado
 * Marca el paquete como enviado a la EPS/Minsalud.
 */
export const marcarEnviado = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paqueteId } = req.params;
    const { enviadoA } = req.body;
    if (!enviadoA?.trim()) {
      res.status(400).json({ mensaje: 'Debe especificar a quién se envió (EPS/ARL/Minsalud).' });
      return;
    }

    const paquete = await RipsPaquete.findByIdAndUpdate(
      paqueteId,
      { $set: { faseActual: 'enviado', estado: 'Enviado', fechaEnvio: new Date(), enviadoA: enviadoA.trim() } },
      { new: true }
    ).lean();

    if (!paquete) { res.status(404).json({ mensaje: 'Paquete no encontrado.' }); return; }
    res.json({ success: true, paquete });
  } catch (err: any) {
    res.status(500).json({ mensaje: 'Error marcando como enviado.', error: err.message });
  }
};
