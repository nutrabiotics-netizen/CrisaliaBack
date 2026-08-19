import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE_COLOMBIA = 'America/Bogota';

/**
 * Convierte una fecha string (YYYY-MM-DD o ISO) a un objeto Date
 * interpretado como medianoche en Colombia (UTC-5 = T05:00:00Z).
 * Garantiza que "2026-08-17" se guarde como "2026-08-17T05:00:00.000Z".
 */
export function parseFechaColombia(fecha: string): Date {
  const soloFecha = String(fecha).split('T')[0];
  return dayjs.tz(soloFecha, TIMEZONE_COLOMBIA).toDate();
}

/**
 * Retorna la fecha de hoy en Colombia como string YYYY-MM-DD.
 */
export function hoyEnColombia(): string {
  return dayjs().tz(TIMEZONE_COLOMBIA).format('YYYY-MM-DD');
}