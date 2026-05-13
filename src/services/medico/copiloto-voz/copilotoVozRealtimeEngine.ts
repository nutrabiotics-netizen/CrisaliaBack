import { InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import WebSocket from 'ws';
import {
  ElevenLabsClient,
  AudioFormat,
  CommitStrategy,
  type RealtimeConnection
} from '@elevenlabs/elevenlabs-js';
import {
  copilotoVozBedrockClient as bedrockClient,
  copilotoVozBedrockConfig,
} from '../../../config/copilotoVozConfig';

let elevenLabsClient: ElevenLabsClient | null = null;

export function getElevenLabsClient(): ElevenLabsClient | null {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  if (!elevenLabsClient) {
    elevenLabsClient = new ElevenLabsClient({ apiKey: key });
  }
  return elevenLabsClient;
}

function sendJson(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

export async function connectElevenLabsRealtimeWithRetry(
  client: ElevenLabsClient,
  maxRetries = 5,
  delayMs = 1000
): Promise<RealtimeConnection> {
  let lastErr: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.speechToText.realtime.connect({
        modelId: 'scribe_v2_realtime',
        audioFormat: AudioFormat.PCM_16000,
        sampleRate: 16000,
        languageCode: 'es',
        includeTimestamps: true,
        commitStrategy: CommitStrategy.VAD,
        vadThreshold: 0.85,
        vadSilenceThresholdSecs: 0.6,
        minSpeechDurationMs: 300,
        minSilenceDurationMs: 500
      });
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr || new Error('ElevenLabs realtime: fallo de conexión');
}

async function* streamBedrockAgent(
  text: string,
  sessionId: string | null
): AsyncGenerator<
  | { type: 'chunk'; text: string; accumulated: string }
  | { type: 'complete'; text: string; sessionId: string },
  void,
  unknown
> {
  const agentId = copilotoVozBedrockConfig.agentId;
  const agentAliasId = copilotoVozBedrockConfig.agentAliasId;
  if (!agentId || !agentAliasId) {
    throw new Error(
      'Agente Bedrock del copiloto por voz no configurado (COPILOTO_VOZ_BEDROCK_AGENT_ID / COPILOTO_VOZ_BEDROCK_AGENT_ALIAS_ID)'
    );
  }

  const finalSessionId =
    sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId,
    sessionId: finalSessionId,
    inputText: text,
    enableTrace: false,
    streamingConfigurations: {
      streamFinalResponse: true
    }
  });

  const response = await bedrockClient.send(command);
  let accumulatedText = '';

  if (response.completion) {
    for await (const event of response.completion) {
      if (event.chunk?.bytes) {
        const decodedChunk = new TextDecoder().decode(event.chunk.bytes);
        accumulatedText += decodedChunk;
        yield {
          type: 'chunk' as const,
          text: decodedChunk,
          accumulated: accumulatedText
        };
      }
    }
  }

  yield {
    type: 'complete' as const,
    text: accumulatedText,
    sessionId: finalSessionId
  };
}

