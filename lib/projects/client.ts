import type { Project, ProjectDraft } from "./model";
export async function projectRequest(path: string, init?: RequestInit) {
  const response = await fetch("/api/projects" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Project request failed");
  return result;
}
export async function saveProject(
  id: string,
  revision: number,
  draft: ProjectDraft,
): Promise<Project> {
  return (
    await projectRequest("/" + id, {
      method: "PATCH",
      body: JSON.stringify({ ...draft, revision }),
    })
  ).project;
}
