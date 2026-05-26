/**
 * Cliente Bedrock para generación de texto puro (sin imagen, sin Agent).
 *
 * Por qué un servicio aparte:
 *   - `services/ai/bedrock.service.ts` usa BedrockAgentRuntimeClient (necesita
 *     un agente configurado en la cuenta). Si el agente no existe, falla.
 *   - Este servicio invoca el modelo Claude directamente vía Converse, igual
 *     que el módulo de evaluación de alimentos. No depende de Agent ID/Alias.
 *
 * El modelo se controla con `BEDROCK_TEXT_MODEL_ID` (default = el mismo que vision).
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const REGION = (process.env.BEDROCK_TEXT_REGION || process.env.BEDROCK_VISION_REGION || process.env.AWS_REGION || 'us-east-1').trim();
const MODEL_ID = (
  process.env.BEDROCK_TEXT_MODEL_ID ||
  process.env.BEDROCK_VISION_MODEL_ID ||
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
).trim();

console.log('[BedrockTextService] init', {
  region: REGION,
  modelId: MODEL_ID,
  hasExplicitTextModel: !!process.env.BEDROCK_TEXT_MODEL_ID,
  hasExplicitVisionModel: !!process.env.BEDROCK_VISION_MODEL_ID
});

const client = new BedrockRuntimeClient({
  region: REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined
});

export interface BedrockTextOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Manda un prompt al modelo Claude y devuelve la respuesta como texto plano.
 * Tira excepción si Bedrock falla — el caller decide qué hacer.
 */
export async function invokeBedrockText(userPrompt: string, opts: BedrockTextOptions = {}): Promise<string> {
  console.log('[BedrockTextService] ▶ Converse', { modelId: MODEL_ID, promptLen: userPrompt.length });
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: opts.system ? [{ text: opts.system }] : undefined,
    messages: [{ role: 'user', content: [{ text: userPrompt }] }],
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 500,
      temperature: opts.temperature ?? 0.4
    }
  });

  const resp = await client.send(command);
  const textBlock = resp.output?.message?.content?.find((c) => c.text);
  return (textBlock?.text ?? '').trim();
}
