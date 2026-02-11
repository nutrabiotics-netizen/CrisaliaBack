/**
 * Cola para alimentar el AudioStream de AWS Transcribe Streaming.
 * El WebSocket envía chunks de audio (PCM 16-bit 16kHz mono); esta cola los expone
 * como AsyncIterable<AudioStream> para StartStreamTranscriptionCommand.
 */

/** Valor centinela: al enviarlo se cierra el iterable (fin del stream). */
export const AUDIO_STREAM_END = null as unknown as Uint8Array;

export interface IAudioStreamQueue {
  /** Añade un chunk de audio. Envía AUDIO_STREAM_END para cerrar el stream. */
  push(chunk: Uint8Array | null): void;
  /** AsyncIterable que consume los chunks hasta recibir AUDIO_STREAM_END. */
  stream: AsyncIterable<{ AudioEvent: { AudioChunk: Uint8Array } }>;
}

/**
 * Crea una cola que convierte chunks de audio (desde WebSocket) en un
 * AsyncIterable válido para AudioStream de StartStreamTranscription.
 */
export function createAudioStreamQueue(): IAudioStreamQueue {
  const queue: (Uint8Array | null)[] = [];
  let resolveWait: (() => void) | null = null;
  let ended = false;

  const waitNext = (): Promise<void> => {
    if (queue.length > 0) return Promise.resolve();
    if (ended) return Promise.resolve();
    return new Promise((resolve) => {
      resolveWait = resolve;
    });
  };

  const push = (chunk: Uint8Array | null): void => {
    if (chunk === AUDIO_STREAM_END || chunk === null) {
      ended = true;
      queue.push(null);
    } else {
      queue.push(chunk);
    }
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  };

  const stream: AsyncIterable<{ AudioEvent: { AudioChunk: Uint8Array } }> = {
    [Symbol.asyncIterator]: async function* () {
      while (true) {
        await waitNext();
        const item = queue.shift();
        if (item === null || item === undefined) break;
        yield { AudioEvent: { AudioChunk: item } };
      }
      // Según la documentación de AWS, enviar un evento vacío al final
      yield { AudioEvent: { AudioChunk: new Uint8Array(0) } };
    }
  };

  return { push, stream };
}
