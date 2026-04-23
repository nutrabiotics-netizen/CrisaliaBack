/**
 * Agente Bedrock exclusivo del WebSocket copiloto por voz (ElevenLabs STT/TTS + agente).
 * Usa variables distintas de BEDROCK_AGENT_ID / BEDROCK_AGENT_ALIAS_ID (videoconsulta, etc.).
 */
export const copilotoVozBedrockConfig = {
  agentId: (process.env.COPILOTO_VOZ_BEDROCK_AGENT_ID || '').trim(),
  agentAliasId: (process.env.COPILOTO_VOZ_BEDROCK_AGENT_ALIAS_ID || '').trim()
};

export function isCopilotoVozBedrockConfigured(): boolean {
  return !!(copilotoVozBedrockConfig.agentId && copilotoVozBedrockConfig.agentAliasId);
}

/** Solo en servidor; no se expone en el front. Preferir ELEVENLABS_VOICE_ID. */
const FALLBACK_ELEVENLABS_VOICE_ID = 'gKg8M8yuhJHaZpgdtyrn';

export function getCopilotoVozElevenLabsVoiceId(): string {
  const v = (
    process.env.ELEVENLABS_VOICE_ID ||
    process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
    ''
  ).trim();
  return v || FALLBACK_ELEVENLABS_VOICE_ID;
}

export function isCopilotoVozTtsVoiceExplicitlyConfigured(): boolean {
  return !!(process.env.ELEVENLABS_VOICE_ID?.trim() || process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim());
}
