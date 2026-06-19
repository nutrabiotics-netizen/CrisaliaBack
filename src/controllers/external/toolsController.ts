/**
 * Tools de External API — endpoints que el agente externo (MCP/Tool) consume
 * ACTUANDO EN NOMBRE del paciente o médico identificado por phoneToken.
 *
 * Todos requieren Authorization: Bearer <phoneToken> + middleware requirePhoneToken.
 * El contexto del sujeto vive en req.externalRole + req.externalSubjectId.
 */

import { Response } from 'express';
import mongoose from 'mongoose';
import Paciente from '../../models/Paciente';
import Medico from '../../models/Medico';
import Cita from '../../models/Cita';
import HistoriaClinica from '../../models/HistoriaClinica';
import FormulaMedica from '../../models/FormulaMedica';
import AdherenciaToma from '../../models/AdherenciaToma';
import { ExternalPhoneRequest } from '../../middleware/externalPhoneAuth';
import { regenerarResumenPaciente } from '../../services/paciente/resumenPacienteService';
import agendamientoService from '../../services/paciente/agendamiento/agendamientoService';

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

// ─────────────────────────────────────────────────────────────────────
// SHARED: información del sujeto autenticado
// ─────────────────────────────────────────────────────────────────────

export const getMe = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const id = req.externalSubjectId!;
    if (req.externalRole === 'paciente') {
      const p = await Paciente.findById(id)
        .select('-password -__v')
        .lean();
      if (!p) {
        res.status(404).json({ success: false, error: 'not_found' });
        return;
      }
      res.json({
        success: true,
        role: 'paciente',
        data: {
          _id: String(p._id),
          nombre: p.nombre,
          apellido: p.apellido,
          email: p.email,
          telefono: p.telefono,
          fechaNacimiento: p.fechaNacimiento,
          sexoBiologico: p.sexoBiologico,
          genero: p.genero,
          numeroDocumento: p.numeroDocumento,
          eps: p.eps,
          aseguradora: p.aseguradora,
          direccion: p.direccion
        }
      });
    } else {
      const m = await Medico.findById(id)
        .select('-password -__v')
        .lean();
      if (!m) {
        res.status(404).json({ success: false, error: 'not_found' });
        return;
      }
      res.json({
        success: true,
        role: 'medico',
        data: {
          _id: String(m._id),
          nombre: m.nombre,
          apellido: m.apellido,
          email: m.email,
          telefono: m.telefono,
          especialidad: m.especialidad,
          numeroDocumento: (m as any).perfilVerificacion?.numeroDocumento,
          registroMedico: (m as any).registroMedico,
          direccionConsultorioHabilitado: (m as any).direccionConsultorioHabilitado
        }
      });
    }
  } catch (err) {
    console.error('[tools.getMe]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PACIENTE: citas
// ─────────────────────────────────────────────────────────────────────

export const getMisCitas = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const subjectId = toObjectId(req.externalSubjectId!);
    const filtro = req.externalRole === 'paciente'
      ? { pacienteId: subjectId }
      : { medicoId: subjectId };
    const estado = req.query.estado as string | undefined;
    const desde = req.query.desde as string | undefined;
    const hasta = req.query.hasta as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);

    const where: any = { ...filtro };
    if (estado) where.estado = estado;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.$gte = new Date(desde);
      if (hasta) where.fecha.$lte = new Date(hasta);
    }

    const citas = await Cita.find(where)
      .populate('medicoId', 'nombre apellido especialidad telefono email')
      .populate('pacienteId', 'nombre apellido telefono email')
      .sort({ fecha: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      count: citas.length,
      data: citas.map((c: any) => ({
        _id: String(c._id),
        fecha: c.fecha,
        hora: c.hora,
        modalidad: c.modalidad,
        tipo: c.tipo,
        estado: c.estado,
        motivo: c.motivo,
        meetingId: c.meetingId,
        medico: c.medicoId
          ? {
              _id: String(c.medicoId._id),
              nombre: c.medicoId.nombre,
              apellido: c.medicoId.apellido,
              especialidad: c.medicoId.especialidad
            }
          : null,
        paciente: c.pacienteId
          ? {
              _id: String(c.pacienteId._id),
              nombre: c.pacienteId.nombre,
              apellido: c.pacienteId.apellido
            }
          : null
      }))
    });
  } catch (err) {
    console.error('[tools.getMisCitas]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

export const getProximaCita = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const subjectId = toObjectId(req.externalSubjectId!);
    const filtro = req.externalRole === 'paciente'
      ? { pacienteId: subjectId }
      : { medicoId: subjectId };
    const cita = await Cita.findOne({
      ...filtro,
      estado: { $in: ['pendiente', 'confirmada', 'en_curso'] },
      fecha: { $gte: new Date() }
    })
      .populate('medicoId', 'nombre apellido especialidad telefono')
      .populate('pacienteId', 'nombre apellido telefono')
      .sort({ fecha: 1 })
      .lean();
    res.json({ success: true, data: cita || null });
  } catch (err) {
    console.error('[tools.getProximaCita]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PACIENTE: tratamiento (fórmulas activas + adherencia)
// ─────────────────────────────────────────────────────────────────────

export const getMiTratamiento = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'paciente') {
      res.status(403).json({ success: false, error: 'solo_paciente' });
      return;
    }
    const pacienteId = toObjectId(req.externalSubjectId!);

    // Últimas 5 fórmulas
    const formulas = await FormulaMedica.find({ pacienteId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('medicoId', 'nombre apellido especialidad')
      .lean();

    // Adherencia últimas 30 días
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const adherencia = await AdherenciaToma.find({
      pacienteId,
      fechaToma: { $gte: desde }
    })
      .sort({ fechaToma: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        formulas: formulas.map((f: any) => ({
          _id: String(f._id),
          fecha: f.createdAt,
          medico: f.medicoId
            ? `${f.medicoId.nombre} ${f.medicoId.apellido}`
            : 'Médico no disponible',
          medicamentos: f.medicamentos ?? [],
          observaciones: f.observaciones
        })),
        adherencia: {
          tomasUltimos30Dias: adherencia.length,
          ultimasTomas: adherencia.slice(0, 10).map((t: any) => ({
            fecha: t.fechaToma,
            medicamentoIndex: t.medicamentoIndex,
            formulaMedicaId: String(t.formulaMedicaId)
          }))
        }
      }
    });
  } catch (err) {
    console.error('[tools.getMiTratamiento]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PACIENTE: historia clínica resumida
// ─────────────────────────────────────────────────────────────────────

export const getMiHistoria = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'paciente') {
      res.status(403).json({ success: false, error: 'solo_paciente' });
      return;
    }
    const pacienteId = toObjectId(req.externalSubjectId!);
    const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50);
    const historias = await HistoriaClinica.find({ pacienteId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('medicoId', 'nombre apellido especialidad')
      .populate('citaId', 'fecha hora tipo modalidad')
      .lean();
    res.json({
      success: true,
      count: historias.length,
      data: historias.map((h: any) => ({
        _id: String(h._id),
        fecha: h.createdAt,
        medico: h.medicoId ? `${h.medicoId.nombre} ${h.medicoId.apellido}` : '—',
        especialidad: h.medicoId?.especialidad,
        cita: h.citaId
          ? { fecha: h.citaId.fecha, hora: h.citaId.hora, tipo: h.citaId.tipo }
          : null,
        motivoConsulta: h.motivoConsulta,
        enfermedadActual: h.enfermedadActual,
        diagnosticos: h.diagnosticos,
        analisisPlan: h.analisisPlan,
        recomendaciones: h.recomendaciones
      }))
    });
  } catch (err) {
    console.error('[tools.getMiHistoria]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PACIENTE: agendar cita
// ─────────────────────────────────────────────────────────────────────

export const postAgendar = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'paciente') {
      res.status(403).json({ success: false, error: 'solo_paciente' });
      return;
    }
    const { medicoId, fecha, hora, modalidad, tipo, motivo, aseguradora } = req.body ?? {};
    if (!medicoId || !fecha || !hora || !modalidad) {
      res.status(400).json({
        success: false,
        error: 'datos_incompletos',
        message: 'Requeridos: medicoId, fecha (YYYY-MM-DD), hora (HH:mm), modalidad (presencial|virtual)'
      });
      return;
    }
    const pacienteId = toObjectId(req.externalSubjectId!);
    const medicoObjId = toObjectId(medicoId);

    // Verificar que el médico existe
    const medico = await Medico.findById(medicoObjId).lean();
    if (!medico) {
      res.status(404).json({ success: false, error: 'medico_no_encontrado' });
      return;
    }

    // Normalizar hora a formato 24h para construir la fecha (soporta "08:00 AM", "02:00 PM" y "14:00")
    const horaStr = String(hora).trim();
    const ampmMatch = horaStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    let hora24: string;
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = ampmMatch[2];
      const ampm = ampmMatch[3].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      else if (ampm === 'AM' && h === 12) h = 0;
      hora24 = `${h.toString().padStart(2, '0')}:${m}`;
    } else {
      hora24 = horaStr;
    }

    const cita = await Cita.create({
      pacienteId,
      medicoId: medicoObjId,
      fecha: new Date(`${fecha}T${hora24}:00`),
      hora,
      modalidad,
      tipo: tipo || 'consulta',
      motivo,
      aseguradora,
      estado: 'pendiente'
    });

    res.status(201).json({
      success: true,
      data: {
        _id: String(cita._id),
        estado: cita.estado,
        message:
          'Cita agendada. El paciente debe confirmar el pago en el portal para activar la cita.'
      }
    });
  } catch (err) {
    console.error('[tools.postAgendar]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PACIENTE: cancelar cita
// ─────────────────────────────────────────────────────────────────────

export const postCancelar = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'paciente') {
      res.status(403).json({ success: false, error: 'solo_paciente' });
      return;
    }
    const { citaId, motivo } = req.body ?? {};
    if (!citaId) {
      res.status(400).json({ success: false, error: 'falta_citaId' });
      return;
    }
    const pacienteId = toObjectId(req.externalSubjectId!);
    const cita = await Cita.findOne({ _id: toObjectId(citaId), pacienteId });
    if (!cita) {
      res.status(404).json({ success: false, error: 'cita_no_encontrada' });
      return;
    }
    cita.estado = 'cancelada';
    (cita as any).motivoCancelacion = motivo || 'Cancelada por el paciente vía agente externo';
    await cita.save();
    res.json({ success: true, data: { _id: String(cita._id), estado: cita.estado } });
  } catch (err) {
    console.error('[tools.postCancelar]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// MÉDICO: agenda del día / semana
// ─────────────────────────────────────────────────────────────────────

export const getAgendaMedico = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'medico') {
      res.status(403).json({ success: false, error: 'solo_medico' });
      return;
    }
    const medicoId = toObjectId(req.externalSubjectId!);
    const rango = (req.query.rango as string) || 'hoy';

    const now = new Date();
    let desde = new Date(now);
    let hasta = new Date(now);
    desde.setHours(0, 0, 0, 0);
    hasta.setHours(23, 59, 59, 999);

    if (rango === 'semana') {
      hasta.setDate(hasta.getDate() + 6);
    } else if (rango === 'mes') {
      hasta.setDate(hasta.getDate() + 30);
    }

    const citas = await Cita.find({
      medicoId,
      fecha: { $gte: desde, $lte: hasta },
      estado: { $ne: 'cancelada' }
    })
      .populate('pacienteId', 'nombre apellido telefono email')
      .sort({ fecha: 1, hora: 1 })
      .lean();

    res.json({
      success: true,
      rango,
      count: citas.length,
      data: citas.map((c: any) => ({
        _id: String(c._id),
        fecha: c.fecha,
        hora: c.hora,
        modalidad: c.modalidad,
        tipo: c.tipo,
        estado: c.estado,
        motivo: c.motivo,
        paciente: c.pacienteId
          ? {
              _id: String(c.pacienteId._id),
              nombre: c.pacienteId.nombre,
              apellido: c.pacienteId.apellido,
              telefono: c.pacienteId.telefono
            }
          : null
      }))
    });
  } catch (err) {
    console.error('[tools.getAgendaMedico]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// MÉDICO: ficha de paciente (solo si tiene citas con él)
// ─────────────────────────────────────────────────────────────────────

export const getPacienteFicha = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'medico') {
      res.status(403).json({ success: false, error: 'solo_medico' });
      return;
    }
    const medicoId = toObjectId(req.externalSubjectId!);
    const pacienteId = toObjectId(req.params.pacienteId as string);

    // Validar que el médico haya atendido a ese paciente alguna vez
    const tieneCita = await Cita.exists({ medicoId, pacienteId });
    if (!tieneCita) {
      res.status(403).json({
        success: false,
        error: 'sin_relacion',
        message: 'No tienes registro de atención previa con este paciente'
      });
      return;
    }

    const paciente = await Paciente.findById(pacienteId)
      .select('-password -__v')
      .lean();
    const ultimaHc = await HistoriaClinica.findOne({ pacienteId, medicoId })
      .sort({ createdAt: -1 })
      .lean();
    const ultimasFormulas = await FormulaMedica.find({ pacienteId, medicoId })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    res.json({
      success: true,
      data: {
        paciente,
        ultimaHistoriaClinica: ultimaHc,
        ultimasFormulas
      }
    });
  } catch (err) {
    console.error('[tools.getPacienteFicha]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// SHARED: catálogo de médicos disponibles (para agendar)
// ─────────────────────────────────────────────────────────────────────

export const getDisponibilidadMedico = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const medicoId = String(req.params.medicoId);
    const dias = Math.min(parseInt(String(req.query.dias ?? '14'), 10) || 14, 60);
    const pacienteId = req.externalRole === 'paciente' ? req.externalSubjectId : undefined;

    const medico = await Medico.findById(medicoId).select('nombre apellido especialidad').lean();
    if (!medico) {
      res.status(404).json({ success: false, error: 'medico_no_encontrado' });
      return;
    }

    const hoy = new Date();
    const resultados: { fecha: string; slots: string[] }[] = [];

    for (let i = 1; i <= dias; i++) {
      const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + i));
      const fechaStr = fecha.toISOString().split('T')[0];

      const horarios = await agendamientoService.obtenerHorariosDisponibles(
        medicoId,
        fechaStr,
        undefined,
        pacienteId
      );

      const slots = horarios
        .filter((h: any) => h.disponible)
        .map((h: any) => h.hora);

      if (slots.length > 0) {
        resultados.push({ fecha: fechaStr, slots });
      }
    }

    res.json({
      success: true,
      medico: {
        _id: String((medico as any)._id),
        nombre: (medico as any).nombre,
        apellido: (medico as any).apellido,
        especialidad: (medico as any).especialidad,
      },
      diasConsultados: dias,
      diasDisponibles: resultados.length,
      data: resultados,
    });
  } catch (err) {
    console.error('[tools.getDisponibilidadMedico]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

export const getEspecialidades = async (_req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const especialidades = await Medico.distinct('especialidad');
    const filtradas = especialidades
      .filter((e: unknown) => typeof e === 'string' && e.trim() !== '')
      .sort();
    res.json({ success: true, data: filtradas });
  } catch (err) {
    console.error('[tools.getEspecialidades]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

export const getMedicosDisponibles = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const especialidad = req.query.especialidad as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);

    const where: any = {};
    if (especialidad) where.especialidad = especialidad;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      where.$or = [
        { nombre: re },
        { apellido: re },
        { especialidad: re },
        { motivosConsultaQueAtiende: re }
      ];
    }

    const medicos = await Medico.find(where)
      .select('nombre apellido especialidad direccionConsultorioHabilitado motivosConsultaQueAtiende telefono')
      .limit(limit)
      .lean();

    res.json({
      success: true,
      count: medicos.length,
      data: medicos.map((m: any) => ({
        _id: String(m._id),
        nombre: m.nombre,
        apellido: m.apellido,
        especialidad: m.especialidad,
        direccionConsultorio: m.direccionConsultorioHabilitado,
        motivosConsultaQueAtiende: m.motivosConsultaQueAtiende
      }))
    });
  } catch (err) {
    console.error('[tools.getMedicosDisponibles]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PACIENTE: resumen integral generado por Crisal·IA Agent
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /external/tools/me/resumen
 *
 * Devuelve el resumen integral del paciente (`Paciente.resumenIA`).
 * Si nunca se generó (paciente nuevo), lo genera al vuelo.
 */
export const getMiResumen = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'paciente') {
      res.status(403).json({ success: false, error: 'solo_paciente' });
      return;
    }
    const pacienteId = req.externalSubjectId!;
    const paciente = await Paciente.findById(pacienteId).select('resumenIA').lean();
    const r = (paciente as any)?.resumenIA;

    if (!r?.texto) {
      // Generar al vuelo en la primera lectura
      const texto = await regenerarResumenPaciente(pacienteId, 'inicial');
      if (!texto) {
        res.json({
          success: true,
          data: {
            texto: null,
            actualizadoEn: null,
            version: 0,
            message: 'Aún no hay información clínica suficiente para generar un resumen.'
          }
        });
        return;
      }
      res.json({
        success: true,
        data: {
          texto,
          actualizadoEn: new Date().toISOString(),
          version: 1,
          motivoActualizacion: 'inicial'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        texto: r.texto,
        actualizadoEn: r.actualizadoEn,
        version: r.version ?? 1,
        motivoActualizacion: r.motivoActualizacion,
        citaIdReferencia: r.citaIdReferencia
      }
    });
  } catch (err) {
    console.error('[tools.getMiResumen]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};

/**
 * POST /external/tools/me/resumen/refresh
 *
 * Fuerza regeneración del resumen integral. Útil cuando el agente externo
 * sabe que hubo cambios y quiere garantizar versión fresca antes de leer.
 */
export const postRefreshResumen = async (req: ExternalPhoneRequest, res: Response): Promise<void> => {
  try {
    if (req.externalRole !== 'paciente') {
      res.status(403).json({ success: false, error: 'solo_paciente' });
      return;
    }
    const pacienteId = req.externalSubjectId!;
    const texto = await regenerarResumenPaciente(pacienteId, 'manual');
    if (!texto) {
      res.status(503).json({
        success: false,
        error: 'no_generado',
        message: 'No se pudo regenerar el resumen (agente IA no disponible o sin datos clínicos).'
      });
      return;
    }
    const paciente = await Paciente.findById(pacienteId).select('resumenIA').lean();
    const r = (paciente as any)?.resumenIA;
    res.json({
      success: true,
      data: {
        texto,
        actualizadoEn: r?.actualizadoEn,
        version: r?.version,
        motivoActualizacion: 'manual'
      }
    });
  } catch (err) {
    console.error('[tools.postRefreshResumen]', err);
    res.status(500).json({ success: false, error: 'server_error' });
  }
};
