import mongoose from 'mongoose';
import Cita from '../../../models/Cita';
import Paciente from '../../../models/Paciente';
import {
  CATALOGO_TIPS_SALA,
  CATALOGO_VIDEOS_SALA,
  ItemTipSala,
  ItemVideoSala
} from './salaEsperaContenidoCatalog';

/** Normaliza hora de cita para ordenar slots (misma lógica que agendamientoController). */
function horaA24Horas(hora: string): string {
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

function boundsFromCitaFecha(fecha: Date): { inicioDia: Date; finDia: Date } {
  const parte = fecha.toISOString().split('T')[0];
  const [y, m, d] = parte.split('-').map(Number);
  const inicioDia = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const finDia = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  return { inicioDia, finDia };
}

function scoreItemTags(itemTags: string[], userTags: Set<string>): number {
  let score = 0;
  for (const t of itemTags) {
    if (userTags.has(t)) score += t === 'general' ? 1 : 3;
  }
  return score;
}

export function zonasDolorATags(zonasDolor?: string[] | null): string[] {
  const tags = new Set<string>(['general']);
  if (!zonasDolor?.length) return [...tags];
  const z = zonasDolor.join(' ').toLowerCase();
  if (/cabeza|cerebral|cefalea|migraña|migrana/.test(z)) tags.add('neuro');
  if (/cuello|cervical/.test(z)) tags.add('postura');
  if (/espalda|lumbar|columna|dorsal/.test(z)) tags.add('postura');
  if (/abdomen|digest|intestin|estómago|estomago|gastro/.test(z)) tags.add('digestivo');
  if (/articulaci|rodilla|cadera|hombro|muscular|tendon|artritis/.test(z)) tags.add('inflamacion');
  if (/corazón|corazon|pecho|cardio|presión|presion/.test(z)) tags.add('cardio');
  if (/ansiedad|estrés|estres|insomnio|sueño|sueno|nervio/.test(z)) tags.add('estres');
  return [...tags];
}

export function seleccionarContenidoSala(userTags: string[]): {
  tips: ItemTipSala[];
  videos: ItemVideoSala[];
} {
  const tagSet = new Set(userTags.length ? userTags : ['general']);

  const tipsScored = [...CATALOGO_TIPS_SALA].map((t) => ({
    t,
    s: scoreItemTags(t.tags, tagSet)
  }));
  tipsScored.sort((a, b) => b.s - a.s || a.t.id.localeCompare(b.t.id));
  const tips = tipsScored.map((x) => x.t);

  const videosScored = [...CATALOGO_VIDEOS_SALA].map((v) => ({
    v,
    s: scoreItemTags(v.tags, tagSet)
  }));
  videosScored.sort((a, b) => b.s - a.s || a.v.id.localeCompare(b.v.id));
  const videos = videosScored.map((x) => x.v);

  return { tips, videos };
}

export interface EstadoColaSala {
  estadoCita: string;
  enCola: boolean;
  tuTurno: boolean;
  posicionEnCola: number | null;
  totalEnEspera: number;
  medicoNombre?: string;
  mensaje: string | null;
  demoraEstimadaMinutos: number | null;
}

function ordenarColaEnEspera(
  docs: { _id: mongoose.Types.ObjectId; horaLlegada?: Date; hora: string }[]
): typeof docs {
  return [...docs].sort((a, b) => {
    const ta = a.horaLlegada ? new Date(a.horaLlegada).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.horaLlegada ? new Date(b.horaLlegada).getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return horaA24Horas(a.hora).localeCompare(horaA24Horas(b.hora));
  });
}

export async function obtenerEstadoColaSalaEspera(
  citaId: string,
  pacienteId: string
): Promise<EstadoColaSala | null> {
  if (!mongoose.Types.ObjectId.isValid(citaId) || !mongoose.Types.ObjectId.isValid(pacienteId)) {
    return null;
  }

  const cita = await Cita.findOne({
    _id: new mongoose.Types.ObjectId(citaId),
    pacienteId: new mongoose.Types.ObjectId(pacienteId)
  })
    .populate('medicoId', 'nombre apellido')
    .lean();

  if (!cita) return null;

  const medRaw = cita.medicoId as unknown as { _id: mongoose.Types.ObjectId; nombre?: string; apellido?: string };
  const medicoNombre =
    medRaw && typeof medRaw === 'object' && 'nombre' in medRaw
      ? `${medRaw.nombre || ''} ${medRaw.apellido || ''}`.trim() || undefined
      : undefined;

  const medicoId =
    medRaw && typeof medRaw === 'object' && medRaw._id
      ? medRaw._id
      : (cita.medicoId as mongoose.Types.ObjectId);

  const { inicioDia, finDia } = boundsFromCitaFecha(new Date(cita.fecha));

  const enEsperaRaw = await Cita.find({
    medicoId,
    fecha: { $gte: inicioDia, $lt: finDia },
    estado: 'en_espera'
  })
    .select('_id horaLlegada hora')
    .lean();

  const cola = ordenarColaEnEspera(enEsperaRaw as { _id: mongoose.Types.ObjectId; horaLlegada?: Date; hora: string }[]);

  const totalEnEspera = cola.length;
  const idx = cola.findIndex((c) => c._id.toString() === citaId);
  const estadoCita = cita.estado;

  if (estadoCita === 'en_consulta') {
    return {
      estadoCita,
      enCola: false,
      tuTurno: true,
      posicionEnCola: 0,
      totalEnEspera,
      medicoNombre,
      mensaje: 'Tu consulta está en curso con el médico.',
      demoraEstimadaMinutos: 0
    };
  }

  if (estadoCita === 'cancelada' || estadoCita === 'completada') {
    return {
      estadoCita,
      enCola: false,
      tuTurno: false,
      posicionEnCola: null,
      totalEnEspera,
      medicoNombre,
      mensaje:
        estadoCita === 'cancelada'
          ? 'Esta cita fue cancelada. No hay cola activa.'
          : 'Esta cita ya fue completada.',
      demoraEstimadaMinutos: null
    };
  }

  if (estadoCita !== 'en_espera') {
    return {
      estadoCita,
      enCola: false,
      tuTurno: false,
      posicionEnCola: null,
      totalEnEspera,
      medicoNombre,
      mensaje:
        'Aún no estás en la cola de sala de espera. Cuando recepción registre tu llegada (o se active tu turno virtual), verás tu posición aquí en tiempo real.',
      demoraEstimadaMinutos: null
    };
  }

  const posicionEnCola = idx >= 0 ? idx + 1 : 1;
  const delante = Math.max(0, posicionEnCola - 1);
  const demoraEstimadaMinutos = Math.min(120, Math.max(5, 8 + delante * 12));

  return {
    estadoCita,
    enCola: true,
    tuTurno: posicionEnCola <= 1,
    posicionEnCola,
    totalEnEspera,
    medicoNombre,
    mensaje:
      posicionEnCola <= 1
        ? '¡Estás primero en la fila! El médico te llamará en breve.'
        : null,
    demoraEstimadaMinutos
  };
}

export async function obtenerContenidoParaPaciente(pacienteId: string): Promise<{
  tips: ItemTipSala[];
  videos: ItemVideoSala[];
  tagsUsados: string[];
}> {
  const paciente = await Paciente.findById(pacienteId).select('zonasDolor').lean();
  const tags = zonasDolorATags((paciente as { zonasDolor?: string[] } | null)?.zonasDolor);
  const { tips, videos } = seleccionarContenidoSala(tags);
  return { tips, videos, tagsUsados: tags };
}
