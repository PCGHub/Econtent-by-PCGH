import type { SourceMetadata } from "./model";
export const LOCAL_VIDEO_DB = "econtent-local-videos-v1";
export const LOCAL_VIDEO_CHANGED = "econtent-local-video-changed";
export class LocalVideoMismatch extends Error {}
const META = "metadata",
  FILES = "files",
  MIB = 1048576;
export interface LocalVideoInfo {
  ownerId: string;
  sha256: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
  lastModified: number;
  savedAt: number;
}
function key(ownerId: string, sha256: string): [string, string] {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(ownerId) || !/^[a-f0-9]{64}$/.test(sha256))
    throw Error("Invalid local video identity.");
  return [ownerId, sha256];
}
export function checkLocalVideoCapacity(
  size: number,
  estimate: { quota?: number; usage?: number },
) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 256 * MIB)
    throw Error(
      "Remembered videos must be nonempty and at most 256 MB. You can still reconnect the original file.",
    );
  if (
    !Number.isFinite(estimate.quota) ||
    !Number.isFinite(estimate.usage) ||
    estimate.quota! <= 0 ||
    estimate.usage! < 0
  )
    throw Error(
      "Available browser storage could not be measured. Reconnect the video instead.",
    );
  const available = Math.max(0, estimate.quota! - estimate.usage!),
    required = size + Math.max(16 * MIB, Math.ceil(size * 0.1));
  if (available < required)
    throw Error(
      "Not enough browser storage to remember this video safely. Remove local copies or reconnect the original file when reopening.",
    );
  return { available, required };
}
function storageError(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return Error(
      "Browser storage is full. No complete local copy was confirmed. Remove local copies or reconnect the original video.",
    );
  return error instanceof Error
    ? error
    : Error(
        "Local video storage is unavailable in this browser. Reconnect the original video.",
      );
}
async function open(signal?: AbortSignal): Promise<IDBDatabase> {
  signal?.throwIfAborted();
  if (typeof indexedDB === "undefined")
    throw Error(
      "This browser cannot remember videos. Reconnect the original file instead.",
    );
  return new Promise((resolve, reject) => {
    let finished = false;
    const request = indexedDB.open(LOCAL_VIDEO_DB, 1);
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(storageError(error));
    };
    const cancel = () =>
      fail(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        fail(
          Error(
            "Local video storage is unavailable or busy. Close other Econtent tabs, or reconnect the file.",
          ),
        ),
      8000,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(FILES);
      db.createObjectStore(META).createIndex("ownerId", "ownerId");
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () =>
      fail(
        Error(
          "Local video storage is blocked by another tab. Close it or reconnect the file.",
        ),
      );
    request.onsuccess = () => {
      if (finished) {
        request.result.close();
        return;
      }
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction, set: (value: T) => void) => void,
  signal?: AbortSignal,
): Promise<T> {
  const db = await open(signal);
  try {
    signal?.throwIfAborted();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result: T, failure: unknown;
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        failure = signal?.reason ?? new DOMException("Cancelled", "AbortError");
        try {
          tx.abort();
        } catch {
          finish();
          reject(storageError(failure));
        }
      };
      const timer = setTimeout(() => {
        failure = Error(
          "Remembering the video took too long. Reconnect remains available.",
        );
        try {
          tx.abort();
        } catch {
          finish();
          reject(storageError(failure));
        }
      }, 20000);
      signal?.addEventListener("abort", cancel, { once: true });
      tx.oncomplete = () => {
        finish();
        resolve(result);
      };
      tx.onabort = () => {
        finish();
        reject(storageError(failure ?? tx.error));
      };
      tx.onerror = () => {
        failure ??= tx.error;
      };
      try {
        action(tx, (value) => {
          result = value;
        });
      } catch (error) {
        failure = error;
        tx.abort();
      }
    });
  } finally {
    db.close();
  }
}
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(LOCAL_VIDEO_CHANGED));
}
export async function localVideoInfo(
  ownerId: string,
  sha256: string,
  signal?: AbortSignal,
): Promise<LocalVideoInfo | undefined> {
  return run(
    [META],
    "readonly",
    (tx, set) => {
      const r = tx.objectStore(META).get(key(ownerId, sha256));
      r.onsuccess = () => set(r.result);
    },
    signal,
  );
}
export async function rememberVideo(
  ownerId: string,
  sha256: string,
  file: File,
  signal?: AbortSignal,
) {
  const id = key(ownerId, sha256);
  signal?.throwIfAborted();
  if (!navigator.storage?.estimate)
    throw Error(
      "This browser cannot check storage capacity. Reconnect the video instead.",
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    const estimate = await Promise.race([
      navigator.storage.estimate(),
      new Promise<never>((_, reject) => {
        cancel = () =>
          reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
        timer = setTimeout(
          () =>
            reject(
              Error(
                "Browser storage estimation timed out. Reconnect the original video.",
              ),
            ),
          8000,
        );
      }),
    ]);
    signal?.throwIfAborted();
    checkLocalVideoCapacity(file.size, estimate);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  const info: LocalVideoInfo = {
    ownerId,
    sha256,
    sizeBytes: file.size,
    name: file.name,
    mimeType: file.type,
    lastModified: file.lastModified,
    savedAt: Date.now(),
  };
  await run<void>(
    [META, FILES],
    "readwrite",
    (tx) => {
      tx.objectStore(FILES).put(file, id);
      tx.objectStore(META).put(info, id);
    },
    signal,
  );
  changed();
  return info;
}
export async function readRememberedVideo(
  ownerId: string,
  source: SourceMetadata,
  signal?: AbortSignal,
): Promise<File | null> {
  const id = key(ownerId, source.sha256);
  const row = await run<{ info?: LocalVideoInfo; blob?: Blob }>(
    [META, FILES],
    "readonly",
    (tx, set) => {
      const meta = tx.objectStore(META).get(id),
        file = tx.objectStore(FILES).get(id);
      const result: { info?: LocalVideoInfo; blob?: Blob } = {};
      set(result);
      meta.onsuccess = () => {
        result.info = meta.result;
      };
      file.onsuccess = () => {
        result.blob = file.result;
      };
    },
    signal,
  );
  if (!row.info && !row.blob) return null;
  if (
    row.info?.ownerId !== ownerId ||
    row.info?.sha256 !== source.sha256 ||
    row.info.sizeBytes !== source.sizeBytes ||
    !(row.blob instanceof Blob) ||
    row.blob.size !== source.sizeBytes
  )
    throw new LocalVideoMismatch(
      "The remembered copy is incomplete or does not match this project. Reconnect the exact original video.",
    );
  return new File([row.blob], source.name, {
    type: source.mimeType,
    lastModified: row.info.lastModified,
  });
}
export async function forgetVideo(
  ownerId: string,
  sha256: string,
  signal?: AbortSignal,
  notify = true,
) {
  const id = key(ownerId, sha256);
  await run<void>(
    [META, FILES],
    "readwrite",
    (tx) => {
      tx.objectStore(FILES).delete(id);
      tx.objectStore(META).delete(id);
    },
    signal,
  );
  if (notify) changed();
}
export async function clearLocalVideos(ownerId: string) {
  key(ownerId, "0".repeat(64));
  await run<void>([META, FILES], "readwrite", (tx) => {
    const cursor = tx
      .objectStore(META)
      .index("ownerId")
      .openKeyCursor(IDBKeyRange.only(ownerId));
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        tx.objectStore(FILES).delete(c.primaryKey);
        tx.objectStore(META).delete(c.primaryKey);
        c.continue();
      }
    };
  });
  changed();
}
