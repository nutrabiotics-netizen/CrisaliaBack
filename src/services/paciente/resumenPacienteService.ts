/**
 * Servicio para mantener actualizado el campo `Paciente.resumenIA`.
 *
 * El resumen es generado por el agente oficial Crisal·IA (YY3KJX4H78/TBGVLCOKOG)
 * leyendo:
 *  - Últimas 5 historias clínicas del paciente
 *  - Últimas 5 fórmulas médicas
 *  - Últimas 5 citas (estado/motivo)
 *
 * Se regenera automáticamente cuando:
 *  - Una cita pasa a estado 'completada' (hook desde el controller que cierra la cita)
 *  - Se crea o actualiza una fórmula médica
 *  - Llamada manual desde POST /external/tools/me/resumen/refresh
 *
 * Política: fire-and-forget desde los hooks (no bloquea la respuesta principal).
 * Si el agente falla, el resumen anterior queda intacto y se loguea.
 */

import mongoose from 'mongoose';
import Paciente from '../../models/Paciente';
import HistoriaClinica from '../../models/HistoriaClinica';
import FormulaMedica from '../../models/FormulaMedica';
import Cita from '../../models/Cita';
import { generarResumenIntegralPaciente } from '../ai/crisaliaAgentService';

export type MotivoActualizacion =
  | 'cita_completada'
  | 'formula_creada'
  | 'formula_actualizada'
  | 'manual'
  | 'inicial';

/**
 * Genera y guarda el resumen integral del paciente.
 * Retorna el texto generado o null si falló.
 */
export async function regenerarResumenPaciente(
  pacienteId: string,
  motivo: MotivoActualizacion = 'manual',
  citaIdReferencia?: string
): Promise<string | null> {
  try {
    const id = new mongoose.Types.ObjectId(pacienteId);
    const paciente = await Paciente.findById(id).lean();
    if (!paciente) {
      console.warn('[resumenPaciente] paciente no encontrado:', pacienteId);
      return null;
    }

    // Cargar últimas historias clínicas, fórmulas y citas en paralelo
    const [historias, formulas, citas] = await Promise.all([
      HistoriaClinica.find({ pacienteId: id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      FormulaMedica.find({ pacienteId: id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Cita.find({ pacienteId: id })
        .sort({ fecha: -1 })
        .limit(5)
        .lean()
    ]);

    // Si no hay nada que resumir, no llamamos al agente
    if (historias.length === 0 && formulas.length === 0 && citas.length === 0) {
      console.log('[resumenPaciente] sin información clínica, no regeneramos');
      return null;
    }

    // Construir input para el agente
    const texto = await generarResumenIntegralPaciente({
      paciente: {
        nombre: paciente.nombre,
        apellido: paciente.apellido,
        fechaNacimiento: paciente.fechaNacimiento,
        sexoBiologico: paciente.sexoBiologico
      },
      ultimasHistorias: historias.map((h: any) => ({
        fecha: h.createdAt,
        motivoConsulta: h.motivoConsulta,
        diagnosticos: h.diagnosticos,
        recomendaciones: h.recomendaciones,
        analisisPlan: h.analisisPlan
      })),
      ultimasFormulas: formulas.map((f: any) => ({
        fecha: f.createdAt,
        medicamentos: f.medicamentos
      })),
      ultimasCitas: citas.map((c: any) => ({
        fecha: c.fecha,
        estado: c.estado,
        motivo: c.motivo
      }))
    });

    if (!texto || !texto.trim()) {
      console.warn('[resumenPaciente] agente devolvió texto vacío');
      return null;
    }

    // Versión incremental
    const versionPrev = (paciente as any).resumenIA?.version ?? 0;

    await Paciente.updateOne(
      { _id: id },
      {
        $set: {
          'resumenIA.texto': texto.trim(),
          'resumenIA.actualizadoEn': new Date(),
          'resumenIA.motivoActualizacion': motivo,
          'resumenIA.citaIdReferencia': citaIdReferencia,
          'resumenIA.version': versionPrev + 1
        }
      }
    );

    console.log('[resumenPaciente] ✓ resumen actualizado', {
      pacienteId,
      motivo,
      version: versionPrev + 1,
      len: texto.length
    });
    return texto.trim();
  } catch (err) {
    console.error('[resumenPaciente] ✗ error regenerando:', err);
    return null;
  }
}

/**
 * Helper fire-and-forget — útil para llamar desde hooks (cita completada,
 * fórmula creada) sin bloquear la respuesta principal.
 */
export function regenerarResumenAsync(
  pacienteId: string,
  motivo: MotivoActualizacion,
  citaIdReferencia?: string
): void {
  // Evitamos awaitar — log de cualquier error queda en consola
  regenerarResumenPaciente(pacienteId, motivo, citaIdReferencia).catch((err) => {
    console.error('[regenerarResumenAsync] fallo silencioso:', err);
  });
}
