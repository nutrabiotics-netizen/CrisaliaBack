import { Response } from 'express';
import PagoSimulado from '../../models/PagoSimulado';
import CodigoDescuento from '../../models/CodigoDescuento';
import { AuthRequest } from '../../middleware/auth';

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

    res.status(200).json({ mensaje: `Cuota ${cuota} pagada exitosamente (simulación).`, pago, descuentoAplicado });
  } catch (error) {
    console.error('Error al simular pago:', error);
    res.status(500).json({ mensaje: 'Error al procesar el pago simulado' });
  }
};
