import test from "node:test";
import assert from "node:assert/strict";
import { WorkerGuard } from "../lib/video/worker-guard";

test("advancing media work extends the inactivity deadline; silence does not", async () => {
  const guard = new WorkerGuard(50);
  let terminate = false;
  const promise = guard.run(() => new Promise<never>(() => {}), "Encoding", () => { terminate = true; });
  const outcome = assert.rejects(promise, /Encoding: FFmpeg returned no response/);
  const heartbeat = setInterval(() => guard.progress(), 10);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(terminate, false);
  clearInterval(heartbeat);
  await outcome;
  assert.equal(terminate, true);
});

test("a stopped request never starts queued work and preserves even an undefined rejection", async () => {
  const guard = new WorkerGuard();
  let invoked = false;
  const pending = guard.run(async () => { invoked = true; return true; }, "Read", () => {});
  guard.cancel();
  await assert.rejects(pending, {name: "AbortError"});
  assert.equal(invoked, false);
  let rejected = false;
  await guard.run(() => Promise.reject(undefined), "Read", () => {}).then(
    () => assert.fail("Expected the worker rejection"),
    error => { rejected = true; assert.equal(error, undefined); },
  );
  assert.equal(rejected, true);
});
