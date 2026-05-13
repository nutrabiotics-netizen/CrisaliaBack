import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Credenciales y agente Bedrock exclusivos del WebSocket copiloto por voz.
 * Cuenta AWS distinta a la principal — usa COPILOTO_VOZ_BEDROCK_AGENT_AWS_*.
 */
export const copilotoVozBedrockConfig = {
  agentId:      (process.env.COPILOTO_VOZ_BEDROCK_AGENT_ID       || '').trim(),
  agentAliasId: (process.env.COPILOTO_VOZ_BEDROCK_AGENT_ALIAS_ID || '').trim(),
};

/** Cliente Bedrock exclusivo del copiloto por voz (credenciales propias). */
export const copilotoVozBedrockClient = new BedrockAgentRuntimeClient({
  region: (process.env.COPILOTO_VOZ_BEDROCK_AGENT_AWS_REGION || 'us-east-1').trim(),
  credentials: {
    accessKeyId:     (process.env.COPILOTO_VOZ_BEDROCK_AGENT_AWS_ACCESS_KEY_ID     || '').trim(),
    secretAccessKey: (process.env.COPILOTO_VOZ_BEDROCK_AGENT_AWS_SECRET_ACCESS_KEY || '').trim(),
  },
});

export function isCopilotoVozBedrockConfigured(): boolean {
  return !!(
    copilotoVozBedrockConfig.agentId &&
    copilotoVozBedrockConfig.agentAliasId &&
    process.env.COPILOTO_VOZ_BEDROCK_AGENT_AWS_ACCESS_KEY_ID?.trim() &&
    process.env.COPILOTO_VOZ_BEDROCK_AGENT_AWS_SECRET_ACCESS_KEY?.trim()
  );
}

/** Solo en servidor; no se expone en el front. */
const FALLBACK_ELEVENLABS_VOICE_ID = 'gKg8M8yuhJHaZpgdtyrn';

export function getCopilotoVozElevenLabsVoiceId(): string {
  const v = (process.env.ELEVENLABS_VOICE_ID || '').trim();
  return v || FALLBACK_ELEVENLABS_VOICE_ID;
}

export function isCopilotoVozTtsVoiceExplicitlyConfigured(): boolean {
  return !!process.env.ELEVENLABS_VOICE_ID?.trim();
}
