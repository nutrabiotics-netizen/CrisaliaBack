import { Response } from 'express';
import AyudaDiagnostica from '../../models/AyudaDiagnostica';
import { AuthRequest } from '../../middleware/auth';

// Data simulada de una orden de exámenes cuando no hay datos reales
const ORDEN_SIMULADA = {
  _id: 'simulada-001',
  estado: 'pendiente',
  pdfUrl: 'https://www.africau.edu/images/default/sample.pdf', // PDF de ejemplo público
  createdAt: new Date().toISOString(),
  ayudasDiagnosticas: [
    {
      codigoCups: 'LAB-001',
      descripcionCups: 'Hemograma completo con diferencial',
      cantidad: 1,
      obligatorio: true,
      observacion: 'Tomar en ayunas de 12 horas. Llevar orden impresa.'
    },
    {
      codigoCups: 'LAB-002',
      descripcionCups: 'Perfil tiroideo completo (TSH, T3, T4 libre)',
      cantidad: 1,
      obligatorio: true,
      observacion: 'Tomar en ayunas. No suspender medicamentos de tiroides.'
    },
    {
      codigoCups: 'LAB-003',
      descripcionCups: 'Panel metabólico completo (glucosa, creatinina, ácido úrico, enzimas hepáticas)',
      cantidad: 1,
      obligatorio: true,
      observacion: 'Ayunas de 12 horas. Evitar ejercicio intenso el día anterior.'
    },
    {
      codigoCups: 'LAB-004',
      descripcionCups: 'Vitamina D 25-OH',
      cantidad: 1,
      obligatorio: false,
      observacion: 'Facultativo. Recomendado si hay fatiga crónica o dolor óseo.'
    },
    {
      codigoCups: 'LAB-005',
      descripcionCups: 'Cortisol basal en sangre (8am)',
      cantidad: 1,
      obligatorio: false,
      observacion: 'Facultativo. Tomar entre 7am y 9am en ayunas.'
    }
  ]
};

/** GET /api/paciente/orden-examenes/vigente */
export const obtenerOrdenExamenesVigente = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    // Buscar la orden de exámenes más reciente prescrita por el médico
    const ordenReal = await AyudaDiagnostica.findOne({ pacienteId })
      .sort({ createdAt: -1 })
      .lean();

    if (ordenReal) {
      // Mapear los campos del modelo real al formato del frontend
      const ordenFormateada = {
        _id: ordenReal._id,
        estado: ordenReal.estado || 'pendiente',
        pdfUrl: ordenReal.pdfUrl || null,
        createdAt: ordenReal.createdAt,
        ayudasDiagnosticas: ordenReal.ayudasDiagnosticas.map((ad: any) => ({
          ...ad,
          obligatorio: true // Por defecto todos los prescritos por el médico son obligatorios
        }))
      };
      res.json({ orden: ordenFormateada, esMock: false });
    } else {
      // Usar datos simulados si no hay orden real
      res.json({ orden: ORDEN_SIMULADA, esMock: true });
    }
  } catch (error) {
    console.error('Error al obtener orden de exámenes:', error);
    res.status(500).json({ mensaje: 'Error al obtener la orden de exámenes' });
  }
};
