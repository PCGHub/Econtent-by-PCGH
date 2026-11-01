import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStep } from "../lib/titles/render-step";
test("cancel rejects native frame/font waits immediately and ignores late callback completion", async () => {
  const abort = new AbortController();
  let finish!: (n: number) => void;
  const pending = renderStep(
    () => new Promise<number>((resolve) => (finish = resolve)),
    abort.signal,
    "Rasterize",
    1000,
  );
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  finish(42);
  assert.equal(
    await renderStep(
      () => Promise.resolve(7),
      new AbortController().signal,
      "Retry",
    ),
    7,
  );
});
test("stalled native rendering fails with actionable stage, bounded time and no partial success", async () => {
  await assert.rejects(
    renderStep(
      () => new Promise(() => {}),
      new AbortController().signal,
      "Rasterize title frame",
      10,
    ),
    /Rasterize title frame did not respond/,
  );
});
