import { projectSignature, type Project, type ProjectDraft } from "./model";
/** Serializes saves and coalesces edits made during an in-flight request. */
export class SaveQueue {
  private pending: ProjectDraft | null = null;
  private running: Promise<void> | null = null;
  private revision: number;
  private signature: string;
  private controller: AbortController | null = null;
  private disposed = false;
  private write: (
    revision: number,
    draft: ProjectDraft,
    signal: AbortSignal,
  ) => Promise<Project>;
  private onSaved: (project: Project) => void;
  constructor(
    project: Project,
    write: (
      revision: number,
      draft: ProjectDraft,
      signal: AbortSignal,
    ) => Promise<Project>,
    onSaved: (project: Project) => void,
  ) {
    this.write = write;
    this.onSaved = onSaved;
    this.revision = project.revision;
    this.signature = projectSignature(project);
  }
  enqueue(draft: ProjectDraft) {
    if (!this.disposed) this.pending = draft;
  }
  cancel() {
    this.controller?.abort();
  }
  dispose() {
    this.disposed = true;
    this.pending = null;
    this.cancel();
  }
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.running) {
      await this.running;
      if (this.pending) return this.flush();
      return;
    }
    this.running = (async () => {
      while (this.pending && !this.disposed) {
        const draft = this.pending;
        this.pending = null;
        if (projectSignature(draft) === this.signature) continue;
        const controller = new AbortController();
        this.controller = controller;
        try {
          const saved = await this.write(
            this.revision,
            draft,
            controller.signal,
          );
          controller.signal.throwIfAborted();
          this.revision = saved.revision;
          this.signature = projectSignature(saved);
          this.onSaved(saved);
        } catch (error) {
          if (!this.disposed && !this.pending) this.pending = draft;
          throw error;
        } finally {
          this.controller = null;
        }
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
}
