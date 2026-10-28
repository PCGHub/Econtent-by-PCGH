const cache = new WeakMap<File, string>();
export async function fingerprint(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const cached = cache.get(file);
  if (cached) return cached;
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./fingerprint.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("File verification cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      finish();
      reject(new Error("File verification worker failed."));
    };
    worker.onmessage = (event) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else {
        cache.set(file, event.data.digest);
        resolve(event.data.digest);
      }
    };
    worker.postMessage(file);
  });
}
