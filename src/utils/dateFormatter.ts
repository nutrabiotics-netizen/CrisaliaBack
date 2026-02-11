/**
 * Utilidades para formatear fechas en respuestas de API
 * Formato: DD/MM/YYYY para fechas, DD/MM/YYYY HH:mm para fechas con hora
 */

/**
 * Formatea una fecha a string legible (DD/MM/YYYY)
 */
export const formatDate = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Formatea una fecha con hora a string legible (DD/MM/YYYY HH:mm)
 */
export const formatDateTime = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Detecta si un valor es una fecha (Date o string ISO)
 */
const isDateValue = (value: unknown): boolean => {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return !isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value);
  }
  return false;
};

/**
 * Formatea recursivamente todas las fechas en un objeto
 * - fecha, fechaNacimiento: solo fecha (DD/MM/YYYY)
 * - fechaRegistro, createdAt, updatedAt: fecha con hora (DD/MM/YYYY HH:mm)
 */
export const formatDatesInObject = <T>(obj: T): T => {
  if (obj == null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(formatDatesInObject) as T;
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value != null && isDateValue(value)) {
        const dateStr = typeof value === 'string' ? value : (value as Date).toISOString();
        // Campos que solo tienen fecha (sin hora significativa)
        if (['fecha', 'fechaNacimiento', 'fechaInicio', 'fechaFin'].includes(key)) {
          result[key] = formatDate(dateStr);
        } else {
          result[key] = formatDateTime(dateStr);
        }
      } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        result[key] = formatDatesInObject(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return obj;
};
