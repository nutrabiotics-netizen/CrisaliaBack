/**
 * Cola de procesamiento serial (FIFO).
 * Garantiza que las llamadas async se ejecuten en el orden en que fueron encoladas,
 * sin importar cuánto tarde cada una. Una instancia por conexión WS.
 */
export class SerialQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = false;

  /**
   * Encola `fn` y retorna una promesa que resuelve con su resultado cuando llegue su turno.
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      if (!this.running) {
        void this.flush();
      }
    });
  }

  private async flush(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.running = false;
  }
}
