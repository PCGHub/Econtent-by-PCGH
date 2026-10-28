import { projectSignature, type Project, type ProjectDraft } from "./model";
/** Serializes saves and coalesces edits made during an in-flight request. */
export class SaveQueue {
  private pending: ProjectDraft | null = null;
  private running: Promise<void> | null = null;
  private revision: number;
  private signature: string;
  private write: (revision: number, draft: ProjectDraft) => Promise<Project>;
  private onSaved: (project: Project) => void;
  constructor(
    project: Project,
    write: (revision: number, draft: ProjectDraft) => Promise<Project>,
    onSaved: (project: Project) => void,
  ) {
    this.write = write;
    this.onSaved = onSaved;
    this.revision = project.revision;
    this.signature = projectSignature(project);
  }
  enqueue(draft: ProjectDraft) {
    this.pending = draft;
  }
  async flush(): Promise<void> {
    if (this.running) {
      await this.running;
      if (this.pending) return this.flush();
      return;
    }
    this.running = (async () => {
      while (this.pending) {
        const draft = this.pending;
        this.pending = null;
        if (projectSignature(draft) === this.signature) continue;
        try {
          const saved = await this.write(this.revision, draft);
          this.revision = saved.revision;
          this.signature = projectSignature(saved);
          this.onSaved(saved);
        } catch (error) {
          if (!this.pending) this.pending = draft;
          throw error;
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
