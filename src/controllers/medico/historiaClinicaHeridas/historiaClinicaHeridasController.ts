import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import HistoriaClinicaHeridas from '../../../models/HistoriaClinicaHeridas';
import Cita from '../../../models/Cita';
import Medico from '../../../models/Medico';
import { generateHeridasPdf, fetchImageAsBuffer } from '../../../utils/pdfGenerator';
import { uploadPDFAndGetUrl, buildCitaDocumentKey } from '../../../utils/s3Documents';
import { registrarAccion } from '../../../utils/auditoriaHelper';

/**
 * GET /medico/historia-clinica-heridas/cita/:citaId
 * Devuelve la HC de heridas asociada a una cita (o null si aún no existe).
 */
export const obtenerPorCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const hc = await HistoriaClinicaHeridas.findOne({ citaId, medicoId, activo: true }).lean();
    res.json({ success: true, data: hc });
  } catch (error: any) {
    console.error('[HCHeridas.obtenerPorCita]', error);
    res.status(500).json({ success: false, message: 'Error al obtener HC de heridas', error: error.message });
  }
};

/**
 * POST /medico/historia-clinica-heridas/cita/:citaId
 * Crea o actualiza la HC de heridas para una cita (upsert por citaId+medicoId).
 * Body: cualquier subset de las 14 secciones.
 */
export const crearOActualizar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const { pacienteId, activo, fechaRegistro, creadoPor, creadoPorRol, _id, __v, createdAt, updatedAt, ...rest } = req.body ?? {};
    if (!pacienteId || !mongoose.isValidObjectId(pacienteId)) {
      res.status(400).json({ success: false, message: 'pacienteId requerido' });
      return;
    }

    const set: any = {
      ...rest,
      pacienteId: new mongoose.Types.ObjectId(pacienteId),
      medicoId:   new mongoose.Types.ObjectId(medicoId),
      citaId:     new mongoose.Types.ObjectId(citaId),
      actualizadoPor: new mongoose.Types.ObjectId(medicoId)
    };

    const hc = await HistoriaClinicaHeridas.findOneAndUpdate(
      { citaId, medicoId },
      {
        $set: set,
        $setOnInsert: {
          fechaRegistro: new Date(),
          creadoPor: new mongoose.Types.ObjectId(medicoId),
          creadoPorRol: 'Medico',
          activo: true
        }
      },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.status(200).json({ success: true, data: hc });
  } catch (error: any) {
    console.error('[HCHeridas.crearOActualizar]', error);
    res.status(500).json({ success: false, message: 'Error al guardar HC de heridas', error: error.message });
  }
};

/**
 * GET /medico/historia-clinica-heridas/paciente/:pacienteId
 * Lista las HC de heridas de un paciente atendidas por el médico (para seguimiento longitudinal).
 */
export const listarPorPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const pacienteId = req.params.pacienteId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(pacienteId)) { res.status(400).json({ success: false, message: 'pacienteId inválido' }); return; }

    const items = await HistoriaClinicaHeridas
      .find({ pacienteId, medicoId, activo: true })
      .sort({ fechaRegistro: -1 })
      .lean();
    res.json({ success: true, data: items });
  } catch (error: any) {
    console.error('[HCHeridas.listarPorPaciente]', error);
    res.status(500).json({ success: false, message: 'Error al listar', error: error.message });
  }
};

/**
 * POST /medico/historia-clinica-heridas/cita/:citaId/finalizar
 * Genera el PDF de la HC de heridas, lo sube a S3, marca la cita como completada
 * y devuelve la URL del PDF.
 */
export const finalizarConsulta = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    // 1. Obtener HC de heridas
    const hc = await HistoriaClinicaHeridas.findOne({ citaId, medicoId, activo: true }).lean();
    if (!hc) { res.status(404).json({ success: false, message: 'HC de heridas no encontrada' }); return; }

    // 2. Obtener datos del médico para la firma
    const medico: any = await Medico.findById(medicoId)
      .select('nombre apellido numeroColegiatura firmaUrl tipoDocumento numeroDocumento')
      .lean();

    let firmaBuffer: Buffer | null = null;
    if (medico?.firmaUrl) {
      firmaBuffer = await fetchImageAsBuffer(medico.firmaUrl).catch(() => null);
    }

    const medicoPdf = medico ? {
      nombreCompleto: `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim(),
      numeroColegiatura: medico.numeroColegiatura,
      firmaImageBuffer: firmaBuffer,
    } : undefined;

    // 3. Generar PDF
    const pdfBuffer = await generateHeridasPdf(hc, medicoPdf);

    // 4. Subir a S3
    const paciente: any = await (await import('../../../models/Paciente')).default
      .findById((hc as any).pacienteId)
      .select('numeroDocumento')
      .lean();
    const numeroDoc = paciente?.numeroDocumento ?? 'sin-doc';
    const s3Key = buildCitaDocumentKey(numeroDoc, citaId, 'heridas-resumen');
    const pdfUrl = await uploadPDFAndGetUrl(pdfBuffer, s3Key);

    // 5. Guardar URL en HC
    await HistoriaClinicaHeridas.findOneAndUpdate(
      { citaId, medicoId },
      { $set: { pdfResumenUrl: pdfUrl } }
    );

    // 6. Marcar cita como completada
    await Cita.findByIdAndUpdate(citaId, { $set: { estado: 'completada' } });

    await registrarAccion(req, 'actualizar', 'Cita', citaId);

    res.json({ success: true, data: { pdfUrl } });
  } catch (error: any) {
    console.error('[HCHeridas.finalizarConsulta]', error);
    res.status(500).json({ success: false, message: 'Error al finalizar consulta', error: error.message });
  }
};
