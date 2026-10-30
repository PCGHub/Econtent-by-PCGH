import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_DRAFT,
  parseProjectDraft,
  toRow,
  fromRow,
  projectSignature,
  type Project,
} from "../lib/projects/model";
import { safeNextPath } from "../lib/auth/navigation";
import { SaveQueue } from "../lib/projects/autosave";
const project: Project = {
  ...EMPTY_DRAFT,
  id: "01a40c17-5938-4df8-8830-161333fe330b",
  revision: 1,
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
};
test("project validation rejects ownership, media payloads, invalid ranges and fingerprints", () => {
  assert.deepEqual(parseProjectDraft(EMPTY_DRAFT), EMPTY_DRAFT);
  for (const extra of [
    { owner_id: "attacker" },
    { media: "base64" },
    { revision: 8 },
  ])
    assert.throws(() => parseProjectDraft({ ...EMPTY_DRAFT, ...extra }));
  assert.throws(() =>
    parseProjectDraft({
      ...EMPTY_DRAFT,
      settings: { ...EMPTY_DRAFT.settings, range: { start: NaN, end: 4 } },
    }),
  );
  assert.throws(() =>
    parseProjectDraft({
      ...EMPTY_DRAFT,
      settings: { ...EMPTY_DRAFT.settings, compression: "balanced" },
    }),
  );
  const source = {
    name: "video.mp4",
    sizeBytes: 1024,
    durationSeconds: 30,
    width: 1280,
    height: 720,
    mimeType: "video/mp4",
    sha256: "a".repeat(64),
  };
  const valid = {
    ...EMPTY_DRAFT,
    source,
    settings: { ...EMPTY_DRAFT.settings, range: { start: 1.25, end: 20 } },
  };
  assert.deepEqual(parseProjectDraft(valid), valid);
  assert.throws(() =>
    parseProjectDraft({ ...valid, source: { ...source, bytes: "private" } }),
  );
  assert.throws(() =>
    parseProjectDraft({ ...valid, source: { ...source, sha256: "wrong" } }),
  );
  assert.throws(() =>
    parseProjectDraft({
      ...valid,
      settings: { ...valid.settings, range: { start: 0, end: 31 } },
    }),
  );
  assert.equal(
    projectSignature(
      fromRow({
        ...toRow(valid),
        id: project.id,
        revision: 1,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      }),
    ),
    projectSignature(valid),
  );
});
test("auth redirects stay within known application paths", () => {
  for (const value of [
    "//evil.example",
    "https://evil.example",
    "/\\evil",
    "/auth/callback",
    "/projects/abc\r\nLocation:x",
  ])
    assert.equal(safeNextPath(value), "/dashboard");
  assert.equal(
    safeNextPath("/projects/" + project.id),
    "/projects/" + project.id,
  );
  assert.equal(safeNextPath("/reset-password"), "/reset-password");
});
test("autosave coalesces concurrent edits and uses the returned revision", async () => {
  const writes: { revision: number; title: string }[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new SaveQueue(
    project,
    async (revision, draft) => {
      writes.push({ revision, title: draft.title });
      if (writes.length === 1) await gate;
      return { ...project, ...draft, revision: revision + 1 };
    },
    () => {},
  );
  queue.enqueue({ ...EMPTY_DRAFT, title: "First" });
  const first = queue.flush();
  queue.enqueue({ ...EMPTY_DRAFT, title: "Second" });
  queue.enqueue({ ...EMPTY_DRAFT, title: "Latest" });
  const second = queue.flush();
  release();
  await Promise.all([first, second]);
  assert.deepEqual(writes, [
    { revision: 1, title: "First" },
    { revision: 2, title: "Latest" },
  ]);
});
test("autosave failure retains edits and does not advance revision", async () => {
  let attempts = 0;
  const revisions: number[] = [];
  const queue = new SaveQueue(
    project,
    async (revision, draft) => {
      revisions.push(revision);
      if (attempts++ === 0) throw new Error("Offline");
      return { ...project, ...draft, revision: revision + 1 };
    },
    () => {},
  );
  queue.enqueue({ ...EMPTY_DRAFT, title: "Retained" });
  await assert.rejects(queue.flush(), /Offline/);
  await queue.flush();
  assert.deepEqual(revisions, [1, 1]);
});

test('composition metadata round trips with strict local-only source identities',()=>{
 const value={title:'Overlay draft',settings:{mode:'manual-trim',range:{start:0,end:2},clipDuration:30,keepRemainder:true,compression:'off',cutStrategy:'precision'},source:{name:'main.mp4',sizeBytes:100,durationSeconds:4,width:320,height:180,mimeType:'video/mp4',sha256:'a'.repeat(64)},status:'draft',composition:{settings:{version:1,layout:'pip',ratio:'9:16',resolution:360,fps:30,trimStart:0,trimEnd:2,overlayStart:0,overlayEnd:2,secondaryStart:0,split:.5,x:.65,y:.65,width:.3,height:.3,opacity:1,mainFit:'cover',overlayFit:'cover',mainCropX:.5,mainCropY:.5,cropX:.5,cropY:.5,audio:'main',mainVolume:1,secondaryVolume:1},layer:{kind:'image',name:'photo.png',sizeBytes:100,durationSeconds:0,width:160,height:160,mimeType:'image/png',sha256:'b'.repeat(64)}}};
 const parsed=parseProjectDraft(value),row=toRow(parsed);assert.deepEqual(row.composition,parsed.composition);
 assert.throws(()=>parseProjectDraft({...value,composition:{...value.composition,layer:{...value.composition.layer,url:'https://example.com'}}}));
 assert.throws(()=>parseProjectDraft({...value,composition:{...value.composition,settings:{...value.composition.settings,trimEnd:3}}}));
});
