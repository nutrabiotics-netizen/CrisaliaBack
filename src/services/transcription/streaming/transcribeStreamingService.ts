/**
 * Servicio desacoplado para AWS Transcribe Streaming.
 * Recibe audio PCM (16-bit, 16kHz, mono) vía un AsyncIterable, envía a Transcribe
 * y devuelve transcripciones parciales y finales mediante callbacks.
 * Sin identificación de hablante ni canales (un solo flujo).
 */

import { randomUUID } from 'crypto';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode
} from '@aws-sdk/client-transcribe-streaming';
import type { TranscriptResultStream } from '@aws-sdk/client-transcribe-streaming';
import { createAudioStreamQueue, AUDIO_STREAM_END, type IAudioStreamQueue } from './audioStreamQueue';

/** Configuración del servicio (región e idioma). */
const TRANSCRIBE_REGION = process.env.AWS_CHIME_S3_RECORDING_REGION || process.env.AWS_REGION || 'us-east-1';
const LANGUAGE_CODE =
  (process.env.TRANSCRIBE_STREAMING_LANGUAGE_CODE as LanguageCode) || LanguageCode.ES_ES;
const SAMPLE_RATE = 16000;
const MEDIA_ENCODING = 'pcm' as const;

/** Evento de transcripción emitido por el servicio. */
export interface TranscriptStreamEvent {
  /** Texto transcrito (parcial o final). */
  transcript: string;
  /** true si es resultado parcial (puede cambiar). */
  isPartial: boolean;
  /** Tiempo de inicio en segundos (opcional). */
  startTime?: number;
  /** Tiempo de fin en segundos (opcional). */
  endTime?: number;
  /** Identificador del resultado (opcional). */
  resultId?: string;
}

export interface TranscribeStreamingCallbacks {
  /** Se invoca por cada resultado parcial o final. */
  onTranscript: (event: TranscriptStreamEvent) => void;
  /** Se invoca al terminar el stream (éxito o error). */
  onEnd: (error?: Error) => void;
}

/**
 * Crea el cliente de Transcribe Streaming (una instancia por región).
 */
function getTranscribeStreamingClient(): TranscribeStreamingClient {
  return new TranscribeStreamingClient({
    region: TRANSCRIBE_REGION,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        : undefined
  });
}

/**
 * Procesa el stream de resultados de Transcribe (TranscriptResultStream) e invoca
 * los callbacks por cada TranscriptEvent.
 */
async function processTranscriptResultStream(
  resultStream: AsyncIterable<TranscriptResultStream> | undefined,
  callbacks: TranscribeStreamingCallbacks
): Promise<void> {
  if (!resultStream) {
    callbacks.onEnd();
    return;
  }
  try {
    for await (const event of resultStream) {
      if (event && 'TranscriptEvent' in event && event.TranscriptEvent?.Transcript?.Results) {
        for (const result of event.TranscriptEvent.Transcript.Results) {
          const transcript = result.Alternatives?.[0]?.Transcript?.trim();
          if (!transcript) continue;
          callbacks.onTranscript({
            transcript,
            isPartial: result.IsPartial ?? false,
            startTime: result.StartTime,
            endTime: result.EndTime,
            resultId: result.ResultId
          });
        }
      }
      // Errores vienen como miembros del union (BadRequestException, etc.)
      if (event && 'BadRequestException' in event && event.BadRequestException?.Message) {
        callbacks.onEnd(new Error(event.BadRequestException.Message));
        return;
      }
      if (event && 'InternalFailureException' in event && event.InternalFailureException?.Message) {
        callbacks.onEnd(new Error(event.InternalFailureException.Message));
        return;
      }
      if (event && 'LimitExceededException' in event && event.LimitExceededException?.Message) {
        callbacks.onEnd(new Error(event.LimitExceededException.Message));
        return;
      }
      if (event && 'ServiceUnavailableException' in event && event.ServiceUnavailableException?.Message) {
        callbacks.onEnd(new Error(event.ServiceUnavailableException.Message));
        return;
      }
      if (event && 'ConflictException' in event && event.ConflictException?.Message) {
        callbacks.onEnd(new Error(event.ConflictException.Message));
        return;
      }
    }
    callbacks.onEnd();
  } catch (err) {
    callbacks.onEnd(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Inicia la transcripción en streaming. Debe llamarse una sola vez por sesión.
 * - audioQueue: cola a la que el WebSocket (u otro) irá haciendo push de chunks PCM.
 * - callbacks: onTranscript por cada resultado, onEnd al finalizar.
 * Devuelve un objeto con stop() para señalar fin del audio (push AUDIO_STREAM_END).
 */
export function startTranscribeStreaming(
  audioQueue: IAudioStreamQueue,
  callbacks: TranscribeStreamingCallbacks
): { stop: () => void } {
  const client = getTranscribeStreamingClient();
  const sessionId = randomUUID();

  let streamEnded = false;
  const stop = (): void => {
    if (!streamEnded) {
      streamEnded = true;
      audioQueue.push(AUDIO_STREAM_END);
    }
  };

  (async () => {
    try {
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: LANGUAGE_CODE,
        MediaSampleRateHertz: SAMPLE_RATE,
        MediaEncoding: MEDIA_ENCODING,
        SessionId: sessionId,
        AudioStream: audioQueue.stream,
        ShowSpeakerLabel: false,
        EnableChannelIdentification: false
      });

      const response = await client.send(command);

      await processTranscriptResultStream(response.TranscriptResultStream, callbacks);
    } catch (err) {
      callbacks.onEnd(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return { stop };
}

/**
 * Crea una cola de audio lista para usar con startTranscribeStreaming.
 * El cliente (p. ej. WebSocket) debe hacer push de buffers PCM 16-bit 16kHz mono.
 */
export function createTranscriptionAudioQueue(): IAudioStreamQueue {
  return createAudioStreamQueue();
}

export { createAudioStreamQueue, AUDIO_STREAM_END };
export type { IAudioStreamQueue };
