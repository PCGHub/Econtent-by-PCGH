import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectRequest,
  PROJECT_REQUEST_TIMEOUT_MS,
} from "../lib/projects/client";
import { SaveQueue } from "../lib/projects/autosave";
import {
  EMPTY_DRAFT,
  projectContentSignature,
  type Project,
} from "../lib/projects/model";
const project: Project = {
  ...EMPTY_DRAFT,
  id: "01a40c17-5938-4df8-8830-161333fe330b",
  revision: 1,
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
};
test("stalled cloud headers and stalled response bodies both time out without an automatic retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const headersArrived of [false, true]) {
    let calls = 0,
      signal: AbortSignal | undefined;
    t.mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, init: RequestInit) => {
        calls++;
        signal = init.signal as AbortSignal;
        if (headersArrived)
          return { json: () => new Promise(() => {}), ok: true } as Response;
        return new Promise<Response>(() => {});
      },
    );
    const pending = assert.rejects(
      projectRequest("/" + project.id, { method: "PATCH" }),
      /Cloud request timed out.*may have reached the server/,
    );
    t.mock.timers.tick(PROJECT_REQUEST_TIMEOUT_MS);
    await pending;
    assert.equal(calls, 1);
    assert.equal(signal?.aborted, true);
    t.mock.restoreAll();
  }
});
test("cloud requests accept cancellation, including a signal already cancelled before fetch", async (t) => {
  let signal: AbortSignal | undefined,
    calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      calls++;
      return new Promise<Response>(() => {});
    },
  );
  const controller = new AbortController();
  const pending = assert.rejects(
    projectRequest("", { method: "POST", signal: controller.signal }),
    { name: "AbortError" },
  );
  controller.abort();
  await pending;
  assert.equal(signal?.aborted, true);
  await assert.rejects(projectRequest("", { signal: controller.signal }), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});
test("save permission/conflict errors remain visible and successful JSON is returned", async (t) => {
  for (const status of [401, 409]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        {
          error:
            status === 401
              ? "Sign in with a verified email"
              : "Project changed while saving",
        },
        { status },
      ),
    );
    await assert.rejects(
      projectRequest("/" + project.id),
      status === 401
        ? /Sign in with a verified email/
        : /Project changed while saving/,
    );
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ project }));
  assert.deepEqual(await projectRequest(""), { project });
});
test("disposing an editor aborts its save, drops queued edits and ignores a late response", async () => {
  let release: () => void = () => {},
    signal: AbortSignal | undefined,
    writes = 0,
    saved = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new SaveQueue(
    project,
    async (revision, draft, nextSignal) => {
      writes++;
      signal = nextSignal;
      await gate;
      return { ...project, ...draft, revision: revision + 1 };
    },
    () => {
      saved++;
    },
  );
  queue.enqueue({ ...EMPTY_DRAFT, title: "In flight" });
  const pending = assert.rejects(queue.flush(), { name: "AbortError" });
  queue.enqueue({ ...EMPTY_DRAFT, title: "Never send" });
  queue.dispose();
  assert.equal(signal?.aborted, true);
  release();
  await pending;
  queue.enqueue({ ...EMPTY_DRAFT, title: "Still disposed" });
  await queue.flush();
  assert.equal(writes, 1);
  assert.equal(saved, 0);
});
test("cancelling a save retains the local draft for explicit retry", async () => {
  let attempts = 0,
    callbacks = 0;
  const queue = new SaveQueue(
    project,
    async (revision, draft, signal) => {
      if (++attempts === 1)
        return await new Promise<Project>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Cancelled", "AbortError")),
            { once: true },
          ),
        );
      return { ...project, ...draft, revision: revision + 1 };
    },
    () => {
      callbacks++;
    },
  );
  queue.enqueue({ ...EMPTY_DRAFT, title: "Retain these edits" });
  const pending = assert.rejects(queue.flush(), { name: "AbortError" });
  queue.cancel();
  await pending;
  await queue.flush();
  assert.equal(attempts, 2);
  assert.equal(callbacks, 1);
});
test("processing cancellation alone does not arm a navigation warning; content changes still do", () => {
  assert.equal(
    projectContentSignature(project),
    projectContentSignature({ ...project, status: "cancelled" }),
  );
  assert.equal(
    projectContentSignature(project),
    projectContentSignature({ ...project, status: "processing" }),
  );
  assert.notEqual(
    projectContentSignature(project),
    projectContentSignature({ ...project, title: "New title" }),
  );
  assert.notEqual(
    projectContentSignature(project),
    projectContentSignature({
      ...project,
      settings: { ...project.settings, cutStrategy: "precision" },
    }),
  );
});
