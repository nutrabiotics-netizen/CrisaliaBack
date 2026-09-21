import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth';
import { UserRole } from '../../types';
import { recomendarMedicamentosConsulta } from '../../services/ai/crisaliaAgentService';
import { invokeBedrockText } from '../../services/ai/bedrockTextService';
import Interrogatorio from '../../models/Interrogatorio';
import Paciente from '../../models/Paciente';

const MEDS_FALLBACK_SYSTEM = `Eres un asistente clínico de apoyo al médico. A partir del contexto del paciente y la transcripción de la consulta, identifica medicamentos prescritos y suplementos relevantes. Devuelve SOLO JSON válido: {"medicamentos":[{"nombre":"...","dosis":"...","frecuencia":"...","indicacion":"..."}],"suplementos":[{"nombre":"...","dosis":"...","frecuencia":"...","beneficio":"..."}]}. Si no hay nada, devuelve {"medicamentos":[],"suplementos":[]}.`;

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
        return res.json({ medicamentos: [], suplementos: [] });
      }

      let result: { medicamentos: any[]; suplementos: any[] };
      try {
        // Intentar con el Bedrock Agent (timeout generoso)
        result = await recomendarMedicamentosConsulta({ ...inputAgent, timeoutMs: 300000 });
      } catch (agentErr: any) {
        // Fallback a Claude directo si el agent falla o tarda demasiado
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
          { system: MEDS_FALLBACK_SYSTEM, maxTokens: 800, temperature: 0.1 }
        );
        try {
          const parsed = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim());
          result = {
            medicamentos: Array.isArray(parsed.medicamentos) ? parsed.medicamentos : [],
            suplementos:  Array.isArray(parsed.suplementos)  ? parsed.suplementos  : [],
          };
        } catch {
          result = { medicamentos: [], suplementos: [] };
        }
      }
      return res.json(result);
    } catch (err: any) {
      console.error('[RecomendacionIA] error:', err.message);
      return res.status(500).json({ error: err.message, medicamentos: [], suplementos: [] });
    }
  }
);

export default router;
