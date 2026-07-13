import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../middleware/auth';
import Paciente from '../../../models/Paciente';
import Cita from '../../../models/Cita';
import HistoriaClinicaHeridas from '../../../models/HistoriaClinicaHeridas';
import { generarPropuestasHeridas } from '../../../services/ai/bedrockHeridas.service';

function calcularEdad(fechaNacimiento: Date | string): number {
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const mDiff = hoy.getMonth() - nac.getMonth();
  if (mDiff < 0 || (mDiff === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

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
      'nombre apellido tipoDocumento numeroDocumento fechaNacimiento sexoBiologico genero eps aseguradora telefono direccion contactoEmergencia acudiente'
    ).lean();
    if (!cita) { res.status(404).json({ success: false, message: 'Cita no encontrada' }); return; }

    const p: any = cita.pacienteId;
    const edad = p?.fechaNacimiento
      ? calcularEdad(p.fechaNacimiento)
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
          fechaNacimiento: p.fechaNacimiento ? new Date(p.fechaNacimiento).toISOString().slice(0, 10) : undefined,
          edad,
          sexo: sexoNorm,
          eps: p.eps || p.aseguradora || undefined,
          telefono: p.telefono || undefined,
          direccion: p.direccion || undefined,
          contactoEmergencia: contacto || undefined,
          responsable: p.acudiente?.nombre || undefined,
          parentesco: p.acudiente?.parentesco || undefined,
          telefonoResponsable: p.acudiente?.telefono || undefined
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
          ? calcularEdad(p.fechaNacimiento)
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

    // Precargar identificación del paciente para el $setOnInsert (solo en creación)
    let identificacionPaciente: Record<string, any> | null = null;
    {
      const p = await Paciente.findById(pacienteId).lean() as any;
      if (p) {
        const edad = p.fechaNacimiento
          ? calcularEdad(p.fechaNacimiento)
          : undefined;
        const sexo = p.sexoBiologico === 'masculino' ? 'M'
          : p.sexoBiologico === 'femenino' ? 'F'
          : p.sexoBiologico === 'intersexual' ? 'Intersexual'
          : undefined;
        const contacto = p.contactoEmergencia
          ? [p.contactoEmergencia.nombre, p.contactoEmergencia.relacion, p.contactoEmergencia.telefono].filter(Boolean).join(' · ')
          : undefined;
        identificacionPaciente = {
          nombresApellidos: `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || undefined,
          documento: p.numeroDocumento ? `${p.tipoDocumento ?? ''} ${p.numeroDocumento}`.trim() : undefined,
          fechaNacimiento: p.fechaNacimiento ? new Date(p.fechaNacimiento).toISOString().slice(0, 10) : undefined,
          edad,
          sexo,
          eps: p.eps || p.aseguradora || undefined,
          telefono: p.telefono || undefined,
          direccion: p.direccion || undefined,
          contactoEmergencia: contacto || undefined,
          responsable: p.acudiente?.nombre || undefined,
          parentesco: p.acudiente?.parentesco || undefined,
          telefonoResponsable: p.acudiente?.telefono || undefined
        };
      }
    }

    console.log('[heridasIa.autoAplicar] ▶ propuestas recibidas', propuestas.length);

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
    const booleanLeaves = new Set([
      'consentimiento','fotografiaInicial','fotografiaSeguimiento',
      'perdidaRecientePeso','actual','exfumador','indicado','cultivoSolicitado'
    ]);

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
      'riesgoCardiovascularAsociado',
      'limpieza','desbridamiento','remisiones','paraclinicosSolicitados',
      'educacionPaciente','indicacionesSeguimiento'
    ]);

    // Normaliza string: minúsculas + quita todo carácter que no sea a-z0-9 espacio
    const normalizeStr = (s: string): string =>
      String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

    const isTruthy = (raw: any): boolean => {
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'number') return raw !== 0;
      const n = normalizeStr(String(raw));
      return n === 'true' || n === '1' || n.startsWith('si') || n.startsWith('yes');
    };
    const isFalsy = (raw: any): boolean => {
      if (typeof raw === 'boolean') return !raw;
      if (typeof raw === 'number') return raw === 0;
      const n = normalizeStr(String(raw));
      return n === 'false' || n === '0' || n.startsWith('no');
    };

    const coerce = (path: string, raw: any): any => {
      const leaf = path.split('.').pop() || '';
      if (booleanLeaves.has(leaf)) {
        return isTruthy(raw);
      }
      if (numericLeaves.has(leaf)) {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
        return Number.isFinite(n) ? n : undefined;
      }
      if (arrayLeaves.has(leaf)) {
        if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean);
        return String(raw).split(/[;\n,]/).map(x => x.trim()).filter(Boolean);
      }
      if (typeof raw === 'boolean' || typeof raw === 'number') return raw;
      if (typeof raw === 'string') {
        if (isTruthy(raw)) return true;
        if (isFalsy(raw)) return false;
      }
      return String(raw).trim();
    };

    // Lista blanca de rutas raíz que sí guardamos (cualquier path debe arrancar con una).
    const ALLOWED_ROOTS = new Set([
      'motivoConsulta','enfermedadActual','educacionPaciente',
      'antecedentes','valoracionRiesgoCicatrizacion','examenFisico',
      'valoracionEspecializada','caracterizacionHerida','clasificaciones',
      'planManejo','seguimientoEvolutivo','escalasAplicadas','registroFotografico'
    ]);

    // Si la IA devuelve un objeto como contenido de una sección (e.g. registroFotografico: {consentimiento: "Sí"}),
    // lo expandimos en propuestas de hoja individuales para que coerce() reciba el path completo.
    const expandirPropuestas = (lista: any[]): Array<{seccion: string, contenido: any}> => {
      const resultado: Array<{seccion: string, contenido: any}> = [];
      for (const p of lista) {
        if (!p?.seccion || p.contenido == null) continue;
        if (p.contenido && typeof p.contenido === 'object' && !Array.isArray(p.contenido)) {
          const expandir = (prefijo: string, obj: any) => {
            for (const [k, v] of Object.entries(obj)) {
              const path = `${prefijo}.${k}`;
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                expandir(path, v);
              } else {
                resultado.push({ seccion: path, contenido: v });
              }
            }
          };
          expandir(p.seccion, p.contenido);
        } else {
          resultado.push(p);
        }
      }
      return resultado;
    };

    const propuestasExpandidas = expandirPropuestas(propuestas);
    console.log('[heridasIa.autoAplicar] propuestas tras expansión:', propuestasExpandidas.length, propuestasExpandidas.map((p: any) => p?.seccion));

    let aplicadas = 0;
    for (const p of propuestasExpandidas) {
      if (!p?.seccion || p.contenido == null) continue;
      const seccionOriginal = p.seccion;
      const seccion = normalizarSeccion(seccionOriginal);
      if (!seccion) continue;
      // Todos los campos de identificación son readonly solo si ya tienen valor en BD
      const IDENTIFICACION_READONLY_IF_FILLED = ['nombresApellidos','documento','contactoEmergencia','fechaNacimiento','edad','sexo','eps','telefono','direccion'];
      if (seccion === 'identificacion') continue;
      if (IDENTIFICACION_READONLY_IF_FILLED.some(f => seccion === `identificacion.${f}`)) {
        const campo = seccion.split('.')[1];
        const valorExistente = (hc as any)?.identificacion?.[campo];
        if (valorExistente !== undefined && valorExistente !== null && valorExistente !== '') continue;
      }
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

      // motivoConsulta y enfermedadActual → solo actualizar si la nueva versión es más larga
      // (más información = más completa). Si la propuesta es más corta, ignorar.
      if (seccion === 'motivoConsulta') {
        const prevLen = (next.motivoConsulta ?? '').length;
        const newVal = String(value);
        if (newVal.length >= prevLen) next.motivoConsulta = newVal;
        else console.log('[heridasIa] motivoConsulta: propuesta más corta ignorada');
      } else if (seccion === 'enfermedadActual') {
        const prevLen = (next.enfermedadActual ?? '').length;
        const newVal = String(value);
        if (newVal.length >= prevLen) next.enfermedadActual = newVal;
        else console.log('[heridasIa] enfermedadActual: propuesta más corta ignorada');
      } else if (seccion === 'educacionPaciente') {
        const arr: string[] = Array.isArray(value) ? value : [String(value)];
        next.educacionPaciente = Array.from(new Set([...(next.educacionPaciente || []), ...arr]));
      } else {
        let valorFinal = value;

        // farmacologicos → array de objetos {medicamento, dosis?, frecuencia?}
        if (seccion === 'antecedentes.farmacologicos') {
          const items: string[] = Array.isArray(value)
            ? value.map(String)
            : String(value).split(/[;\n]/).map((s: string) => s.trim()).filter(Boolean);
          valorFinal = items.map((item: string) => {
            const parts = item.split(/\s+/);
            return { medicamento: item, dosis: parts[1] ?? '', frecuencia: parts[2] ?? '' };
          });
        } else if (typeof value === 'string') {
          if (isTruthy(value)) valorFinal = true;
          else if (isFalsy(value)) valorFinal = false;
        }

        // Solo sobreescribir si el campo actual está vacío, null, o el nuevo valor es diferente
        const getPath = (obj: any, path: string): any => {
          return path.split('.').reduce((cur, k) => cur?.[k], obj);
        };
        const valorActual = getPath(next, seccion);
        const estaVacio = valorActual === undefined || valorActual === null || valorActual === '' ||
          (Array.isArray(valorActual) && valorActual.length === 0);
        if (estaVacio || JSON.stringify(valorActual) !== JSON.stringify(valorFinal)) {
          setPath(next, seccion, valorFinal);
        } else {
          console.log('[heridasIa.autoAplicar]   ⏭ sin cambio para', seccion);
          aplicadas--;
        }
      }
      console.log('[heridasIa.autoAplicar]   ✓', seccion, '=', JSON.stringify(value).slice(0, 80));
      aplicadas++;
    }
    console.log('[heridasIa.autoAplicar] propuestas aplicadas:', aplicadas, '/', propuestasExpandidas.length);

    delete next._id;
    delete next.createdAt;
    delete next.updatedAt;
    // Proteger campos de identificación que vienen del registro del paciente
    if (next.identificacion) {
      // Proteger solo los campos de identificación que YA tenían valor en BD (no borrar lo que la IA llenó)
      const readonlyFields = ['nombresApellidos','documento','contactoEmergencia','fechaNacimiento','edad','sexo','eps','telefono','direccion']
        .filter(f => {
          const v = (hc as any)?.identificacion?.[f];
          return v !== undefined && v !== null && v !== '';
        });
      for (const f of readonlyFields) delete next.identificacion[f];
      if (Object.keys(next.identificacion).length === 0) delete next.identificacion;
    }
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

    // Sanitizador de último recurso: recorre el objeto y convierte strings en campos
    // booleanos conocidos, sin importar cómo llegaron (el CastError de Mongoose no perdona).
    const sanitizeBooleans = (obj: any, path = ''): void => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      for (const key of Object.keys(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        const val = obj[key];
        if (booleanLeaves.has(key) && typeof val !== 'boolean') {
          console.log('[sanitizeBooleans] convirtiendo', fullPath, '=', val);
          obj[key] = isTruthy(val);
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          sanitizeBooleans(val, fullPath);
        }
      }
    };
    sanitizeBooleans(next);

    const setPayload = {
      ...next,
      pacienteId: new mongoose.Types.ObjectId(pacienteId),
      medicoId: new mongoose.Types.ObjectId(medicoId),
      citaId: new mongoose.Types.ObjectId(citaId),
      actualizadoPor: new mongoose.Types.ObjectId(medicoId)
    };
    console.log('[heridasIa.autoAplicar] $set claves:', Object.keys(setPayload));
    console.log('[heridasIa.autoAplicar] registroFotografico en payload:', JSON.stringify(setPayload.registroFotografico ?? null));

    // Merge identificacion: paciente como base, IA encima, nunca pisar con string corrupto
    const idActualEnBD = typeof hc.identificacion === 'object' && hc.identificacion !== null ? hc.identificacion : {};
    const idIa = typeof setPayload.identificacion === 'object' && setPayload.identificacion !== null ? setPayload.identificacion : {};
    setPayload.identificacion = {
      ...(identificacionPaciente ?? {}),
      ...idActualEnBD,
      ...idIa
    };

    const saved = await HistoriaClinicaHeridas.findOneAndUpdate(
      { citaId, medicoId },
      {
        $set: setPayload,
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

