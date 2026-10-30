import { test } from "node:test";
import assert from "node:assert/strict";
import { initialProject, template, TEMPLATES } from "../lib/titles/templates";
import {
  parseTitleProject,
  parseTitlesDraft,
  renderBudget,
} from "../lib/titles/document";
import {
  frameSchedule,
  frameEncodeArgs,
  titleMuxArgs,
} from "../lib/titles/commands";
test("all titles templates validate; untrusted saved documents reject invalid geometry, ranges, URLs and unknown effects", () => {
  const p = initialProject();
  for (const item of TEMPLATES)
    assert.equal(
      parseTitleProject({ ...p, scenes: [template(item.id)] }).scenes.length,
      1,
    );
  for (const patch of [
    { x: NaN },
    { width: 2 },
    { start: 10, end: 2 },
    { entrance: "script" },
    { color: "url(https://bad)" },
    { text: "a".repeat(241), entrance: "word-reveal" },
    { font: "remote" },
  ]) {
    const doc = structuredClone(p);
    Object.assign(doc.scenes[0].text[0], patch);
    assert.throws(() => parseTitleProject(doc));
  }
  assert.throws(() =>
    parseTitlesDraft({
      version: 1,
      document: {
        ...p,
        scenes: [
          {
            ...p.scenes[0],
            background: {
              ...p.scenes[0].background,
              kind: "image",
              assetId: "local",
            },
          },
        ],
      },
      sources: [],
    }),
  );
  assert.equal(
    parseTitlesDraft({ version: 1, document: p, sources: [] }).document.title,
    p.title,
  );
});
test("frame schedule quantizes boundaries once without cumulative scene drift; render budgets reject excessive workloads", () => {
  const p = initialProject();
  p.scenes = p.scenes.map((s) => ({ ...s, duration: 1.01 }));
  const plan = frameSchedule(p);
  assert.equal(
    plan.reduce((n, s) => n + s.frames, 0),
    Math.ceil(3.03 * 24),
  );
  assert.equal(renderBudget(p).frames, 73);
  assert.equal(plan[1].first, 25);
  assert.equal(plan[2].first, 49);
  const large = initialProject();
  large.output.shortEdge = 1080;
  large.scenes = Array.from({ length: 12 }, () => ({
    ...template("opening"),
    duration: 120,
  }));
  assert.throws(() => renderBudget(large), /short sequences/);
  const args = frameEncodeArgs(24, 24, "chunk.mp4");
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("yuv420p"));
  const mux = titleMuxArgs(
    [
      {
        path: "/local/source",
        hasAudio: true,
        volume: 0.5,
        loop: false,
        duration: 1,
      },
      { hasAudio: false, volume: 0, loop: false, duration: 1 },
    ],
    2,
  );
  assert.match(mux[mux.indexOf("-filter_complex") + 1], /volume=0.5/);
  assert.match(mux[mux.indexOf("-filter_complex") + 1], /concat=n=2:v=0:a=1/);
  assert.ok(mux.includes("copy"));
  assert.ok(mux.includes("aac"));
});

test("titles metadata round trips through existing project rows without Files or URLs and leaves legacy rows compatible", async () => {
  const { parseProjectDraft, toRow, fromRow, DEFAULT_SETTINGS, EMPTY_DRAFT } =
    await import("../lib/projects/model");
  const document = initialProject(),
    titles = parseTitlesDraft({ version: 1, document, sources: [] });
  const draft = parseProjectDraft({
    ...EMPTY_DRAFT,
    settings: { ...DEFAULT_SETTINGS, range: { start: 0, end: 27 } },
    titles,
  });
  const row = {
    ...toRow(draft),
    id: "01234567-0123-4123-8123-0123456789ab",
    revision: 1,
    created_at: "2026-10-30",
    updated_at: "2026-10-30",
  };
  assert.deepEqual(fromRow(row).titles, titles);
  assert.equal("titles_draft" in toRow(EMPTY_DRAFT), false);
  assert.equal(
    fromRow({ ...toRow(EMPTY_DRAFT), id: row.id, revision: 1 }).titles,
    undefined,
  );
  assert.throws(() =>
    parseTitlesDraft({
      ...titles,
      document: { ...document, remoteMedia: "https://example.test/video.mp4" },
    }),
  );
  assert.throws(
    () =>
      parseTitlesDraft({
        ...titles,
        sources: [
          {
            id: "bad",
            name: "bad",
            kind: "video",
            sizeBytes: 1,
            width: 2,
            height: 2,
            duration: 1,
            mimeType: "video/mp4",
            sha256: "a".repeat(64),
          },
        ],
      }),
    /Unused/,
  );
});
