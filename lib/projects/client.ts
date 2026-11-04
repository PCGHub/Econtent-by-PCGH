import type { Project, ProjectDraft } from "./model";
export const PROJECT_REQUEST_TIMEOUT_MS = 15000;
export async function projectRequest(path: string, init?: RequestInit) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  // Bound the whole response, including body reading, not just response headers.
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      const error = new DOMException(
        "Save request cancelled. Your local edits are still here.",
        "AbortError",
      );
      controller.abort(error);
      reject(error);
    };
    timer = setTimeout(() => {
      const error = new Error(
        "Cloud request timed out. Your local edits are still here. Check saved projects before retrying: the request may have reached the server. You can leave without saving.",
      );
      controller.abort(error);
      reject(error);
    }, PROJECT_REQUEST_TIMEOUT_MS);
    if (init?.signal?.aborted) cancel();
    else init?.signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    if (controller.signal.aborted) return await interrupted;
    return await Promise.race([
      interrupted,
      (async () => {
        const response = await fetch("/api/projects" + path, {
          ...init,
          signal: controller.signal,
          headers: { "Content-Type": "application/json", ...init?.headers },
          cache: "no-store",
        });
        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error(
            "Cloud returned an unreadable response. Check your connection and sign-in, then retry. Your local edits are still here.",
          );
        }
        if (!response.ok)
          throw new Error(result.error ?? "Project request failed");
        if(init?.method==="DELETE")window.dispatchEvent(new Event("econtent-storage-changed"));
        return result;
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", cancel);
  }
}
export async function saveProject(
  id: string,
  revision: number,
  draft: ProjectDraft,
  signal?: AbortSignal,
): Promise<Project> {
  return (
    await projectRequest("/" + id, {
      method: "PATCH",
      signal,
      body: JSON.stringify({ ...draft, revision }),
    })
  ).project;
}
