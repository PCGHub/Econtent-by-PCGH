/** Bound native canvas/font waits too; worker cancellation alone cannot reject them. */
export function renderStep<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  stage: string,
  limit = 20000,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (ok) resolve(value as T);
      else reject(value);
    };
    const cancel = () =>
        finish(false, new DOMException("Cancelled", "AbortError")),
      timer = setTimeout(
        () =>
          finish(
            false,
            Error(
              `${stage} did not respond within ${limit / 1000} seconds. Keep this tab foregrounded, close other tabs or choose a smaller output size. No partial output was accepted.`,
            ),
          ),
        limit,
      );
    signal.addEventListener("abort", cancel, { once: true });
    try {
      operation().then(
        (value) => finish(true, value),
        (error) => finish(false, error),
      );
    } catch (error) {
      finish(false, error);
    }
  });
}
