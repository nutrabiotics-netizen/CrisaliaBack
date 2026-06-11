import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import Paciente from '../../../models/Paciente';
import Cita from '../../../models/Cita';
import HistoriaClinicaHeridas from '../../../models/HistoriaClinicaHeridas';
import { generarPropuestasHeridas } from '../../../services/ai/bedrockHeridas.service';

async function resolverPacienteIdDesdeCita(citaId: string, fallback?: string): Promise<string | null> {
  if (fallback && mongoose.isValidObjectId(fallback)) return fallback;
  const cita = await Cita.findById(citaId).select('pacienteId').lean();
  return cita?.pacienteId ? String(cita.pacienteId) : null;
}

/**
 * GET /medico/heridas-ia/cita/:citaId/info
 * Resuelve { citaId, pacienteId, pacienteNombre, medicoId, hcHeridasId? } a partir del citaId.
 * Lo usa la página IA Heridas para inicializar el hook de transcripción.
 */
export const infoCita = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const cita = await Cita.findById(citaId).populate(
      'pacienteId',
      'nombre apellido tipoDocumento numeroDocumento fechaNacimiento sexoBiologico genero eps aseguradora telefono direccion contactoEmergencia'
    ).lean();
    if (!cita) { res.status(404).json({ success: false, message: 'Cita no encontrada' }); return; }

    const p: any = cita.pacienteId;
    const edad = p?.fechaNacimiento
      ? Math.floor((Date.now() - new Date(p.fechaNacimiento).getTime()) / 31557600000)
      : undefined;
    const sexoNorm = p?.sexoBiologico === 'masculino' ? 'M'
      : p?.sexoBiologico === 'femenino' ? 'F'
      : p?.sexoBiologico === 'intersexual' ? 'Intersexual'
      : undefined;
    const contacto = p?.contactoEmergencia
      ? [p.contactoEmergencia.nombre, p.contactoEmergencia.relacion, p.contactoEmergencia.telefono]
          .filter(Boolean).join(' · ')
      : undefined;

    res.json({
      success: true,
      data: {
        citaId: String(cita._id),
        pacienteId: p?._id ? String(p._id) : null,
        pacienteNombre: p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() : null,
        medicoId: cita.medicoId ? String(cita.medicoId) : medicoId,
        // Datos para precargar la sección "1. Identificación" del HC Heridas
        identificacion: p ? {
          nombresApellidos: `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || undefined,
          documento: p.numeroDocumento ? `${p.tipoDocumento ?? ''} ${p.numeroDocumento}`.trim() : undefined,
          edad,
          sexo: sexoNorm,
          eps: p.eps || p.aseguradora || undefined,
          telefono: p.telefono || undefined,
          direccion: p.direccion || undefined,
          contactoEmergencia: contacto || undefined
        } : null
      }
    });
  } catch (error: any) {
    console.error('[heridasIa.infoCita]', error);
    res.status(500).json({ success: false, message: 'Error', error: error.message });
  }
};

/**
 * POST /medico/heridas-ia/cita/:citaId/propose
 * Body: { transcription, currentSections?, activeSection?, pacienteId }
 * Devuelve propuestas estructuradas para llenar el HC de heridas.
 *
 * Paralelo y aislado del WS y del agente general — usa Bedrock directo
 * para no afectar el flujo IA-guiada existente.
 */
export const proponer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const { transcription, currentSections, activeSection, pacienteId } = req.body || {};
    if (!transcription || typeof transcription !== 'string') {
      res.status(400).json({ success: false, message: 'transcription requerida' });
      return;
    }

    const pid = await resolverPacienteIdDesdeCita(citaId, pacienteId);
    let patientContext = '';
    let pacienteNombre: string | undefined;
    if (pid) {
      const p = await Paciente.findById(pid).lean();
      if (p) {
        const edad = p.fechaNacimiento
          ? Math.floor((Date.now() - new Date(p.fechaNacimiento).getTime()) / 31557600000)
          : 'N/A';
        patientContext = `Paciente: ${p.nombre} ${p.apellido}. Edad: ${edad}. Sexo: ${p.sexoBiologico || 'N/A'}. EPS: ${p.eps || 'N/A'}.`;
        pacienteNombre = `${p.nombre} ${p.apellido}`.trim();
      }
    }

    const result = await generarPropuestasHeridas({
      patientHistoryContext: patientContext,
      transcriptionSegment: transcription,
      currentSections,
      activeSection
    });

    res.json({ success: true, data: { ...result, pacienteId: pid, pacienteNombre } });
  } catch (error: any) {
    console.error('[heridasIa.proponer]', error);
    res.status(500).json({ success: false, message: 'Error al generar propuestas', error: error.message });
  }
};

/**
 * POST /medico/heridas-ia/cita/:citaId/auto-apply
 * Aplica propuestas directamente al HC Heridas (upsert).
 * Body: { pacienteId, propuestas: [{ seccion, contenido }] }
 *
 * El backend hace el mapeo seccion → campo del modelo (texto libre se concatena,
 * estructuras se mantienen) y retorna el HC actualizado.
 */
export const autoAplicar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const medicoId = req.userId;
    const citaId = req.params.citaId as string;
    if (!medicoId) { res.status(401).json({ success: false, message: 'No autenticado' }); return; }
    if (!mongoose.isValidObjectId(citaId)) { res.status(400).json({ success: false, message: 'citaId inválido' }); return; }

    const { pacienteId: pacienteIdBody, propuestas } = req.body || {};
    const pacienteId = await resolverPacienteIdDesdeCita(citaId, pacienteIdBody);
    if (!pacienteId) {
      res.status(400).json({ success: false, message: 'No se pudo resolver el pacienteId desde la cita' });
      return;
    }
    if (!Array.isArray(propuestas) || propuestas.length === 0) {
      res.status(400).json({ success: false, message: 'propuestas vacías' });
      return;
    }

    const hc: any = await HistoriaClinicaHeridas.findOne({ citaId, medicoId }).lean() || {};
    const next: any = { ...hc };

    console.log('[heridasIa.autoAplicar] ▶ propuestas recibidas', propuestas.length, propuestas.map((p: any) => p?.seccion));

    // Normaliza la clave (convierte snake_case → camelCase del modelo, y
    // tolera variaciones en el nombre de la sección raíz).
    const normalizarSeccion = (s: any): string => {
      const raw = String(s || '').trim();
      if (!raw) return '';
      // Aliases sin notación de puntos (legacy)
      const flatAliases: Record<string, string> = {
        motivo_consulta: 'motivoConsulta',
        motivo: 'motivoConsulta',
        motivoconsulta: 'motivoConsulta',
        enfermedad_actual: 'enfermedadActual',
        enfermedad: 'enfermedadActual',
        enfermedadactual: 'enfermedadActual',
        educacion_paciente: 'educacionPaciente',
        educacion: 'educacionPaciente',
        educacionpaciente: 'educacionPaciente'
      };
      const low = raw.toLowerCase().replace(/[-\s]+/g, '_');
      if (flatAliases[low]) return flatAliases[low];
      // Convierte cualquier snake_case en el path a camelCase
      // (mantiene los puntos)
      return raw
        .split('.')
        .map(part => part
          .replace(/[-\s]+/g, '_')
          .replace(/_+([a-zA-Z])/g, (_m, c) => c.toUpperCase()))
        .join('.');
    };

    // Helper: setea valor en objeto siguiendo una ruta "a.b.c"
    const setPath = (obj: any, path: string, value: any) => {
      const parts = path.split('.');
      let cur = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      cur[parts[parts.length - 1]] = value;
    };

    // Coerciones de tipo: si la IA devuelve "3.5" (string) y el campo es número, lo convertimos.
    const numericLeaves = new Set([
      'pesoKg','tallaCm','imc','paquetesAnio',
      'longitudCm','anchuraCm','profundidadCm','areaCm2','socavamientoCm',
      'granulacionPct','esfaceloPct','necrosisPct','epitelizacionPct',
      'curacion','reposo',
      'FC','FR','temperaturaC','SpO2pct','glicemiaCapilar',
      'ITBIzquierdo','ITBDerecho','ITB',
      'wagnerPieDiabetico','PUSHBasal','EVADolor','EVA','wagner',
      'numeroHeridas','incapacidadDias'
    ]);
    const arrayLeaves = new Set([
      'patologicos','quirurgicos','alergicos','familiares',
      'bordes','signos','pielPerilesional',
      'limpieza','desbridamiento','remisiones','paraclinicosSolicitados',
      'educacionPaciente','indicacionesSeguimiento'
    ]);

    const coerce = (path: string, raw: any): any => {
      const leaf = path.split('.').pop() || '';
      if (numericLeaves.has(leaf)) {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
        return Number.isFinite(n) ? n : undefined;
      }
      if (arrayLeaves.has(leaf)) {
        if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean);
        return String(raw).split(/[;\n,]/).map(x => x.trim()).filter(Boolean);
      }
      if (typeof raw === 'boolean' || typeof raw === 'number') return raw;
      return String(raw).trim();
    };

    // Lista blanca de rutas raíz que sí guardamos (cualquier path debe arrancar con una).
    const ALLOWED_ROOTS = new Set([
      'motivoConsulta','enfermedadActual','educacionPaciente',
      'antecedentes','valoracionRiesgoCicatrizacion','examenFisico',
      'valoracionEspecializada','caracterizacionHerida','clasificaciones',
      'planManejo','seguimientoEvolutivo','escalasAplicadas','registroFotografico'
    ]);

    let aplicadas = 0;
    for (const p of propuestas) {
      if (!p?.seccion || p.contenido == null) continue;
      const seccionOriginal = p.seccion;
      const seccion = normalizarSeccion(seccionOriginal);
      if (!seccion) continue;
      if (seccion === 'identificacion' || seccion.startsWith('identificacion.')) continue;
      const root = seccion.split('.')[0];
      if (!ALLOWED_ROOTS.has(root)) {
        console.warn('[heridasIa.autoAplicar]   ⚠ ruta no permitida:', seccionOriginal, '→', seccion);
        continue;
      }
      const value = coerce(seccion, p.contenido);
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        console.warn('[heridasIa.autoAplicar]   ⚠ valor vacío para', seccion);
        continue;
      }

      // Texto libre acumulativo (motivoConsulta / enfermedadActual) → mergeText
      if (seccion === 'motivoConsulta') {
        next.motivoConsulta = mergeText(next.motivoConsulta, String(value));
      } else if (seccion === 'enfermedadActual') {
        next.enfermedadActual = mergeText(next.enfermedadActual, String(value));
      } else if (seccion === 'educacionPaciente') {
        const arr: string[] = Array.isArray(value) ? value : [String(value)];
        next.educacionPaciente = Array.from(new Set([...(next.educacionPaciente || []), ...arr]));
      } else {
        // Cualquier otra ruta → setPath sobreescribiendo el campo final
        setPath(next, seccion, value);
      }
      console.log('[heridasIa.autoAplicar]   ✓', seccion, '=', JSON.stringify(value).slice(0, 80));
      aplicadas++;
    }
    console.log('[heridasIa.autoAplicar] propuestas aplicadas:', aplicadas, '/', propuestas.length);

    delete next._id;
    delete next.createdAt;
    delete next.updatedAt;
    // Identificación se gestiona desde el formulario manual (precarga del paciente).
    delete next.identificacion;
    // Campos que solo van en $setOnInsert — no pueden ir también en $set
    // (Mongo lanza "Updating the path X would create a conflict at X").
    delete next.activo;
    delete next.fechaRegistro;
    delete next.creadoPor;
    delete next.creadoPorRol;
    delete (next as any).__v;
    delete (next as any).pacienteId;
    delete (next as any).medicoId;
    delete (next as any).citaId;

    const setPayload = {
      ...next,
      pacienteId: new mongoose.Types.ObjectId(pacienteId),
      medicoId: new mongoose.Types.ObjectId(medicoId),
      citaId: new mongoose.Types.ObjectId(citaId),
      actualizadoPor: new mongoose.Types.ObjectId(medicoId)
    };
    console.log('[heridasIa.autoAplicar] $set claves:', Object.keys(setPayload));

    const saved = await HistoriaClinicaHeridas.findOneAndUpdate(
      { citaId, medicoId },
      {
        $set: setPayload,
        // Limpia notas de IA legacy en identificación (de versiones anteriores)
        $unset: { 'identificacion.aiNotes': '' },
        $setOnInsert: {
          fechaRegistro: new Date(),
          creadoPor: new mongoose.Types.ObjectId(medicoId),
          creadoPorRol: 'Medico',
          activo: true
        }
      },
      { new: true, upsert: true, strict: false }
    ).lean();

    console.log('[heridasIa.autoAplicar] ◀ saved campos clave:', {
      _id: (saved as any)?._id,
      motivoConsulta: (saved as any)?.motivoConsulta,
      enfermedadActual: (saved as any)?.enfermedadActual?.slice?.(0, 40),
      identificacion: (saved as any)?.identificacion?.nombresApellidos
    });

    res.json({ success: true, data: saved });
  } catch (error: any) {
    console.error('[heridasIa.autoAplicar]', error);
    res.status(500).json({ success: false, message: 'Error al auto-aplicar', error: error.message });
  }
};

function mergeText(prev: any, next: string): string {
  const p = (typeof prev === 'string' ? prev : '').trim();
  if (!p) return next;
  if (p.includes(next)) return p;
  return `${p}\n${next}`;
}
