import ConfiguracionNotificacionesMedico from '../models/ConfiguracionNotificacionesMedico';
import type { CategoriaNotificacion } from '../models/Notificacion';

export interface CanalesActivos {
  inApp:    boolean;
  whatsapp: boolean;
  correo:   boolean;
  push:     boolean;
}

/** Categorías que ignoran el horario tranquilo (son críticas). */
const CATEGORIAS_CRITICAS: CategoriaNotificacion[] = [
  'privacidad_seguridad',
  'citas_agenda',
];

/**
 * Devuelve qué canales están habilitados para una categoría y médico dados,
 * teniendo en cuenta:
 *  1. Si la categoría está activa en las preferencias del médico.
 *  2. Los canales habilitados por categoría.
 *  3. El horario tranquilo (solo aplica a categorías no críticas).
 *
 * Si el médico no tiene config guardada, devuelve defaults (todos activos).
 */
export async function verificarCanalesNotificacion(
  medicoId: string,
  categoria: CategoriaNotificacion
): Promise<CanalesActivos> {
  const defaults: CanalesActivos = { inApp: true, whatsapp: true, correo: true, push: false };

  try {
    const config = await ConfiguracionNotificacionesMedico.findOne({ medicoId }).lean();
    if (!config) return defaults;

    // 1. Verificar si la categoría está activa
    const catConfig = config.categorias?.find(c => c.categoria === categoria);
    if (catConfig && !catConfig.activa) {
      return { inApp: false, whatsapp: false, correo: false, push: false };
    }

    // 2. Obtener canales de la categoría (o defaults si no está configurada)
    const canales = catConfig?.canales ?? { interna: true, correo: true, whatsapp: true, push: false };

    // 3. Verificar horario tranquilo (solo para categorías no críticas)
    let enHorarioTranquilo = false;
    if (!CATEGORIAS_CRITICAS.includes(categoria) && config.horarioTranquilo?.activo) {
      enHorarioTranquilo = estaEnHorarioTranquilo(config.horarioTranquilo);
    }

    return {
      inApp:    canales.interna  && !enHorarioTranquilo,
      whatsapp: canales.whatsapp && !enHorarioTranquilo,
      correo:   canales.correo   && !enHorarioTranquilo,
      push:     (canales.push ?? false) && !enHorarioTranquilo,
    };
  } catch (e) {
    console.warn('[verificarCanales] Error al leer preferencias:', e);
    return defaults;
  }
}

// ─── Helpers de tiempo ────────────────────────────────────────────────────────

function horaEnMinutos(hhmm: string): number {
  const [h, m] = (hhmm ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function estaEnHorarioTranquilo(ht: {
  activo: boolean;
  desde: string;
  hasta: string;
  dias: 'lunes_viernes' | 'todos' | 'fines_semana';
}): boolean {
  const ahora = new Date();
  // Convertir a hora Colombia (UTC-5)
  const colombiaOffset = -5 * 60;
  const utcMinutes = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const localMinutes = ((utcMinutes + colombiaOffset) % 1440 + 1440) % 1440;
  const diaSemana = ((ahora.getUTCDay() + Math.floor((utcMinutes + colombiaOffset) / 1440) + 7) % 7);
  // 0=Dom, 1=Lun, ... 6=Sáb

  // Verificar días
  const esFinde = diaSemana === 0 || diaSemana === 6;
  if (ht.dias === 'lunes_viernes' && esFinde) return false;
  if (ht.dias === 'fines_semana' && !esFinde) return false;

  // Verificar rango horario (puede cruzar medianoche)
  const desde = horaEnMinutos(ht.desde);
  const hasta  = horaEnMinutos(ht.hasta);

  if (desde <= hasta) {
    return localMinutes >= desde && localMinutes < hasta;
  } else {
    // Cruza medianoche: ej. 20:00 → 06:30
    return localMinutes >= desde || localMinutes < hasta;
  }
}