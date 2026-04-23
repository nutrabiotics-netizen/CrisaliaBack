import Medico from '../../../models/Medico';
import {
  isCopilotoVozBedrockConfigured,
  isCopilotoVozTtsVoiceExplicitlyConfigured
} from '../../../config/copilotoVozConfig';

export interface CopilotoVozConfigDto {
  habilitado: boolean;
  /** Ruta relativa del WebSocket (mismo host que la API) */
  webSocketPath: string;
  /** true si ELEVENLABS_VOICE_ID o ELEVENLABS_DEFAULT_VOICE_ID están definidas (no expone el valor) */
  ttsVoiceConfigured: boolean;
}

export interface CopilotoVozHealthDto {
  status: string;
  timestamp: string;
  elevenlabsConfigured: boolean;
  bedrockConfigured: boolean;
  /** Voz TTS definida en servidor (ELEVENLABS_VOICE_ID o ELEVENLABS_DEFAULT_VOICE_ID) */
  ttsVoiceConfigured: boolean;
}

export function obtenerEstadoSaludCopilotoVoz(): CopilotoVozHealthDto {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
    bedrockConfigured: isCopilotoVozBedrockConfigured(),
    ttsVoiceConfigured: isCopilotoVozTtsVoiceExplicitlyConfigured()
  };
}

export async function obtenerCopilotoVozConfig(medicoId: string): Promise<CopilotoVozConfigDto> {
  const m = await Medico.findById(medicoId).select('copilotoVoz').lean();
  return {
    habilitado: m?.copilotoVoz?.habilitado !== false,
    webSocketPath: '/api/medico/copiloto-voz-ws',
    ttsVoiceConfigured: isCopilotoVozTtsVoiceExplicitlyConfigured()
  };
}

export async function actualizarCopilotoVozConfig(
  medicoId: string,
  body: { habilitado?: boolean }
): Promise<CopilotoVozConfigDto> {
  const set: Record<string, unknown> = {};
  if (body.habilitado !== undefined) {
    set['copilotoVoz.habilitado'] = Boolean(body.habilitado);
  }
  if (Object.keys(set).length > 0) {
    await Medico.findByIdAndUpdate(medicoId, { $set: set });
  }
  return obtenerCopilotoVozConfig(medicoId);
}
