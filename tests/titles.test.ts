import { test } from "node:test";
import assert from "node:assert/strict";
import { initialProject, TEMPLATES, template } from "../lib/titles/templates";
import {
  newText,
  sample,
  locate,
  durationOf,
  setDuration,
  shiftRange,
  duplicate,
} from "../lib/titles/model";
test("title templates have deterministic initial identities, bounded scenes and independent duplicates", () => {
  const p = initialProject();
  assert.deepEqual(p, initialProject());
  assert.equal(TEMPLATES.length, 8);
  assert.equal(durationOf(p), 27);
  for (const info of TEMPLATES) {
    const scene = template(info.id);
    assert.ok(scene.text.length > 0 && scene.text.length <= 8);
    for (const t of scene.text) {
      assert.ok(t.start >= 0 && t.end <= scene.duration);
      assert.ok(t.x + t.width <= 1 && t.y + t.height <= 1);
    }
  }
  const copy = duplicate(p.scenes[0]);
  assert.notEqual(copy.id, p.scenes[0].id);
  assert.notEqual(copy.text[0].id, p.scenes[0].text[0].id);
  copy.text[0].text = "Edited";
  assert.notEqual(p.scenes[0].text[0].text, "Edited");
});
test("preview effects use actual timeline time and half-open text intervals", () => {
  const clip = newText(4, {
    text: "HELLO WORLD",
    start: 1,
    end: 4,
    animationDuration: 1,
  });
  assert.equal(sample(clip, 0.9).opacity, 0);
  assert.equal(sample(clip, 1).opacity, 0);
  assert.equal(sample(clip, 2).opacity, 1);
  assert.equal(sample(clip, 4).active, false);
  const typed = { ...clip, entrance: "typewriter" as const };
  assert.equal(sample(typed, 1).text, "");
  assert.equal(sample(typed, 1.5).text, "HELLO");
  assert.equal(sample(typed, 2).text, "HELLO WORLD");
  const roll = { ...clip, entrance: "credit-roll" as const };
  assert.ok(sample(roll, 2).dy < sample(roll, 1).dy);
});
test("scene/track edits preserve valid ranges and project seeking crosses scene boundaries", () => {
  const p = initialProject();
  assert.equal(locate(p, 7).index, 1);
  assert.equal(locate(p, 27).time, 14);
  const shrunk = setDuration(p.scenes[0], 1);
  for (const t of shrunk.text) {
    assert.ok(t.start >= 0 && t.end <= 1 && t.end - t.start >= 0.099);
  }
  const t = newText(6, { start: 1, end: 4 });
  assert.deepEqual(
    [shiftRange(t, "move", 50, 6).start, shiftRange(t, "move", 50, 6).end],
    [3, 6],
  );
  assert.equal(shiftRange(t, "start", -20, 6).start, 0);
});
