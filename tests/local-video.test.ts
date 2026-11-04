import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLocalVideoCapacity } from "../lib/projects/local-video";
const MIB = 1048576;
test("local video storage requires measured headroom and accepts representative Cutter file sizes", () => {
  for (const size of [10, 30, 70, 253, 256].map((n) => n * MIB)) {
    const checked = checkLocalVideoCapacity(size, {
      quota: 1024 * MIB,
      usage: 200 * MIB,
    });
    assert.ok(checked.required > size);
    assert.ok(checked.available >= checked.required);
    assert.throws(
      () =>
        checkLocalVideoCapacity(size, {
          quota: 200 * MIB + size,
          usage: 200 * MIB,
        }),
      /Not enough browser storage/,
    );
  }
});
test("unknown quota, invalid estimates and unsafe video sizes cannot claim storage availability", () => {
  for (const estimate of [
    {},
    { quota: NaN, usage: 0 },
    { quota: Infinity, usage: 0 },
    { quota: 1024, usage: -1 },
    { quota: 0, usage: 0 },
  ])
    assert.throws(
      () => checkLocalVideoCapacity(10, estimate),
      /could not be measured/,
    );
  for (const size of [0, -1, NaN, Infinity, 1.1, 257 * MIB])
    assert.throws(
      () => checkLocalVideoCapacity(size, { quota: 1e12, usage: 0 }),
      /at most 256 MB/,
    );
});
