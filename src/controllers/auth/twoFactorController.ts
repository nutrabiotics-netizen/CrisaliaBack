import { Request, Response } from 'express';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import { generateToken } from '../../utils/jwt';
import { UserRole } from '../../types';
import {
  envioCodigoWhatsApp,
  verificarCodigoWhatsApp,
  normalizarTelefono
} from '../../services/whatsapp/whatsappService';

/**
 * Buscador unificado por "documento":
 *  - Paciente: numeroDocumento (cédula, TI, etc.)
 *  - Médico  : busca en tres lugares (en orden):
 *      1) perfilVerificacion.numeroDocumento (cédula real, lo que muestra la UI)
 *      2) numeroColegiatura (matrícula profesional)
 *  - Teléfono del médico: perfilVerificacion.celularContacto > whatsapp > telefono.
 *
 * Devuelve la primera coincidencia. Si encuentra ambos (rarísimo), el paciente
 * tiene prioridad.
 */
async function buscarUsuarioPorDocumento(documento: string) {
  const doc = String(documento).trim();
  if (!doc) return null;

  const paciente = await Paciente.findOne({ numeroDocumento: doc, activo: { $ne: false } })
    .select('_id nombre apellido email telefono numeroDocumento role')
    .lean();

  if (paciente) {
    return {
      tipo: 'paciente' as const,
      id: String((paciente as any)._id),
      nombre: (paciente as any).nombre,
      apellido: (paciente as any).apellido,
      email: (paciente as any).email,
      telefono: (paciente as any).telefono as string | undefined,
      role: UserRole.PACIENTE,
      raw: paciente
    };
  }

  const medico = await Medico.findOne({
    activo: { $ne: false },
    $or: [
      { 'perfilVerificacion.numeroDocumento': doc },
      { numeroColegiatura: doc }
    ]
  })
    .select('_id nombre apellido email telefono whatsapp numeroColegiatura role especialidad perfilVerificacion')
    .lean();

  if (medico) {
    const pv = ((medico as any).perfilVerificacion ?? {}) as Record<string, any>;
    const telefono =
      pv.celularContacto ||
      (medico as any).whatsapp ||
      (medico as any).telefono ||
      pv.telefonoLugarTrabajo;

    return {
      tipo: 'medico' as const,
      id: String((medico as any)._id),
      nombre: (medico as any).nombre,
      apellido: (medico as any).apellido,
      email: (medico as any).email,
      telefono: telefono as string | undefined,
      role: UserRole.MEDICO,
      raw: medico
    };
  }

  return null;
}

/**
 * POST /api/auth/2fa/enviar
 * Body: { documento: string }
 *
 * Valida que el documento corresponda a un usuario registrado (paciente o médico),
 * que tenga un teléfono, y envía un código por WhatsApp.
 */
export const enviarCodigo2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documento } = req.body ?? {};

    if (!documento || typeof documento !== 'string') {
      res.status(400).json({ success: false, message: 'El campo "documento" es requerido.' });
      return;
    }

    const user = await buscarUsuarioPorDocumento(documento);

    if (!user) {
      // Respuesta neutra para no filtrar qué documentos existen vs no.
      res.status(404).json({
        success: false,
        message: 'No encontramos un usuario registrado con ese documento.'
      });
      return;
    }

    if (!user.telefono) {
      res.status(409).json({
        success: false,
        message: 'El usuario no tiene un número de WhatsApp registrado. Contacta soporte.'
      });
      return;
    }

    const telefonoNormalizado = normalizarTelefono(user.telefono);
    await envioCodigoWhatsApp(user.telefono);

    // Pista del destino sin exponer el número completo
    const ultimos4 = telefonoNormalizado.slice(-4);

    res.json({
      success: true,
      message: `Código enviado por WhatsApp al número terminado en ****${ultimos4}.`,
      destino: `****${ultimos4}`,
      // Útil para que el frontend muestre nombre/rol en el paso 2 sin re-buscar:
      preview: {
        rol: user.role,
        nombre: user.nombre,
        apellido: user.apellido
      }
    });
  } catch (error: any) {
    console.error('[2FA enviarCodigo] error:', error);
    res.status(500).json({
      success: false,
      message: 'Error enviando el código por WhatsApp. Intenta de nuevo.'
    });
  }
};

/**
 * POST /api/auth/2fa/validar
 * Body: { documento: string, codigo: string }
 *
 * Verifica el código. Tres caminos:
 *  - Código correcto y vigente → emite JWT + datos del usuario.
 *  - Código incorrecto         → 401 sin reenvío.
 *  - Sin código vigente (ya expiró o nunca se generó) → reenvía uno nuevo y
 *    responde 410 (gone) indicando "te enviamos un código nuevo".
 *
 * Nota: el almacén interno del whatsappService borra el código apenas expira
 * o se valida, por lo que no podemos distinguir "expirado" de "código erróneo
 * tras varios intentos sobre uno ya consumido". Tratamos ambos casos como
 * "no hay código vigente" → reenviamos.
 */
export const validarCodigo2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documento, codigo } = req.body ?? {};

    if (!documento || typeof documento !== 'string') {
      res.status(400).json({ success: false, message: 'El campo "documento" es requerido.' });
      return;
    }
    if (!codigo || typeof codigo !== 'string') {
      res.status(400).json({ success: false, message: 'El campo "codigo" es requerido.' });
      return;
    }

    const user = await buscarUsuarioPorDocumento(documento);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'No encontramos un usuario registrado con ese documento.'
      });
      return;
    }
    if (!user.telefono) {
      res.status(409).json({
        success: false,
        message: 'El usuario no tiene un número de WhatsApp registrado.'
      });
      return;
    }

    const ok = verificarCodigoWhatsApp(user.telefono, codigo);

    if (ok) {
      const token = generateToken(user.id, user.role);
      const ultimos4 = normalizarTelefono(user.telefono).slice(-4);

      res.json({
        success: true,
        message: `¡Bienvenido${user.tipo === 'medico' ? ' Dr.' : ''} ${user.nombre}!`,
        token,
        usuario: {
          id: user.id,
          nombre: user.nombre,
          apellido: user.apellido,
          email: user.email,
          rol: user.role,
          telefonoEnmascarado: `****${ultimos4}`,
          ...(user.tipo === 'medico'
            ? { especialidad: (user.raw as any).especialidad ?? null }
            : { numeroDocumento: (user.raw as any).numeroDocumento ?? null })
        }
      });
      return;
    }

    // Código inválido o expirado → reenviar uno nuevo automáticamente.
    try {
      await envioCodigoWhatsApp(user.telefono);
    } catch (e) {
      console.error('[2FA validarCodigo] error reenviando código:', e);
      res.status(500).json({
        success: false,
        message: 'El código ya no es válido. No pudimos reenviar uno nuevo, intenta otra vez.'
      });
      return;
    }

    res.status(410).json({
      success: false,
      reenviado: true,
      message:
        'El código ingresado no es válido o ya expiró. Te enviamos un código nuevo por WhatsApp.'
    });
  } catch (error: any) {
    console.error('[2FA validarCodigo] error:', error);
    res.status(500).json({ success: false, message: 'Error validando el código.' });
  }
};
