import Notificacion from '../models/Notificacion';
import ConfiguracionNotificacionesMedico from '../models/ConfiguracionNotificacionesMedico';
import type { TipoNotificacion, CategoriaNotificacion } from '../models/Notificacion';

interface CrearNotificacionOpts {
  medicoId: string;
  tipo: TipoNotificacion;
  categoria: CategoriaNotificacion;
  titulo: string;
  cuerpo: string;
  requiereAccion?: boolean;
  accionUrl?: string;
  accionLabel?: string;
  pacienteId?: string;
  pacienteNombre?: string;
  citaId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Crea una notificación in-app para el médico si:
 * 1. La categoría está activa en sus preferencias.
 * 2. El canal "interna" está habilitado para esa categoría.
 *
 * Fire-and-forget: no lanza errores al caller.
 */
export async function crearNotificacionMedico(opts: CrearNotificacionOpts): Promise<void> {
  try {
    // Verificar preferencias del médico
    const config = await ConfiguracionNotificacionesMedico.findOne(
      { medicoId: opts.medicoId },
      { categorias: 1 }
    ).lean();

    if (config?.categorias?.length) {
      const cat = config.categorias.find(c => c.categoria === opts.categoria);
      if (cat && (!cat.activa || !cat.canales?.interna)) return;
    }

    await Notificacion.create({
      medicoId:       opts.medicoId,
      tipo:           opts.tipo,
      categoria:      opts.categoria,
      titulo:         opts.titulo,
      cuerpo:         opts.cuerpo,
      requiereAccion: opts.requiereAccion ?? false,
      accionUrl:      opts.accionUrl,
      accionLabel:    opts.accionLabel,
      pacienteId:     opts.pacienteId,
      pacienteNombre: opts.pacienteNombre,
      citaId:         opts.citaId,
      metadata:       opts.metadata,
    });
  } catch (e) {
    console.warn('[NotificacionHelper] Error al crear notificación in-app:', e);
  }
}