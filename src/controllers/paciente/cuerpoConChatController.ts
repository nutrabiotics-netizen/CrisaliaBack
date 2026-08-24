import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import {
  responderCuerpoConChat,
  extraerRespuestasS01S03,
  responderInterrogatorioConClaude,
} from '../../services/ai/cuerpoConChatService';
import {
  cargarSecciones,
  cargarIndex,
  calcularScores,
  consultarSiguientePaso,
} from '../../services/ai/anamnesisOrchestratorService';
import Paciente from '../../models/Paciente';
import Interrogatorio from '../../models/Interrogatorio';
import { handleError } from '../../utils/errors';

// ─── POST /paciente/cuerpo-chat/precargar ─────────────────────────────────────
// Fire-and-forget — ya no hace nada con AgenteAcademico, solo responde OK.
// Se mantiene para no romper el frontend que lo llama al marcar zonas.
export const precargar = async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true });
};

// ─── POST /paciente/cuerpo-chat ───────────────────────────────────────────────

export const responder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'No autenticado' });
      return;
    }

    const { zonasDolorMarcadas = [], historial = [], mensajeUsuario } = req.body;

    console.log('[cuerpoConChat/responder] ▶ request', {
      pacienteId,
      zonas:         zonasDolorMarcadas,
      historialLen:  historial.length,
      mensajeUsuario: (mensajeUsuario || '').slice(0, 80),
    });

    if (!mensajeUsuario || typeof mensajeUsuario !== 'string' || !mensajeUsuario.trim()) {
      res.status(400).json({ success: false, message: 'mensajeUsuario requerido' });
      return;
    }

    const paciente = await Paciente.findById(pacienteId)
      .select('nombre apellido email telefono fechaNacimiento sexoBiologico genero ocupacion profesion escolaridad direccion')
      .lean() as any;

    // Calcular edad a partir de fechaNacimiento
    let edad: number | undefined;
    if (paciente?.fechaNacimiento) {
      const hoy = new Date();
      const nac = new Date(paciente.fechaNacimiento);
      edad = hoy.getFullYear() - nac.getFullYear();
      const cumpleEsteAno = hoy.getMonth() > nac.getMonth() ||
        (hoy.getMonth() === nac.getMonth() && hoy.getDate() >= nac.getDate());
      if (!cumpleEsteAno) edad--;
    }

    const datosExistentes = {
      nombre:        paciente?.nombre && paciente?.apellido
                       ? `${paciente.nombre} ${paciente.apellido}`
                       : paciente?.nombre,
      email:         paciente?.email,
      telefono:      paciente?.telefono,
      fechaNacimiento: paciente?.fechaNacimiento
                       ? new Date(paciente.fechaNacimiento).toISOString().slice(0, 10)
                       : undefined,
      edad,
      sexoBiologico: paciente?.sexoBiologico || paciente?.genero,
      ocupacion:     paciente?.profesion || paciente?.ocupacion,
      escolaridad:   paciente?.escolaridad,
      direccion:     paciente?.direccion,
    };

    console.log('[cuerpoConChat/responder] datosExistentes del Paciente:', {
      nombre:        !!datosExistentes.nombre,
      email:         !!datosExistentes.email,
      edad:          datosExistentes.edad,
      sexoBiologico: datosExistentes.sexoBiologico,
      ocupacion:     !!datosExistentes.ocupacion,
    });

    const respuesta = await responderCuerpoConChat({
      zonasDolorMarcadas,
      historial,
      mensajeUsuario: mensajeUsuario.trim(),
      nombrePaciente: paciente?.nombre,
      datosExistentes,
    });

    // ── Extraer causas del bloque [[CAUSAS]]..[[/CAUSAS]] ────────────────────
    let causas: { titulo: string; desc: string }[] = [];
    const causasMatch = respuesta.match(/\[\[CAUSAS\]\]([\s\S]*?)\[\[\/CAUSAS\]\]/);
    if (causasMatch) {
      try { causas = JSON.parse(causasMatch[1].trim()); } catch { /* ignorar */ }
    }

    // ── Detectar fin de fase inicial ─────────────────────────────────────────
    const finConversacion = respuesta.includes('[[FIN_CONVERSACION]]');

    // ── Extraer respuestas estructuradas s01/s03 ─────────────────────────────
    const respuestasS01S03 = extraerRespuestasS01S03(respuesta);

    // ── Limpiar marcadores técnicos ───────────────────────────────────────────
    // [[RESPUESTAS_S01_S03]] siempre viene después del JSON; si Claude omite el
    // tag de cierre el regex no matchea y los } del contenido técnico rompen
    // lastIndexOf('}') → eliminamos desde la apertura hasta el fin del string
    // (o hasta el tag de cierre si existe) para que el JSON quede limpio.
    const respuestaSinMarcadores = respuesta
      .replace(/\[\[CAUSAS\]\][\s\S]*?(?:\[\[\/CAUSAS\]\]|$)/g, '')
      .replace(/\[\[RESPUESTAS_S01_S03\]\][\s\S]*?(?:\[\[\/RESPUESTAS_S01_S03\]\]|$)/g, '')
      .replace(/\[\[FIN_CONVERSACION\]\]/g, '')
      .trim();

    // ── Limpiar fences de markdown ────────────────────────────────────────────
    // Si hay un bloque ```json ... ``` embebido, extraer su contenido
    // y guardar el texto previo como preámbulo
    let preambulo = '';
    let respuestaClean = respuestaSinMarcadores;

    const fenceMatch = respuestaSinMarcadores.match(/^([\s\S]*?)```(?:json)?\s*([\s\S]*?)```/m);
    if (fenceMatch) {
      preambulo = fenceMatch[1].trim();
      respuestaClean = fenceMatch[2].trim();
    } else {
      // Sin fence embebido: limpiar solo fences al inicio/final
      respuestaClean = respuestaSinMarcadores
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/```\s*$/m, '')
        .trim();
    }

    // ── Parsear JSON { texto, opciones, tipoOpciones, respuestaLibre } ──────────
    // Claude devuelve markdown libre ANTES del JSON de cierre.
    // Estrategia: encontrar el último {"texto" y parsear desde ahí hasta el último }
    let textoFinal = respuestaClean;
    let opciones: string[] = [];
    let tipoOpciones: 'single' | 'checkbox' | 'tabla_dinamica' = 'single';
    let columnasFase1: string[] = [];
    let resumenItems: string[] = [];
    let enfoqueAbordaje = '';

    // Buscar última ocurrencia de { seguido de "texto" (con o sin espacios/saltos)
    const jsonStartMatches = [...respuestaClean.matchAll(/\{\s*"texto"/g)];
    const jsonStart = jsonStartMatches.length > 0 ? jsonStartMatches[jsonStartMatches.length - 1].index! : -1;
    if (jsonStart >= 0) {
      const jsonEnd = respuestaClean.lastIndexOf('}');
      if (jsonEnd > jsonStart) {
        try {
          const parsed = JSON.parse(respuestaClean.slice(jsonStart, jsonEnd + 1));
          if (parsed?.texto) {
            opciones        = Array.isArray(parsed.opciones) ? parsed.opciones : [];
            resumenItems    = Array.isArray(parsed.resumen) ? parsed.resumen : [];
            enfoqueAbordaje = typeof parsed.enfoque === 'string' ? parsed.enfoque.trim() : '';
            if (parsed.tipoOpciones === 'tabla_dinamica' && Array.isArray(parsed.columnas)) {
              tipoOpciones   = 'tabla_dinamica';
              columnasFase1  = parsed.columnas;
            } else {
              tipoOpciones = parsed.tipoOpciones === 'checkbox' ? 'checkbox' : 'single';
            }
            // Descartar preJson cuando hay card propia para evitar pregunta duplicada
            const preJson = [preambulo, respuestaClean.slice(0, jsonStart).trim()].filter(Boolean).join('\n\n');
            const esCard = opciones.length > 0 || resumenItems.length > 0 || tipoOpciones === 'tabla' || tipoOpciones === 'tabla_dinamica';
            if (esCard) {
              // El card muestra parsed.texto como encabezado — no mezclar con el preámbulo
              textoFinal = parsed.texto;
            } else {
              textoFinal = [preJson, parsed.texto].filter(Boolean).join('\n\n');
            }
          }
        } catch {
          const preJson = respuestaClean.slice(0, jsonStart).trim();
          if (preJson) {
            textoFinal = preJson;
          } else {
            // Fallback: extraer "texto" por regex si JSON.parse falló
            const m = respuestaClean.match(/"texto"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (m) textoFinal = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            // Si aún parece JSON, devolver string vacío en lugar del JSON crudo
            else if (textoFinal.trimStart().startsWith('{')) textoFinal = '';
          }
        }
      }
    }

    // Guarda final: si textoFinal sigue pareciendo JSON crudo, extrae "texto" o vacía
    if (/^\s*\{\s*"texto"/.test(textoFinal)) {
      const mFinal = textoFinal.match(/"texto"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      textoFinal = mFinal ? mFinal[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
    }

    console.log('[cuerpoConChat/responder] ◀ procesado', {
      textoFinalLen:   textoFinal.length,
      opcionesCount:   opciones.length,
      finConversacion,
      causasCount:     causas.length,
      respuestasS01S03Keys: Object.keys(respuestasS01S03),
    });

    // ── Si termina la fase inicial ────────────────────────────────────────────
    let interrogatorioId: string | null = null;
    let siguienteRonda: any = null;

    if (finConversacion) {
      try {
        // 1. Actualizar zonas de dolor del paciente
        if (zonasDolorMarcadas?.length) {
          await Paciente.findByIdAndUpdate(pacienteId, {
            $set: { zonasDolor: zonasDolorMarcadas }
          });
        }

        // 2. Mapear respuestas s01/s03 + zonas + datos existentes del Paciente
        const datosDelModelo: Record<string, any> = {};
        if (datosExistentes.nombre)        datosDelModelo['s01_nombre']          = datosExistentes.nombre;
        if (datosExistentes.email)         datosDelModelo['s01_email']           = datosExistentes.email;
        if (datosExistentes.telefono)      datosDelModelo['s01_celular']         = datosExistentes.telefono;
        if (datosExistentes.fechaNacimiento) datosDelModelo['s01_nacimiento']    = datosExistentes.fechaNacimiento;
        if (datosExistentes.edad)          datosDelModelo['s01_edad']            = String(datosExistentes.edad);
        if (datosExistentes.sexoBiologico) datosDelModelo['s01_sexo']            = datosExistentes.sexoBiologico;
        if (datosExistentes.ocupacion)     datosDelModelo['s01_ocupacion']       = datosExistentes.ocupacion;
        if (datosExistentes.direccion)     datosDelModelo['s01_direccion']       = datosExistentes.direccion;

        const respuestasInterrogatorio: Record<string, any> = {
          ...datosDelModelo,   // datos del modelo Paciente
          ...respuestasS01S03, // respuestas que Claude extrajo del chat (pueden completar o sobreescribir)
          zonasDolor:    zonasDolorMarcadas,
          historialChat: historial,
          mensajeFinal:  mensajeUsuario,
          causas,
        };

        // 3. Crear o reutilizar Interrogatorio en_proceso
        const interrogatorioExistente = await Interrogatorio.findOne({
          pacienteId,
          tipo:   'primera_vez',
          estado: { $in: ['pendiente', 'en_proceso'] },
        });

        let interrogatorio;
        if (interrogatorioExistente) {
          interrogatorioExistente.respuestas = {
            ...interrogatorioExistente.respuestas,
            ...respuestasInterrogatorio,
          };
          interrogatorioExistente.markModified('respuestas');
          interrogatorioExistente.estado   = 'en_proceso';
          interrogatorioExistente.progreso = 10; // s01 + s03 completadas
          await interrogatorioExistente.save();
          interrogatorio = interrogatorioExistente;
        } else {
          interrogatorio = await Interrogatorio.create({
            pacienteId,
            tipo:           'primera_vez',
            estado:         'en_proceso',
            progreso:       10,
            respuestas:     respuestasInterrogatorio,
            creadoPorRol:   'Paciente',
          });
        }

        interrogatorioId = interrogatorio._id.toString();

        console.info('[cuerpoConChat] Fase s01+s03 completada para paciente', pacienteId,
          '— interrogatorioId:', interrogatorioId);

      } catch (e) {
        console.warn('[cuerpoConChat] Error en fin de fase inicial (no crítico):', e);
        // No bloquear la respuesta si el orquestador falla
      }
    }

    const responsePayload = {
      success: true,
      data: {
        respuesta:        textoFinal,
        opciones,
        tipoOpciones,
        columnas:         columnasFase1,
        resumenItems,
        enfoqueAbordaje,
        finConversacion,
        ...(finConversacion && {
          finFaseInicial:   true,
          interrogatorioId,
          siguienteRonda,
        }),
      },
    };

    console.log('[cuerpoConChat/responder] → response', {
      finConversacion,
      interrogatorioId,
      siguienteRondaAccion: siguienteRonda?.decision?.accion ?? null,
      siguienteRondaSecciones: siguienteRonda?.decision?.secciones ?? null,
    });

    res.json(responsePayload);
  } catch (err: any) {
    console.error('[cuerpoConChat]', err);
    handleError(err, res);
  }
};

// ─── POST /paciente/cuerpo-chat/interrogatorio ────────────────────────────────
// Fase 2 — conversacional. Dos modos según si viene mensajeUsuario:
//
// MODO A (sin mensajeUsuario): consulta al Agent, carga secciones guía, responde
//   con { accion, seccionesActivas, respuesta (primer mensaje Claude), progreso }
//
// MODO B (con mensajeUsuario + historial + seccionesActivas): Claude conduce la
//   conversación usando las secciones como guía. Responde igual que fase 1.
//   Cuando Claude emite [[FIN_RONDA]] vuelve al Modo A para la siguiente ronda.

export const responderInterrogatorio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pacienteId = req.userId;
    if (!pacienteId) {
      res.status(401).json({ success: false, message: 'No autenticado' });
      return;
    }

    const {
      interrogatorioId,
      mensajeUsuario,
      historial = [],
      seccionesActivas = {},
      idsPreguntaActivos = [],
      sintomaInicial = '',
    } = req.body;

    if (!interrogatorioId || typeof interrogatorioId !== 'string') {
      res.status(400).json({ success: false, message: 'interrogatorioId requerido' });
      return;
    }

    const interrogatorio = await Interrogatorio.findOne({ _id: interrogatorioId, pacienteId });
    if (!interrogatorio) {
      res.status(404).json({ success: false, message: 'Interrogatorio no encontrado' });
      return;
    }

    const respuestas = interrogatorio.respuestas || {};

    // ── Construir resumen de respuestas ────────────────────────────────────────
    const CAMPOS_EXCLUIDOS = new Set(['historialChat', 'mensajeFinal', 'causas', 'zonasDolor']);
    const ESCALA_LABELS: Record<number, string> = { 0: 'nunca', 1: 'leve', 2: 'moderado', 3: 'intenso' };
    const resumenRespuestas = Object.entries(respuestas)
      .filter(([k, v]) => {
        if (CAMPOS_EXCLUIDOS.has(k)) return false;
        if (v === null || v === undefined || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      })
      .map(([k, v]) => {
        const valorStr = typeof v === 'number'
          ? `${v} (${ESCALA_LABELS[v] ?? v})`
          : Array.isArray(v) ? v.join(', ')
          : String(v);
        return `${k}: ${valorStr}`;
      })
      .join('\n') || 'sin respuestas previas';

    // ── MODO B: el paciente envió un mensaje → Claude responde ────────────────
    // También entra en Modo B si hay mensaje aunque seccionesActivas esté vacío
    // (contexto de edición/aclaración post-análisis)
    if (mensajeUsuario) {
      // Reconstruir preguntasFiltradas desde seccionesActivas + idsPreguntaActivos
      const idsActivos: string[] = Array.isArray(idsPreguntaActivos) ? idsPreguntaActivos : [];
      const preguntasFiltradasModoB: any[] = [];
      for (const seccionData of Object.values(seccionesActivas)) {
        const questions = (seccionData as any)?.questions ?? [];
        for (const q of questions) {
          if (q.type === 'symptom_table' && Array.isArray(q.items)) {
            const itemsFiltrados = idsActivos.length === 0
              ? q.items
              : q.items.filter((it: any) => idsActivos.includes(it.id));
            if (idsActivos.length === 0 || idsActivos.includes(q.id) || itemsFiltrados.length > 0) {
              preguntasFiltradasModoB.push({ ...q, items: itemsFiltrados.length > 0 ? itemsFiltrados : q.items });
            }
          } else {
            if (idsActivos.length === 0 || idsActivos.includes(q.id)) {
              preguntasFiltradasModoB.push(q);
            }
          }
        }
      }

      // Si no hay preguntas (contexto de edición/aclaración), usar pregunta libre
      const preguntasParaClaude = preguntasFiltradasModoB.length > 0
        ? preguntasFiltradasModoB
        : [{ id: 'edicion_libre', text: 'Recoge la corrección o aclaración del paciente, actualiza internamente los campos correspondientes, confirma lo recibido brevemente y emite [[FIN_RONDA]].', type: 'text' }];

      const rawClaude = await responderInterrogatorioConClaude({
        historial,
        mensajeUsuario: mensajeUsuario.trim(),
        sintomaInicial: sintomaInicial || respuestas['s03_sintoma_principal'] || 'consulta general',
        preguntasFiltradas: preguntasParaClaude,
        resumenRespuestas,
        nombrePaciente: respuestas['s01_nombre'] || undefined,
      });

      // Extraer [[RESPUESTAS_RONDA]] si las hay y persistir
      const respuestasRondaMatch = rawClaude.match(/\[\[RESPUESTAS_RONDA\]\]([\s\S]*?)\[\[\/RESPUESTAS_RONDA\]\]/);
      if (respuestasRondaMatch) {
        try {
          const respuestasRonda = JSON.parse(respuestasRondaMatch[1].trim());
          interrogatorio.respuestas = { ...respuestas, ...respuestasRonda };
          interrogatorio.markModified('respuestas');
          await interrogatorio.save();
        } catch { /* ignorar si falla el parse */ }
      }

      const finRonda = rawClaude.includes('[[FIN_RONDA]]');

      console.log('[responderInterrogatorio] Modo B — rawClaude preview:', rawClaude.slice(0, 300));
      console.log('[responderInterrogatorio] Modo B — historialLen:', historial.length);

      // Encontrar el JSON ANTES de los bloques técnicos
      // Los bloques [[RESPUESTAS_RONDA]] y [[FIN_RONDA]] van después del JSON
      const markerPos = rawClaude.indexOf('[[RESPUESTAS_RONDA]]') >= 0
        ? rawClaude.indexOf('[[RESPUESTAS_RONDA]]')
        : rawClaude.indexOf('[[FIN_RONDA]]') >= 0
          ? rawClaude.indexOf('[[FIN_RONDA]]')
          : rawClaude.length;

      const rawSoloJson = rawClaude.slice(0, markerPos).trim();

      // Limpiar por si queda algo después (defensivo)
      const rawLimpio = rawSoloJson
        .replace(/\[\[RESPUESTAS_RONDA\]\][\s\S]*?\[\[\/RESPUESTAS_RONDA\]\]/g, '')
        .replace('[[FIN_RONDA]]', '')
        .trim();

      const jsonStart = rawLimpio.lastIndexOf('{"texto"');
      const jsonEnd   = rawLimpio.lastIndexOf('}');
      let textoFinal  = rawLimpio;
      let opciones: string[] = [];
      let tipoOpciones: 'single' | 'checkbox' | 'tabla' | 'tabla_dinamica' = 'single';
      let tablaItems: { id: string; label: string }[] = [];
      let columnas: string[] = [];

      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const parsed = JSON.parse(rawLimpio.slice(jsonStart, jsonEnd + 1));
          if (parsed?.texto) {
            textoFinal  = parsed.texto;
            opciones    = Array.isArray(parsed.opciones) ? parsed.opciones : [];
            if (parsed.tipoOpciones === 'tabla_dinamica' && Array.isArray(parsed.columnas)) {
              tipoOpciones = 'tabla_dinamica';
              columnas     = parsed.columnas;
            } else if (parsed.tipoOpciones === 'tabla' && Array.isArray(parsed.tabla)) {
              tipoOpciones = 'tabla';
              tablaItems   = parsed.tabla;
            } else {
              tipoOpciones = parsed.tipoOpciones === 'checkbox' ? 'checkbox' : 'single';
            }
          }
        } catch { /* usar texto completo */ }
      }

      console.log('[responderInterrogatorio] Modo B — textoFinal:', textoFinal.slice(0, 200));
      console.log('[responderInterrogatorio] Modo B — tipoOpciones:', tipoOpciones, '| tablaItems:', tablaItems.length, '| opciones:', opciones);

      // Guardar historial con texto limpio (no JSON crudo) para que Claude no lo reproduzca
      const historialExistente: any[] = respuestas.historialChat ?? [];
      interrogatorio.respuestas = {
        ...interrogatorio.respuestas,
        historialChat: [
          ...historialExistente,
          { rol: 'usuario', texto: mensajeUsuario.trim() },
          { rol: 'ia', texto: textoFinal },
        ],
      };
      interrogatorio.markModified('respuestas');
      await interrogatorio.save();

      res.json({
        success: true,
        data: {
          respuesta: textoFinal,
          opciones:    finRonda ? [] : opciones,
          tipoOpciones: finRonda ? 'single' : tipoOpciones,
          tablaItems:  finRonda ? [] : tablaItems,
          columnas:    finRonda ? [] : columnas,
          finRonda,
          progreso: interrogatorio.progreso,
        },
      });
      return;
    }

    // ── MODO A: sin mensaje → consultar Agent y arrancar nueva ronda ──────────
    const index  = cargarIndex();
    const scores = calcularScores(respuestas, index.sections);
    const seccionesCompletadas = Array.from(
      new Set(
        Object.keys(respuestas)
          .map(k => k.match(/^(s\d{2})/)?.[1])
          .filter(Boolean) as string[]
      )
    ).sort();

    const medicacionActual = respuestas['s06_detalle']
      ? JSON.stringify(respuestas['s06_detalle']) : undefined;

    const decision = await consultarSiguientePaso(
      {
        sintomaInicial: sintomaInicial || respuestas['s03_sintoma_principal'] || 'consulta general',
        seccionesCompletadas,
        scores,
        medicacionActual,
        resumenRespuestas,
      },
      { sessionId: `interrogatorio-${interrogatorioId}` }
    );

    // Calcular progreso
    const progresoAgent = typeof (decision as any).progreso === 'number' && !isNaN((decision as any).progreso)
      ? Math.min(100, Math.max(0, (decision as any).progreso)) : null;
    const totalSecciones = index.sections.filter((s: any) => !s.for_ai_only).length;
    const progresoCalculado = totalSecciones > 0
      ? Math.min(95, Math.round((seccionesCompletadas.length / totalSecciones) * 100))
      : Math.min(95, seccionesCompletadas.length * 5);
    const progresoFinal = progresoAgent ?? progresoCalculado;
    interrogatorio.progreso = Math.max(interrogatorio.progreso ?? 0, progresoFinal);
    await interrogatorio.save();

    if (decision.accion !== 'entrevistar') {
      // generar_s37 o alerta_medica
      res.json({
        success: true,
        data: { decision, seccionesActivas: {}, progreso: interrogatorio.progreso },
      });
      return;
    }

    // Cargar secciones y extraer SOLO las preguntas indicadas por id_pregunta
    const seccionesGuia = cargarSecciones((decision as any).secciones);
    const idsPregunta: string[] = Array.isArray((decision as any).id_pregunta) ? (decision as any).id_pregunta : [];

    console.log('[responderInterrogatorio] Modo A — secciones:', (decision as any).secciones, '| id_pregunta:', idsPregunta);

    // Extraer las preguntas específicas del JSON de secciones por sus IDs
    const preguntasFiltradas: any[] = [];
    for (const seccionData of Object.values(seccionesGuia)) {
      const questions = (seccionData as any)?.questions ?? [];
      for (const q of questions) {
        if (q.type === 'symptom_table' && Array.isArray(q.items)) {
          // Para tablas: incluir si algún item.id está en idsPregunta, o si el id de la tabla está
          const itemsFiltrados = idsPregunta.length === 0
            ? q.items
            : q.items.filter((it: any) => idsPregunta.includes(it.id));
          if (idsPregunta.length === 0 || idsPregunta.includes(q.id) || itemsFiltrados.length > 0) {
            preguntasFiltradas.push({ ...q, items: itemsFiltrados.length > 0 ? itemsFiltrados : q.items });
          }
        } else {
          if (idsPregunta.length === 0 || idsPregunta.includes(q.id)) {
            preguntasFiltradas.push(q);
          }
        }
      }
    }

    console.log('[responderInterrogatorio] Modo A — preguntasFiltradas:', preguntasFiltradas.map(q => q.id));

    // Historial previo — últimos 20 turnos para no exceder tokens
    const todosLosTurnos: { rol: 'ia' | 'usuario'; texto: string }[] = (respuestas.historialChat ?? [])
      .filter((m: any) => m.texto?.trim() && (m.rol === 'ia' || m.rol === 'usuario'))
      .map((m: any) => ({ rol: m.rol as 'ia' | 'usuario', texto: m.texto }));
    const historialPrevio = todosLosTurnos.slice(-20);

    const instruccionNuevaRonda = historialPrevio.length > 0
      ? `Continúa el interrogatorio con las siguientes preguntas. Empieza con la primera que no hayas hecho todavía.`
      : `Inicia el interrogatorio con las siguientes preguntas.`;

    const primerMensaje = await responderInterrogatorioConClaude({
      historial: historialPrevio,
      mensajeUsuario: instruccionNuevaRonda,
      sintomaInicial: sintomaInicial || respuestas['s03_sintoma_principal'] || 'consulta general',
      preguntasFiltradas,
      resumenRespuestas,
      nombrePaciente: respuestas['s01_nombre'] || undefined,
    });

    // Extraer solo la parte antes de los bloques técnicos
    const markerPosA = primerMensaje.indexOf('[[RESPUESTAS_RONDA]]') >= 0
      ? primerMensaje.indexOf('[[RESPUESTAS_RONDA]]')
      : primerMensaje.indexOf('[[FIN_RONDA]]') >= 0
        ? primerMensaje.indexOf('[[FIN_RONDA]]')
        : primerMensaje.length;

    const primerMensajeLimpio = primerMensaje.slice(0, markerPosA).trim();

    // Parsear primer mensaje — mismo parser que el Modo B
    const jStart = primerMensajeLimpio.lastIndexOf('{"texto"');
    const jEnd   = primerMensajeLimpio.lastIndexOf('}');
    let textoPrimer  = primerMensajeLimpio;
    let opcionesPrimer: string[] = [];
    let tipoOpcPrimer: 'single' | 'checkbox' | 'tabla' | 'tabla_dinamica' = 'single';
    let tablaItemsPrimer: { id: string; label: string }[] = [];
    let columnasPrimer: string[] = [];

    // Guardar respuestas del primer mensaje si Claude ya las incluyó
    const respuestasRondaMatchA = primerMensaje.match(/\[\[RESPUESTAS_RONDA\]\]([\s\S]*?)\[\[\/RESPUESTAS_RONDA\]\]/);
    if (respuestasRondaMatchA) {
      try {
        const respuestasRonda = JSON.parse(respuestasRondaMatchA[1].trim());
        interrogatorio.respuestas = { ...interrogatorio.respuestas, ...respuestasRonda };
        interrogatorio.markModified('respuestas');
        await interrogatorio.save();
      } catch { /* ignorar */ }
    }

    if (jStart >= 0 && jEnd > jStart) {
      try {
        const p = JSON.parse(primerMensajeLimpio.slice(jStart, jEnd + 1));
        if (p?.texto) {
          textoPrimer   = p.texto;
          opcionesPrimer = Array.isArray(p.opciones) ? p.opciones : [];
          if (p.tipoOpciones === 'tabla_dinamica' && Array.isArray(p.columnas)) {
            tipoOpcPrimer    = 'tabla_dinamica';
            columnasPrimer   = p.columnas;
          } else if (p.tipoOpciones === 'tabla' && Array.isArray(p.tabla)) {
            tipoOpcPrimer    = 'tabla';
            tablaItemsPrimer = p.tabla;
          } else {
            tipoOpcPrimer = p.tipoOpciones === 'checkbox' ? 'checkbox' : 'single';
          }
        }
      } catch { /* usar texto completo */ }
    }

    console.log('[responderInterrogatorio] Modo A — respuesta', {
      textoPrimerLen: textoPrimer?.length,
      opcionesPrimer,
      tipoOpcPrimer,
      primerMensajeRaw: primerMensaje.slice(0, 400),
    });

    res.json({
      success: true,
      data: {
        decision,
        seccionesActivas: seccionesGuia,
        idsPreguntaActivos: idsPregunta,
        respuesta:   textoPrimer,
        opciones:    opcionesPrimer,
        tipoOpciones: tipoOpcPrimer,
        tablaItems:  tablaItemsPrimer,
        columnas:    columnasPrimer,
        finRonda:    false,
        progreso: interrogatorio.progreso,
      },
    });
  } catch (err: any) {
    console.error('[responderInterrogatorio]', err);
    handleError(err, res);
  }
};