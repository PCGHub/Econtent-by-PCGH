/** A missing worker response must not leave a job pending forever. */
export class WorkerUnresponsiveError extends Error {
  constructor(stage: string) {
    super(`${stage}: FFmpeg returned no response or advancing media timestamps within the safety timeout. The worker was stopped and no partial output was accepted. Retry the job to load a fresh worker, select a shorter range, or use Fast Cut for compatible sources. Keep this tab in the foreground; conversion can be expensive on mobile.`);
    this.name = "WorkerUnresponsiveError";
  }
}

export class WorkerGuard {
  private pending = new Set<{ touch: () => void; cancel: () => void }>();
  private readonly timeoutMs: number;
  constructor(timeoutMs = 120_000) { this.timeoutMs = timeoutMs; }

  progress() {
    for (const request of this.pending) request.touch();
  }

  cancel() {
    for (const request of [...this.pending]) request.cancel();
  }

  run<T>(operation: () => Promise<T>, stage: string, onTimeout: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(request);
        settle();
      };
      const request = {
        touch: () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            finish(() => reject(new WorkerUnresponsiveError(stage)));
            onTimeout();
          }, this.timeoutMs);
        },
        cancel: () => finish(() => reject(new DOMException("Worker stopped", "AbortError"))),
      };
      this.pending.add(request);
      request.touch();
      // Observe late rejection too: termination may reject the underlying request.
      Promise.resolve().then(() => {
        if (settled) throw new DOMException("Worker stopped", "AbortError");
        return operation();
      }).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
  }
}