export function cleanTextForTTS(text: string): string {
  return text
    .replace(/\\n+/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/\r/g, '')
    .replace(/<[^>]+>.*?<\/[^>]+>/gs, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[*_~`]/g, '')
    .trim();
}

function extractCompleteSentences(text: string): { sentences: string; remaining: string } {
  const MIN_LENGTH = 8;
  const matches = [...text.matchAll(/[.!?:]+(?:\s+|$)|,(?=\s+[A-Z])/g)];

  if (matches.length === 0) {
    if (text.length > 100) {
      const lastComma = Math.max(text.lastIndexOf(','), text.lastIndexOf(';'), text.lastIndexOf(':'));
      if (lastComma > 60) {
        return {
          sentences: text.substring(0, lastComma + 1).trim(),
          remaining: text.substring(lastComma + 1).trim()
        };
      }
    }
    return { sentences: '', remaining: text };
  }

  const lastMatch = matches[matches.length - 1];
  const lastIndex = (lastMatch.index ?? 0) + lastMatch[0].length;
  const sentences = text.substring(0, lastIndex).trim();
  const remaining = text.substring(lastIndex).trim();

  if (sentences.length < MIN_LENGTH) {
    return { sentences: '', remaining: text };
  }

  return { sentences, remaining };
}

export async function streamTextToSpeechPCM(
  elevenlabs: ElevenLabsClient,
  voiceId: string,
  text: string,
  clientWs: WebSocket,
  ttsState?: { active: boolean }
): Promise<void> {
  try {
    const audioStream = await elevenlabs.textToSpeech.stream(voiceId, {
      modelId: 'eleven_turbo_v2_5',
      languageCode: 'es',
      text,
      outputFormat: 'pcm_24000',
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.8,
        useSpeakerBoost: true,
        speed: 1.05
      }
    });

    if (ttsState) ttsState.active = true;
    sendJson(clientWs, {
      type: 'tts_audio_start',
      format: 'pcm',
      sampleRate: 24000,
      channels: 1,
      bitDepth: 16
    });

    const buffer: Buffer[] = [];
    let leftoverByte: number | null = null;
    const MIN_CHUNK_SIZE = 4096;
    const MAX_BUFFER_SIZE = 12288;
    const CHUNK_TIMEOUT = 50;
    let lastSendTime = Date.now();

    const reader = audioStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      const chunk = Buffer.from(value);
      buffer.push(chunk);
      const bufferSize = buffer.reduce((acc, c) => acc + c.length, 0);
      const timeSinceLastSend = Date.now() - lastSendTime;

      const shouldSend =
        bufferSize >= MIN_CHUNK_SIZE ||
        bufferSize >= MAX_BUFFER_SIZE ||
        (bufferSize > 0 && timeSinceLastSend > CHUNK_TIMEOUT);

      if (shouldSend) {
        let combined = Buffer.concat(buffer);

        if (leftoverByte !== null) {
          combined = Buffer.concat([Buffer.from([leftoverByte]), combined]);
          leftoverByte = null;
        }

        if (combined.length % 2 !== 0) {
          leftoverByte = combined[combined.length - 1]!;
          combined = combined.slice(0, -1);
        }

        if (combined.length > 0 && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(combined);
          lastSendTime = Date.now();
        }

        buffer.length = 0;
      }
    }

    if (buffer.length > 0 || leftoverByte !== null) {
      let combined = buffer.length > 0 ? Buffer.concat(buffer) : Buffer.alloc(0);

      if (leftoverByte !== null) {
        combined = Buffer.concat([Buffer.from([leftoverByte]), combined]);
        leftoverByte = null;
      }

      if (combined.length % 2 !== 0) {
        combined = combined.slice(0, -1);
      }

      if (combined.length > 0 && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(combined);
      }
    }

    sendJson(clientWs, { type: 'tts_audio_end' });
    if (ttsState) ttsState.active = false;
  } catch (err) {
    console.error('[CopilotoVoz] TTS error:', err);
    sendJson(clientWs, { type: 'error', error: 'TTS failed' });
  }
}

export async function handleAgentQuery(
  text: string,
  sessionId: string | null,
  clientWs: WebSocket,
  elevenlabs: ElevenLabsClient,
  voiceId: string,
  enableTTS = true,
  ttsState?: { active: boolean }
): Promise<string | null> {
  try {
    sendJson(clientWs, { type: 'thinking' });

    let pendingText = '';
    let ttsQueue: Promise<void> = Promise.resolve();
    let finalSessionId: string | null = sessionId;

    for await (const event of streamBedrockAgent(text, sessionId)) {
      if (event.type === 'chunk') {
        pendingText += event.text;

        const cleanedChunk = cleanTextForTTS(event.text);
        const cleanedAccumulated = cleanTextForTTS(event.accumulated);

        sendJson(clientWs, {
          type: 'agent_text_chunk',
          chunk: cleanedChunk,
          accumulated: cleanedAccumulated
        });

        if (enableTTS) {
          const { sentences, remaining } = extractCompleteSentences(pendingText);

          if (sentences) {
            const cleanedSentences = cleanTextForTTS(sentences);

            if (cleanedSentences) {
              sendJson(clientWs, {
                type: 'agent_tts_text',
                text: cleanedSentences
              });

              ttsQueue = ttsQueue.then(() =>
                streamTextToSpeechPCM(elevenlabs, voiceId, cleanedSentences, clientWs, ttsState)
              );
            }
            pendingText = remaining;
          }
        }
      }

      if (event.type === 'complete') {
        finalSessionId = event.sessionId;

        if (enableTTS && pendingText.trim()) {
          const cleanedPending = cleanTextForTTS(pendingText);
          if (cleanedPending) {
            sendJson(clientWs, {
              type: 'agent_tts_text',
              text: cleanedPending
            });

            ttsQueue = ttsQueue.then(() =>
              streamTextToSpeechPCM(elevenlabs, voiceId, cleanedPending, clientWs, ttsState)
            );
          }
        }

        if (enableTTS) {
          await ttsQueue;
        }

        sendJson(clientWs, {
          type: 'agent_complete',
          text: cleanTextForTTS(event.text)
        });
      }
    }

    return finalSessionId;
  } catch (err) {
    console.error('[CopilotoVoz] handleAgentQuery:', err);
    sendJson(clientWs, {
      type: 'error',
      error: err instanceof Error ? err.message : 'Agent failed'
    });
    return sessionId;
  }
}
