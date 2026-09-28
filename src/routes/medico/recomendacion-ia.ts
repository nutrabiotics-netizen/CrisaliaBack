import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { UserRole } from '../../types';
import { recomendarMedicamentosConsulta } from '../../services/ai/crisaliaAgentService';
import { invokeBedrockText } from '../../services/ai/bedrockTextService';
import Interrogatorio from '../../models/Interrogatorio';
import Paciente from '../../models/Paciente';
import Cups2026 from '../../models/Cups2026';

const MEDS_FALLBACK_SYSTEM = `Eres un asistente clínico de apoyo al médico. Basándote en el cuadro clínico, recomienda: medicamentos, suplementos/nutracéuticos, hábitos/alimentación y laboratorios/estudios. Devuelve SOLO JSON válido: {"medicamentos":[{"nombre":"...","dosis":"...","frecuencia":"...","indicacion":"...","componentes":"..."}],"suplementos":[{"nombre":"...","dosis":"...","frecuencia":"...","indicacion":"...","beneficio":"...","componentes":"..."}],"habitos":[{"categoria":"alimentacion|ejercicio|sueño|estres|otro","recomendacion":"...","razon":"..."}],"laboratorios":[{"nombre":"...","codigoCups":"código CUPS Colombia si lo conoces","tipo":"laboratorio|imagenologia|otro","indicacion":"...","prioridad":"urgente|rutina"}]}. Si no hay nada en alguna categoría devuelve array vacío.`;

const router = Router();

router.post(
  '/recomendar-medicamentos',
  authenticate,
  authorize(UserRole.MEDICO),
  async (req: AuthRequest, res: Response) => {
    try {
      const { pacienteId, transcripcion } = req.body as {
        citaId?: string;
        pacienteId?: string;
        transcripcion?: string;
      };

      // Construir contexto desde Interrogatorio del paciente
      let inputAgent: Parameters<typeof recomendarMedicamentosConsulta>[0] = {
        transcripcion: transcripcion?.trim(),
      };

      if (pacienteId) {
        const [paciente, interrogatorio] = await Promise.all([
          Paciente.findById(pacienteId).lean(),
          Interrogatorio.findOne({ pacienteId }).sort({ updatedAt: -1 }).lean(),
        ]);

        if (paciente) {
          const p = paciente as any;
          inputAgent.pacienteNombre = `${p.nombre} ${p.apellido}`.trim();
          inputAgent.sexo = p.sexoBiologico;
          if (p.fechaNacimiento) {
            inputAgent.edad = Math.floor((Date.now() - new Date(p.fechaNacimiento).getTime()) / 31557600000);
          }
        }

        if (interrogatorio) {
          const i = interrogatorio as any;
          const hc = i.historiaClinica;
          if (hc?.motivoConsulta?.motivoPrincipal) inputAgent.motivoConsulta = hc.motivoConsulta.motivoPrincipal;
          if (hc?.enfermedadActual) {
            const ea = hc.enfermedadActual;
            inputAgent.enfermedadActual = [ea.evolucion, ea.sintomasAsociados, ea.estadoActual].filter(Boolean).join('. ');
            inputAgent.medicamentosActuales = ea.medicamentosUtilizados;
          }
          if (hc?.antecedentes) {
            const ant = hc.antecedentes;
            inputAgent.antecedentes = [ant.patologicos, ant.farmacologicos].filter(Boolean).join('. ');
            inputAgent.alergias = ant.alergicos;
          }
          const analisis = i.analisisFisiologicoIA;
          if (Array.isArray(analisis) && analisis.length) {
            inputAgent.sistemasComprometidos = analisis
              .filter((a: any) => a.nivel === 'critico' || a.nivel === 'moderado')
              .map((a: any) => `${a.sistema || a.nombre} (${a.nivel})`)
              .join(', ');
          }
        }
      }

      if (!inputAgent.transcripcion && !inputAgent.motivoConsulta) {
        return res.json({ medicamentos: [], suplementos: [], habitos: [], laboratorios: [] });
      }

      let result: { medicamentos: any[]; suplementos: any[]; habitos: any[]; laboratorios: any[] };
      try {
        result = await recomendarMedicamentosConsulta({ ...inputAgent, timeoutMs: 600000 });
      } catch (agentErr: any) {
        console.warn('[RecomendacionIA] Agent falló, usando Claude directo como fallback:', agentErr.message);
        const partes = [
          inputAgent.pacienteNombre && `Paciente: ${inputAgent.pacienteNombre}${inputAgent.edad ? `, ${inputAgent.edad} años` : ''}`,
          inputAgent.motivoConsulta && `Motivo: ${inputAgent.motivoConsulta}`,
          inputAgent.enfermedadActual && `Enfermedad actual: ${inputAgent.enfermedadActual}`,
          inputAgent.medicamentosActuales && `Medicamentos actuales: ${inputAgent.medicamentosActuales}`,
          inputAgent.alergias && `Alergias: ${inputAgent.alergias}`,
          inputAgent.sistemasComprometidos && `Sistemas comprometidos: ${inputAgent.sistemasComprometidos}`,
        ].filter(Boolean).join('\n');
        const raw = await invokeBedrockText(
          `${partes || '(sin datos de preconsulta)'}\n\n${inputAgent.transcripcion ? `Transcripción:\n${inputAgent.transcripcion}` : ''}`,
          { system: MEDS_FALLBACK_SYSTEM, maxTokens: 1500, temperature: 0.1 }
        );
        try {
          const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
          const parsed = start !== -1 && end > start ? JSON.parse(raw.slice(start, end + 1)) : {};
          result = {
            medicamentos:  Array.isArray(parsed.medicamentos)  ? parsed.medicamentos  : [],
            suplementos:   Array.isArray(parsed.suplementos)   ? parsed.suplementos   : [],
            habitos:       Array.isArray(parsed.habitos)       ? parsed.habitos       : [],
            laboratorios:  Array.isArray(parsed.laboratorios)  ? parsed.laboratorios  : [],
          };
        } catch {
          result = { medicamentos: [], suplementos: [], habitos: [], laboratorios: [] };
        }
      }
      // Enriquecer laboratorios con código CUPS desde la BD
      const laboratoriosEnriquecidos = await Promise.all(
        (result.laboratorios || []).map(async (lab: any) => {
          if (lab.codigoCups) return lab;
          if (!lab.nombre) return lab;
          try {
            const palabras = lab.nombre.replace(/[^\w\sáéíóúñ]/gi, '').trim()
              .split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3);
            if (!palabras.length) return lab;
            const regex = new RegExp(palabras.join('.*'), 'i');
            const cups = await Cups2026.findOne({ nombre: { $regex: regex } }).lean();
            if (cups) return { ...lab, codigoCups: (cups as any).codigo, nombre: (cups as any).nombre };
          } catch { /* ignorar */ }
          return lab;
        })
      );

      return res.json({ ...result, laboratorios: laboratoriosEnriquecidos });
    } catch (err: any) {
      console.error('[RecomendacionIA] error:', err.message);
      return res.status(500).json({ error: err.message, medicamentos: [], suplementos: [], habitos: [], laboratorios: [] });
    }
  }
);

export default router;
