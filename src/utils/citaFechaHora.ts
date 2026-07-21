/** Normaliza hora "08:00 AM" / "08:00" a formato 24h "08:00". */
export function horaA24Horas(hora: string): string {
  const s = String(hora).trim();
  const tieneAMPM = /AM|PM/i.test(s);
  if (!tieneAMPM) return s;
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return s;
  let h = parseInt(match[1], 10);
  const m = match[2];
  if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  else if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
}

/** Combina la fecha de la cita (día calendario UTC) con la hora del turno en hora Colombia (UTC-5). */
export function combineFechaCitaConHora(fecha: Date, hora: string): Date {
  const d = new Date(fecha);
  // Usar UTC para extraer el día (la fecha se guarda como 00:00 UTC)
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  const h24 = horaA24Horas(hora);
  const parts = h24.split(':');
  const hh = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  // La hora de la cita está en hora Colombia (UTC-5), convertir a UTC sumando 5 horas
  return new Date(Date.UTC(y, mo, day, hh + 5, mm, 0, 0));
}
