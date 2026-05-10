import { Response } from 'express';
import PagoSimulado from '../../models/PagoSimulado';
import CodigoDescuento from '../../models/CodigoDescuento';
import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import { AuthRequest } from '../../middleware/auth';
import { enviarMensajeCitaPaciente } from '../../services/notifications/citaWhatsAppNotifier';

const PAQUETES = {
  1: { descripcion: 'Paquete Cuota 1: Gestión de Agenda + Preconsulta', monto: 150000 },
  2: { descripcion: 'Paquete Cuota 2: Consulta Médica + Seguimiento', monto: 250000 }
};

/** GET /api/paciente/pago/estado */
export const obtenerEstadoPago = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const pagos = await PagoSimulado.find({ pacienteId }).sort({ cuota: 1 });

    // Si no existen registros aún, devolvemos estado inicial pendiente para ambas cuotas
    const cuota1 = pagos.find(p => p.cuota === 1) || {
      cuota: 1,
      estado: 'pendiente',
      monto: PAQUETES[1].monto,
      descripcion: PAQUETES[1].descripcion,
      fechaPago: null
    };
    const cuota2 = pagos.find(p => p.cuota === 2) || {
      cuota: 2,
      estado: 'pendiente',
      monto: PAQUETES[2].monto,
      descripcion: PAQUETES[2].descripcion,
      fechaPago: null
    };

    res.json({ cuota1, cuota2 });
  } catch (error) {
    console.error('Error al obtener estado de pago:', error);
    res.status(500).json({ mensaje: 'Error al obtener estado de pago' });
  }
};

/** POST /api/paciente/pago/simular  body: { cuota: 1 | 2 } */
export const simularPago = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ mensaje: 'No autorizado' });
      return;
    }

    const { cuota, codigoDescuento } = req.body;
    if (cuota !== 1 && cuota !== 2) {
      res.status(400).json({ mensaje: 'Cuota inválida (debe ser 1 o 2)' });
      return;
    }

    if (cuota === 2) {
      const cuota1 = await PagoSimulado.findOne({ pacienteId, cuota: 1 });
      if (!cuota1 || cuota1.estado !== 'pagado') {
        res.status(400).json({ mensaje: 'Debes pagar la Cuota 1 primero.' });
        return;
      }
    }

    const paquete = PAQUETES[cuota as 1 | 2];
    let montoFinal = paquete.monto;
    let descuentoAplicado = 0;
    let codigoDescuentoId: string | undefined;

    if (codigoDescuento) {
      const codDoc = await CodigoDescuento.findOne({
        codigo: codigoDescuento.toUpperCase().trim(),
        activo: true,
        expiresAt: { $gt: new Date() }
      });
      if (codDoc && codDoc.usos < codDoc.maxUsos) {
        descuentoAplicado = codDoc.tipo === 'porcentaje'
          ? Math.round(paquete.monto * codDoc.valor / 100)
          : codDoc.valor;
        montoFinal = Math.max(0, paquete.monto - descuentoAplicado);
        codigoDescuentoId = codDoc._id.toString();
        await CodigoDescuento.findByIdAndUpdate(codDoc._id, { $inc: { usos: 1 } });
      }
    }

    const pago = await PagoSimulado.findOneAndUpdate(
      { pacienteId, cuota },
      {
        pacienteId,
        cuota,
        estado: 'pagado',
        monto: montoFinal,
        descuentoAplicado,
        codigoDescuentoId: codigoDescuentoId || undefined,
        descripcion: paquete.descripcion,
        fechaPago: new Date()
      },
      { upsert: true, new: true }
    );

    // Notificar al médico cuando cuota 2 es pagada
    if (cuota === 2) {
      notificarMedicoCuota2(pacienteId).catch((e) =>
        console.warn('[Pago] notificarMedicoCuota2 error (no crítico):', e)
      );
    }

    res.status(200).json({ mensaje: `Cuota ${cuota} pagada exitosamente (simulación).`, pago, descuentoAplicado });
  } catch (error) {
    console.error('Error al simular pago:', error);
    res.status(500).json({ mensaje: 'Error al procesar el pago simulado' });
  }
};

/**
 * Busca el médico asignado al paciente (desde su cita más reciente) y le envía
 * un WhatsApp informando que la Cuota 2 fue pagada.
 */
async function notificarMedicoCuota2(pacienteId: string): Promise<void> {
  // Cita más reciente del paciente para obtener el médico
  const cita = await Cita.findOne({ pacienteId })
    .sort({ createdAt: -1 })
    .select('medicoId')
    .lean();

  if (!cita?.medicoId) return;

  const [medico, paciente] = await Promise.all([
    Medico.findById(cita.medicoId).select('nombre apellido whatsapp telefono').lean(),
    Paciente.findById(pacienteId).select('nombre apellido').lean(),
  ]);

  if (!medico) return;

  const telMedico = (medico.whatsapp || medico.telefono)?.trim();
  if (!telMedico) {
    console.info('[Pago] Médico sin teléfono registrado; omitiendo notificación WhatsApp.');
    return;
  }

  const nombrePac = [paciente?.nombre, paciente?.apellido].filter(Boolean).join(' ') || 'Un paciente';
  const msg =
    `Hola Dr(a). ${[medico.nombre, medico.apellido].filter(Boolean).join(' ')}, ` +
    `${nombrePac} ha completado el pago de la Cuota 2 en Crisal-iA. ` +
    `Ya puede acceder a la consulta y seguimiento completo. ¡Buena suerte en la consulta!`;

  await enviarMensajeCitaPaciente(telMedico, msg);
}
