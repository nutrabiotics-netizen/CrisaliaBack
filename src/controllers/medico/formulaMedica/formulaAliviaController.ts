import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../../../middleware/auth';
import FormulaMedica, { IMedicamento } from '../../../models/FormulaMedica';

/**
 * POST /api/medico/formula-medica/:formulaId/generar-orden-alivia
 *
 * Genera el JSON de orden para ALIVIA con un id_orden único idempotente
 * y persiste la orden en el campo ordenAlivia de FormulaMedica.
 */
export const generarOrdenAlivia = async (req: AuthRequest, res: Response): Promise<void> => {
  // Feature flag — desactiva la integración si ALIVIA_ENABLED !== 'true'
  if (process.env.ALIVIA_ENABLED !== 'true') {
    res.status(503).json({
      success: false,
      mensaje: 'La integración con ALIVIA no está activada en este entorno. Configura ALIVIA_ENABLED=true en las variables de entorno.'
    });
    return;
  }

  try {
    const { formulaId } = req.params;

    const formula = await FormulaMedica.findById(formulaId)
      .populate('pacienteId', 'nombre apellido')
      .populate('medicoId', 'nombre apellido')
      .lean();

    if (!formula) { res.status(404).json({ mensaje: 'Fórmula médica no encontrada.' }); return; }

    // Si ya existe una orden pagada, no se regenera (idempotencia)
    if ((formula.ordenAlivia as any)?.estado === 'pagado') {
      res.json({ success: true, mensaje: 'La orden ya fue pagada.', ordenAlivia: formula.ordenAlivia });
      return;
    }

    const timestamp = Date.now();
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    const idOrden = `CRISAL-${timestamp}-${random}`;

    const productos = (formula.medicamentos ?? []).map((m: IMedicamento, idx: number) => ({
      codigo_unico: `CRISAL-${formulaId}-${idx}`,
      nombre: m.denominacionComun,
      dosis: `${m.dosis} ${m.unidadMedida} ${m.viaAdministracion} cada ${m.frecuencia}h por ${m.diasTratamiento} días`,
      cantidad: parseInt(m.cantidadNumeros ?? '1', 10) || 1,
      tipo: 'otc',
      precio_referencia: null
    }));

    const paciente = formula.pacienteId as any;
    const medico = formula.medicoId as any;

    const ordenJson: Record<string, unknown> = {
      id_orden: idOrden,
      id_paciente: String(formula.pacienteId),
      nombre_paciente: paciente ? `${paciente.nombre ?? ''} ${paciente.apellido ?? ''}`.trim() : undefined,
      id_medico: String(formula.medicoId),
      nombre_medico: medico ? `${medico.nombre ?? ''} ${medico.apellido ?? ''}`.trim() : undefined,
      fecha_generacion: new Date().toISOString(),
      productos,
      link_carrito: null,
      estado: 'pendiente_envio'
    };

    // Persistir en FormulaMedica
    await FormulaMedica.findByIdAndUpdate(formulaId, {
      $set: {
        ordenAlivia: {
          json: ordenJson,
          estado: 'pendiente_envio',
          linkCarrito: undefined,
          fechaEnvio: undefined
        }
      }
    });

    res.json({ success: true, ordenJson, formulaId });
  } catch (err: any) {
    console.error('[generarOrdenAlivia] error:', err);
    res.status(500).json({ mensaje: 'Error al generar la orden ALIVIA.', error: err.message });
  }
};
