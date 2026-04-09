import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import Cita from '../../models/Cita';
import AsignacionBox from '../../models/AsignacionBox';

function parseFechaQuery(fechaParam: unknown): { y: number; m: number; d: number } {
  if (typeof fechaParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) {
    const [y, m, d] = fechaParam.split('-').map(Number);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { y, m, d };
    }
  }
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export const obtenerPacientesDelDia = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { y, m, d } = parseFechaQuery(req.query.fecha);

    // Rango local del día elegido (boxes / asignaciones suelen alinearse al calendario local)
    const inicioDia = new Date(y, m - 1, d, 0, 0, 0, 0);
    const finDia = new Date(y, m - 1, d, 23, 59, 59, 999);

    // Citas guardan `fecha` como inicio del día en UTC (mismo criterio que agendamiento / sala de espera)
    const inicioDiaCita = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const finDiaCita = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));

    const citasHoy = await Cita.find({
      estado: { $nin: ['cancelada', 'completada'] },
      fecha: { $gte: inicioDiaCita, $lt: finDiaCita }
    })
    .populate('pacienteId', 'nombre apellido numeroIdentificacion email telefono informacionMedica alergias tipoSangre')
    .populate('medicoId', 'nombre apellido especialidades')
    .sort({ hora: 1 })
    .lean();

    const asignacionesHoy = await AsignacionBox.find({
      fecha: { $gte: inicioDia, $lte: finDia },
      activo: true
    })
    .populate('boxId', 'nombre')
    .lean();

    const citasProcesadas = citasHoy.map((cita) => {
       const pa = cita.pacienteId as any;
       const me = cita.medicoId as any;

       // Buscar si el medico tiene un box asignado hoy
       const asignacion = asignacionesHoy.find(a => (a.medicoId as any)?.toString() === me?._id?.toString());
       let boxStr = 'Box No Asignado';
       
       if (asignacion && asignacion.boxId) {
          boxStr = (asignacion.boxId as any).nombre || 'Box Desconocido';
       }

       return {
          id: cita._id,
          nombre: pa ? `${pa.nombre || ''} ${pa.apellido || ''}`.trim() : 'Paciente Desconocido',
          telefono: pa?.telefono || 'No registra',
          horaCita: cita.hora,
          fechaCruda: cita.fecha,
          medico: me ? `Dr. ${me.nombre || ''} ${me.apellido || ''}`.trim() : 'Médico Desconocido',
          box: boxStr,
          estado: cita.estado,
          pago: 'pagado', // Simulado
          progreso: {
            seleccionMedico: true,
            pagoConsulta: true,
            anamnesis: true,
            laboratorios: false,
            recomendaciones: true,
            asistencia: (cita.estado === 'en_espera' || cita.estado === 'en_consulta' || cita.estado === 'completada')
          },
          tipoAseguradora: 'Particular', // Hardcodeo momentáneo ya que esquema paciente es básico en MVP
          requerimientosEspeciales: pa?.alergias?.length ? `Alergias: ${pa.alergias.join(', ')}` : 'Ninguno',
          horaLlegada: cita.horaLlegada || null
       };
    });

    res.json({ success: true, data: citasProcesadas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener sala de espera', error: error.message });
  }
};

export const registrarLlegadaPaciente = async (req: AuthRequest, res: Response): Promise<void> => {
   try {
       const { id } = req.params;
       const citaUpdate = await Cita.findByIdAndUpdate(id, {
           estado: 'en_espera',
           horaLlegada: new Date()
       }, { new: true });

       if (!citaUpdate) {
           res.status(404).json({ success: false, message: 'Cita no encontrada.' });
           return;
       }

       res.json({ success: true, message: 'Se ha confirmado la llegada del paciente a la sala.', data: citaUpdate });
   } catch (error: any) {
       res.status(500).json({ success: false, message: 'Error registrando llegada', error: error.message });
   }
};
