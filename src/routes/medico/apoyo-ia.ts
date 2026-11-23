import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { UserRole } from '../../types';
import Cita from '../../models/Cita';
import Paciente from '../../models/Paciente';
import Interrogatorio from '../../models/Interrogatorio';
import { responderApoyoConsulta } from '../../services/ai/apoyoConsultaService';

const router = Router();

router.post('/', authenticate, authorize(UserRole.MEDICO), async (req: AuthRequest, res: Response) => {
  const { citaId, pregunta, contexto = '' } = req.body ?? {};
  if (typeof citaId !== 'string' || !/^[a-f\d]{24}$/i.test(citaId)
    || typeof pregunta !== 'string' || !pregunta.trim() || pregunta.length > 2000
    || typeof contexto !== 'string' || contexto.length > 100000) {
    res.status(400).json({ message: 'Indica una cita válida y una pregunta de hasta 2000 caracteres; el contexto no debe superar 100000 caracteres.' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', onClose);
  try {
    // El paciente siempre procede de la cita del médico autenticado.
    const cita = await Cita.findOne({ _id: citaId, medicoId: req.userId }).select('pacienteId').lean();
    if (!cita) {
      res.status(404).json({ message: 'No se encontró una cita a la que tengas acceso.' });
      return;
    }
    const [paciente, interrogatorio] = await Promise.all([
      Paciente.findById(cita.pacienteId).select('fechaNacimiento sexoBiologico').lean(),
      Interrogatorio.findOne({ pacienteId: cita.pacienteId }).sort({ updatedAt: -1 })
        .select('historiaClinica analisisIA').lean(),
    ]);
    const preconsulta = JSON.stringify({
      fechaNacimiento: paciente?.fechaNacimiento,
      sexoBiologico: paciente?.sexoBiologico,
      historiaClinica: interrogatorio?.historiaClinica,
      sintesisIA: interrogatorio?.analisisIA,
    });
    if (controller.signal.aborted) throw new Error('Solicitud cancelada');
    const respuesta = await responderApoyoConsulta({ pregunta: pregunta.trim(), contexto, preconsulta }, controller.signal);
    if (!res.destroyed) res.json({ respuesta });
  } catch {
    if (!res.destroyed) {
      res.status(controller.signal.aborted ? 504 : 502).json({
        message: controller.signal.aborted
          ? 'Apoyo IA tardó demasiado en responder. Inténtalo de nuevo.'
          : 'No se pudo obtener una respuesta de Apoyo IA. Inténtalo de nuevo.',
      });
    }
  } finally {
    clearTimeout(timer);
    res.off('close', onClose);
  }
});

export default router;
