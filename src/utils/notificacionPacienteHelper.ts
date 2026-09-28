import NotificacionPaciente, { TipoNotificacionPaciente } from '../models/NotificacionPaciente';

export async function crearNotificacionPaciente(params: {
  pacienteId: string;
  tipo: TipoNotificacionPaciente;
  titulo: string;
  mensaje: string;
  datos?: Record<string, unknown>;
}): Promise<void> {
  try {
    await NotificacionPaciente.create({
      pacienteId: params.pacienteId,
      tipo: params.tipo,
      titulo: params.titulo,
      mensaje: params.mensaje,
      datos: params.datos,
    });
  } catch (e) {
    console.error('[NotificacionPaciente] Error al crear:', e);
  }
}
