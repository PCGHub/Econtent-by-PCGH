import { test } from "node:test";
import assert from "node:assert/strict";
import { expiryMessage, storageBytes } from "../lib/storage/model";
import { parseMultitrack } from "../lib/multitrack/draft";
import {
  DEFAULT_SETTINGS,
  fromRow,
  parseProjectDraft,
  toRow,
} from "../lib/projects/model";
test("expiry notices distinguish the last 24 hours and elapsed retention", () => {
  const now = Date.parse("2026-11-04T00:00:00Z");
  assert.equal(expiryMessage("2026-11-07T00:00:00Z", now), "Expires in 3 days");
  assert.equal(
    expiryMessage("2026-11-04T05:01:00Z", now),
    "Expires in 6 hours",
  );
  assert.equal(expiryMessage("2026-11-03T00:00:00Z", now), "Files expired");
  assert.equal(storageBytes(5000000000), "5.00 GB");
});
const timeline = {
  version: 1,
  sources: [
    {
      id: "source",
      kind: "video",
      name: "video.mp4",
      sizeBytes: 100,
      mimeType: "video/mp4",
      sha256: "a".repeat(64),
      duration: 10,
    },
  ],
  clips: [{ id: "clip", sourceId: "source", start: 2, end: 8, speed: 0.5 }],
  hooks: [
    {
      id: "text",
      text: "Hello",
      start: 0,
      end: 3,
      x: 50,
      y: 50,
      font: "Georgia, serif",
      size: 40,
      color: "#ffffff",
      frame: true,
      fadeIn: 0.2,
      fadeOut: 0.2,
    },
  ],
  audio: {
    videoVolume: 1,
    musicVolume: 0.5,
    videoMuted: false,
    musicMuted: false,
  },
};
test("timeline saves cuts, speed, titles and audio without serializing video bytes", () => {
  const draft = parseProjectDraft({
    title: "My timeline",
    settings: DEFAULT_SETTINGS,
    source: null,
    status: "draft",
    multitrack: timeline,
  });
  const row = toRow(draft);
  assert.deepEqual(
    fromRow({
      ...row,
      id: "11111111-1111-4111-8111-111111111111",
      revision: 1,
      created_at: "2026-11-04",
      updated_at: "2026-11-04",
    }).multitrack,
    timeline,
  );
  assert.equal(JSON.stringify(row).includes("blob:"), false);
});
test("saved timelines reject missing sources, unsafe content, duplicate identities and invalid ranges", () => {
  assert.throws(() =>
    parseMultitrack({
      ...timeline,
      clips: [{ ...timeline.clips[0], sourceId: "unknown" }],
    }),
  );
  assert.throws(() =>
    parseMultitrack({
      ...timeline,
      clips: [{ ...timeline.clips[0], end: 11 }],
    }),
  );
  assert.throws(() =>
    parseMultitrack({
      ...timeline,
      sources: [timeline.sources[0], timeline.sources[0]],
    }),
  );
  assert.throws(() =>
    parseMultitrack({
      ...timeline,
      hooks: [{ ...timeline.hooks[0], color: "url(https://example.test)" }],
    }),
  );
  assert.throws(() =>
    parseMultitrack({
      ...timeline,
      audio: { ...timeline.audio, musicVolume: NaN },
    }),
  );
});
