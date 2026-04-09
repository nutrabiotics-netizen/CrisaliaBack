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

/** Combina la fecha de la cita (día calendario local) con la hora del turno. */
export function combineFechaCitaConHora(fecha: Date, hora: string): Date {
  const d = new Date(fecha);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const day = d.getDate();
  const h24 = horaA24Horas(hora);
  const parts = h24.split(':');
  const hh = parseInt(parts[0], 10) || 0;
  const mm = parseInt(parts[1], 10) || 0;
  return new Date(y, mo, day, hh, mm, 0, 0);
}
