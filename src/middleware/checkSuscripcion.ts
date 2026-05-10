import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import Medico from '../models/Medico';

/**
 * checkSuscripcion
 * ────────────────────────────────────────────────────────────────────────────
 * Middleware que protege rutas críticas del médico verificando que tenga:
 *   a) Suscripción activa, O
 *   b) Plan de prueba con cupo disponible (pacientesUsados < limite)
 *
 * Si ninguna condición se cumple → 403 con mensaje descriptivo.
 *
 * Uso:
 *   router.post('/historia-clinica', authenticate, authorize(MEDICO), checkSuscripcion, controller)
 */
export const checkSuscripcion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const medicoId = req.userId;
    if (!medicoId) {
      res.status(401).json({ success: false, message: 'No autenticado.' });
      return;
    }

    const medico = await Medico.findById(medicoId)
      .select('suscripcionActiva planPrueba activo')
      .lean();

    if (!medico || !medico.activo) {
      res.status(403).json({ success: false, message: 'Cuenta inactiva.' });
      return;
    }

    // Suscripción paga activa → acceso total
    if (medico.suscripcionActiva) {
      next();
      return;
    }

    // Plan de prueba vigente con cupo disponible
    const pp = medico.planPrueba;
    if (pp?.activo && pp.pacientesUsados < pp.limite) {
      next();
      return;
    }

    // Sin acceso
    const usados = pp?.pacientesUsados ?? 0;
    const limite = pp?.limite ?? 3;
    res.status(403).json({
      success: false,
      code: 'SUSCRIPCION_REQUERIDA',
      message:
        usados >= limite
          ? `Has alcanzado el límite de ${limite} pacientes en el plan de prueba. Activa tu suscripción para continuar.`
          : 'Tu plan de prueba no está activo. Activa tu suscripción para continuar.',
      planPrueba: { pacientesUsados: usados, limite }
    });
  } catch (err) {
    console.error('[checkSuscripcion]:', err);
    res.status(500).json({ success: false, message: 'Error al verificar suscripción.' });
  }
};

/**
 * incrementarPacientesPlanPrueba
 * Incrementa el contador del plan de prueba cuando el médico crea una HC nueva.
 * Llamar DESPUÉS de crear exitosamente la HC.
 */
export async function incrementarPacientesPlanPrueba(medicoId: string): Promise<void> {
  const medico = await Medico.findById(medicoId).select('suscripcionActiva planPrueba').lean();
  if (!medico || medico.suscripcionActiva) return; // Solo aplica en trial
  await Medico.findByIdAndUpdate(medicoId, {
    $inc: { 'planPrueba.pacientesUsados': 1 }
  });
}
