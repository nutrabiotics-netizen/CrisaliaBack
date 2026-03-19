import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import BoxConsultorio from '../../models/BoxConsultorio';
import Medico from '../../models/Medico';
import Cita from '../../models/Cita';
import PersonalInstitucional from '../../models/PersonalInstitucional';

// Constante de precio simulado por consulta
const TARIFA_CONSULTA = 150000;

export const rendimientoBoxes = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boxes = await BoxConsultorio.find().sort({ nombre: 1 }).lean();
    
    // Al no haber histórico real cruzado, generamos estadísticas proporcionales al nombre/id 
    // pero respetando el estado real del Box en MongoDB.
    const statsBoxes = boxes.map((box: any, idx: number) => {
      // Mock dinámico: usamos el índice para variar los números de "pacientes atendidos"
      const basePacientes = box.estado === 'mantenimiento' ? 0 : 50 + (idx * 27);
      
      return {
        _id: box._id,
        nombre: box.nombre,
        estado: box.estado, // 'disponible' | 'en_uso' | 'mantenimiento'
        ingresosMes: basePacientes * TARIFA_CONSULTA,
        pacientesAtendidos: basePacientes,
        tasaOcupacion: box.estado === 'mantenimiento' ? 0 : Math.min(100, 40 + (idx * 15)),
        sugerencia: box.estado === 'mantenimiento' 
          ? 'Box inhabilitado temporalmente.' 
          : 'Optimizar horarios de menor demanda para aumentar ocupación.'
      };
    });

    res.json({ success: true, data: statsBoxes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener rendimiento de boxes', error: error.message });
  }
};

export const rendimientoProfesionales = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicos = await Medico.find({ activo: true }).lean();
    
    const statsProfesionales = await Promise.all(medicos.map(async (m: any) => {
      // Contar citas reales completadas o confirmadas de este médico
      const citasCount = await Cita.countDocuments({
        medicoId: m._id,
        estado: { $in: ['confirmada', 'completada'] }
      });
      
      // Si el médico no tiene citas, le damos un volumen mock para que la vista del Dashboard no sea 0 
      // (a petición de que sea analítico) o lo dejamos en su valor real. Lo dejamos en su valor real:
      const totalPacientes = citasCount; 
      
      return {
        _id: m._id,
        nombre: `Dr/Dra. ${m.nombre} ${m.apellido || ''}`,
        especialidad: m.especialidad || 'General',
        pacientesAtendidos: totalPacientes,
        ingresosGenerados: totalPacientes * TARIFA_CONSULTA,
        rentabilidadConsulta: TARIFA_CONSULTA * 0.75, // Ejemplo de 75% margen
        tasaOcupacion: Math.min(100, totalPacientes > 0 ? 50 + (totalPacientes * 5) : 0),
        sugerencia: totalPacientes > 0 
          ? 'Patrón estable detectado.' 
          : 'No registra volumen de citas recientes. Considerar promoción.'
      };
    }));

    res.json({ success: true, data: statsProfesionales });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener rendimiento de profesionales', error: error.message });
  }
};

export const estadisticasPersonal = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Agrupamos el personal real por nombre de cargo
    const agrupacion = await PersonalInstitucional.aggregate([
      { $match: { activo: true, tipo: 'administrativo' } },
      { $group: { _id: '$cargo', total: { $sum: 1 } } }
    ]);

    const data = agrupacion.map((group: any) => {
      const actual = group.total;
      // IA mock: el recomendado será siempre algo aleatorio cercano al real
      const recomendado = actual === 1 ? 2 : actual;
      let estado = 'optimo';
      if (actual > recomendado) estado = 'exceso';
      if (actual < recomendado) estado = 'deficit';

      return {
        categoria: group._id,
        actual,
        recomendado,
        estado 
      };
    });

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener personal', error: error.message });
  }
};
