import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { buildRipsPackage } from '../../services/ripsGeneratorService';
import RipsPaquete from '../../models/RipsPaquete';
import archiver from 'archiver';

export const obtenerConsolidadoMes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const periodo = (req.query.periodo as string) || new Date().toISOString().substring(0, 7); // YYYY-MM
    const data = await buildRipsPackage(periodo);

    // Mapear los arreglos para devolver la contabilidad a la FASE 2
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

    // Guardar en auditoría
    await RipsPaquete.create({
      periodo,
      totalRegistros,
      archivosGenerados: ['US', 'AC', 'AF', 'CT'],
      estado: 'Enviado',
      generadoPor: req.userId
    });

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="RIPS_${periodo}.zip"`
    });

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      if (!res.headersSent) res.status(500).end(err.message);
    });
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
