import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const fixtures = process.env.ECONTENT_BACKGROUND_FIXTURE_DIR;
function generated(duration = 3, rate = 25) {
  const dir = mkdtempSync(join(tmpdir(), "econtent-person-"));
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-loop",
    "1",
    "-i",
    "tests/fixtures/person.jpg",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    String(duration),
    "-vf",
    "scale=360:450",
    "-r",
    String(rate),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    join(dir, "presenter.mp4"),
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=640x360",
    "-frames:v",
    "1",
    join(dir, "background.png"),
  ]);
  return dir;
}
async function open(page: Page, dir: string, file = "presenter.mp4") {
  await page.goto("/ai-background");
  await page
    .getByLabel("Upload video", { exact: true })
    .setInputFiles(join(dir, file));
  await page
    .getByLabel("Replacement image", { exact: true })
    .setInputFiles(join(dir, "background.png"));
  await expect(
    page.getByRole("button", {
      name: "Export short video (WebM)",
      exact: true,
    }),
  ).toBeEnabled({ timeout: 60000 });
}
async function pixels(page: Page) {
  return await page
    .getByLabel("Background composition preview", { exact: true })
    .evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!,
        w = c.width,
        h = c.height;
      const point = (x: number, y: number) =>
        Array.from(
          ctx.getImageData(Math.floor(w * x), Math.floor(h * y), 1, 1).data,
        );
      return {
        w,
        h,
        face: point(0.5, 0.28),
        corner: point(0.02, 0.02),
        middle: point(0.5, 0.5),
      };
    });
}
async function download(page: Page, dir: string, name: string) {
  const link = page.getByRole("link", { name: "Download result", exact: true });
  const failure = page
    .locator('p[role="status"]')
    .filter({
      hasText:
        /Export aborted|No reliable person|No valid segmented|timed out|stopped responding|could not|cannot|exceeded|Export cancelled/i,
    })
    .first();
  await Promise.race([
    link.waitFor({ state: "visible", timeout: 800000 }),
    failure.waitFor({ state: "visible", timeout: 800000 }).then(async () => {
      throw Error(await failure.innerText());
    }),
  ]);
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download result", exact: true })
    .click();
  const path = join(dir, name);
  await (await waiting).saveAs(path);
  const decoded = spawnSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  expect(decoded.status).toBe(0);
  expect(decoded.stderr.trim()).toBe("");
  return path;
}
function mediaInfo(path: string) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8" },
    ),
  );
}

test("real model preserves opaque person and replacement together; mask diagnostics and paused-frame settings work", async ({
  page,
}) => {
  const dir = generated(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let externalModels = 0;
  page.on("request", (r) => {
    if (
      /mediapipe|segmentation.*wasm/.test(r.url()) &&
      new URL(r.url()).origin !== "http://localhost:3000"
    )
      externalModels++;
  });
  try {
    await open(page, dir);
    const p = await pixels(page);
    expect(p.corner[0]).toBeLessThan(5);
    expect(p.corner[1]).toBeLessThan(5);
    expect(p.corner[2]).toBeGreaterThan(250);
    expect(p.corner[3]).toBe(255);
    expect(p.face[0]).toBeGreaterThan(70);
    expect(p.face[3]).toBe(255);
    await page.getByText("Mask diagnostics", { exact: true }).click();
    await expect(page.getByTestId("mask-diagnostics")).toContainText(
      "Body checks passed",
    );
    await expect(page.getByTestId("mask-diagnostics")).toContainText("G 0–0");
    await page.getByLabel("Segmentation preview view").selectOption("mask");
    const m = await pixels(page);
    expect(m.corner[0]).toBeLessThan(10);
    expect(m.face[0]).toBeGreaterThan(245);
    await expect(
      page.getByRole("button", {
        name: "Export short video (WebM)",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByLabel("Segmentation preview view")
      .selectOption("composite");
    await page
      .getByLabel("Person mask threshold:", { exact: false })
      .press("ArrowRight");
    await expect
      .poll(async () => (await pixels(page)).face[0])
      .toBeGreaterThan(70);
    await page
      .getByRole("button", { name: "Export short video (WebM)", exact: true })
      .click();
    const path = await download(page, dir, "result.webm"),
      info = mediaInfo(path);
    expect(
      info.streams.map((s: { codec_type: string }) => s.codec_type).sort(),
    ).toEqual(["audio", "video"]);
    expect(Number(info.format.duration)).toBeGreaterThan(2.8);
    expect(Number(info.format.duration)).toBeLessThan(3.6);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      "1",
      "-i",
      path,
      "-frames:v",
      "1",
      join(dir, "export.png"),
    ]);
    const pcm = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      path,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "s16le",
      "-",
    ]);
    let energy = 0;
    for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
    expect(Math.sqrt(energy / (pcm.length / 2))).toBeGreaterThan(100);
    expect(errors).toEqual([]);
    expect(externalModels).toBe(0);
    console.log(
      JSON.stringify({
        personPixels: p,
        output: info.streams.map(
          (s: { codec_name: string; width?: number; height?: number }) => ({
            codec: s.codec_name,
            width: s.width,
            height: s.height,
          }),
        ),
        duration: info.format.duration,
        audioRMS: Math.sqrt(energy / (pcm.length / 2)),
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("canvas-result fallback is snapshotted; touch layout, seek, image fit, cancellation and retry work", async ({
  browser,
}) => {
  const dir = generated(20),
    context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  // Exercise the SDK's reusable HTMLCanvasElement fallback instead of ImageBitmap.
  await context.addInitScript(() => {
    Object.defineProperty(window, "OffscreenCanvas", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "createImageBitmap", {
      value: undefined,
      configurable: true,
    });
  });
  try {
    await open(page, dir);
    expect((await pixels(page)).face[0]).toBeGreaterThan(70);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Background framing").selectOption("contain");
    await page.getByLabel("Replacement colour").fill("#ff0000");
    await expect
      .poll(async () => (await pixels(page)).corner)
      .toEqual([255, 0, 0, 255]);
    await page
      .getByLabel("Original background source")
      .evaluate((v: HTMLVideoElement) => {
        v.currentTime = 1.5;
      });
    await page.getByText("Mask diagnostics", { exact: true }).click();
    await expect(page.getByTestId("mask-diagnostics")).toContainText(
      "frame 1.500",
    );
    await expect(page.getByTestId("mask-diagnostics")).toContainText(
      "HTMLCanvasElement",
    );
    await page
      .getByRole("button", { name: "Export short video (WebM)", exact: true })
      .tap();
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .tap();
    await expect(
      page.getByText("Export cancelled.", { exact: false }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole("link", { name: "Download result", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Export short video (WebM)",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("losing the person midway aborts export with a timestamp and no partial download", async ({
  page,
}) => {
  const dir = generated(2, 12);
  try {
    // Same decoded geometry throughout: a real person followed by a blank frame.
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      join(dir, "presenter.mp4"),
      "-vf",
      "drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(t,0.5)'",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      join(dir, "loss.mp4"),
    ]);
    await open(page, dir, "loss.mp4");
    await page.getByLabel("Export frame rate").selectOption("12");
    const downloads: string[] = [];
    page.on("download", (d) => downloads.push(d.suggestedFilename()));
    await page
      .getByRole("button", { name: "Export short video (WebM)", exact: true })
      .click();
    await expect(
      page
        .locator('p[role="status"]')
        .filter({ hasText: /Export aborted at [0-9.]+ s:.*person/i }),
    ).toBeVisible({ timeout: 90000 });
    await expect(
      page
        .locator('p[role="status"]')
        .filter({ hasText: "No partial output was saved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download result", exact: true }),
    ).toHaveCount(0);
    expect(downloads).toEqual([]);
    // Returning to a clear frame recovers preview detection without bypassing checks.
    await page
      .getByLabel("Original background source", { exact: true })
      .evaluate((v: HTMLVideoElement) => {
        v.currentTime = 0;
      });
    await expect(
      page.getByRole("button", {
        name: "Export short video (WebM)",
        exact: true,
      }),
    ).toBeEnabled({ timeout: 60000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("blank video produces explicit no-person diagnostics and no export", async ({
  page,
}) => {
  const dir = generated();
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:d=1",
      "-c:v",
      "libx264",
      join(dir, "blank.mp4"),
    ]);
    await page.goto("/ai-background");
    await page
      .getByLabel("Upload video", { exact: true })
      .setInputFiles(join(dir, "blank.mp4"));
    await expect(
      page
        .getByText(
          /No (reliable )?person detected|No measurable person detected/,
        )
        .first(),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("button", {
        name: "Export short video (WebM)",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Retry person detection", exact: true })
      .click();
    await expect(
      page
        .getByText(
          /No (reliable )?person detected|No measurable person detected/,
        )
        .first(),
    ).toBeVisible({ timeout: 60000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("full-body extended arms and legs survive real model composition and export", async ({
  page,
}) => {
  test.skip(
    !fixtures || !process.env.ECONTENT_BACKGROUND_FULL_BODY,
    "Provide an authorized local full-body.mp4 fixture",
  );
  const dir = resolve(fixtures!);
  await open(page, dir, "full-body.mp4");
  await page.getByText("Mask diagnostics", { exact: true }).click();
  await expect(page.getByTestId("person-quality")).toContainText(
    "8/8 limb segments",
  );
  await page.getByLabel("Include original audio mix track").uncheck();
  await page.getByLabel("Export frame rate").selectOption("12");
  await page
    .getByRole("button", { name: "Export short video (WebM)", exact: true })
    .click();
  const result = await download(page, dir, "full-body-result.webm");
  // The muxer's silent WebM duration ends at the last frame timestamp; require
  // every source-timed frame, and metadata within one selected frame interval.
  expect(Math.abs(Number(mediaInfo(result).format.duration) - 2)).toBeLessThan(
    1 / 12 + 0.002,
  );
  expect(
    Number(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-count_frames",
          "-show_entries",
          "stream=nb_read_frames",
          "-of",
          "csv=p=0",
          result,
        ],
        { encoding: "utf8" },
      ).trim(),
    ),
  ).toBe(24);
  const pixel = (x: number, y: number) => [
    ...execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      "1",
      "-i",
      result,
      "-vf",
      `format=rgb24,crop=1:1:${x}:${y}`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-",
    ]),
  ];
  // Fixture: extended arms at 30–32% height; bare lower legs at 86% height.
  for (const [x, y] of [
    [210, 223],
    [503, 225],
    [250, 415],
    [480, 422],
  ]) {
    const p = pixel(x, y);
    expect(p[0]).toBeGreaterThan(40); // skin remains, rather than pure-blue replacement
  }
  const bg = pixel(10, 10);
  expect(bg[0]).toBeLessThan(10);
  expect(bg[2]).toBeGreaterThan(240);
});
test("ordinary moving presenter: portrait source with landscape replacement exports video and speech", async ({
  page,
}) => {
  test.skip(
    !fixtures,
    "Set ECONTENT_BACKGROUND_FIXTURE_DIR to public-domain moving presenter fixtures.",
  );
  const dir = resolve(fixtures!);
  await open(page, dir, "portrait-presenter.mp4");
  await page
    .getByLabel("Background composition preview", { exact: true })
    .screenshot({ path: "test-results/background-portrait-composite.png" });
  await page
    .getByRole("button", { name: "Export short video (WebM)", exact: true })
    .click();
  const path = await download(page, dir, "portrait-result.webm"),
    info = mediaInfo(path);
  expect(
    info.streams.find((s: { codec_type: string }) => s.codec_type === "video")
      .width,
  ).toBe(360);
  expect(
    info.streams.find((s: { codec_type: string }) => s.codec_type === "video")
      .height,
  ).toBe(640);
  expect(Number(info.format.duration)).toBeGreaterThan(5.8);
  const pcm = (file: string) => {
    const b = execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      file,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "f32le",
      "-",
    ]);
    return new Float32Array(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    );
  };
  const original = pcm(join(dir, "portrait-presenter.mp4")),
    encoded = pcm(path);
  let correlation = -1,
    lagSamples = 0;
  for (let lag = -800; lag <= 800; lag += 2) {
    let ab = 0,
      aa = 0,
      bb = 0;
    for (
      let i = 4000;
      i < Math.min(original.length, encoded.length) - 4000;
      i += 8
    ) {
      ab += original[i] * encoded[i + lag];
      aa += original[i] ** 2;
      bb += encoded[i + lag] ** 2;
    }
    const value = ab / Math.sqrt(aa * bb);
    if (value > correlation) {
      correlation = value;
      lagSamples = lag;
    }
  }
  expect(correlation).toBeGreaterThan(0.98);
  expect(Math.abs(lagSamples / 8)).toBeLessThan(30);
  const patch = (
    file: string,
    time: number,
    x: number,
    y: number,
    size = 1,
  ) => [
    ...execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      file,
      "-vf",
      `format=rgb24,crop=${size}:${size}:${x}:${y}`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-",
    ]),
  ];
  const faces: number[][] = [];
  for (const time of [1, 3, 5]) {
    const face = patch(path, time, 164, 176, 32),
      source = patch(join(dir, "portrait-presenter.mp4"), time, 164, 176, 32),
      corner = patch(path, time, 7, 12);
    expect(corner[0]).toBeLessThan(10);
    expect(corner[2]).toBeGreaterThan(240);
    expect(
      face.reduce((n, v, i) => n + Math.abs(v - source[i]), 0) / face.length,
    ).toBeLessThan(20);
    faces.push(face);
  }
  expect(
    faces[0].reduce((n, v, i) => n + Math.abs(v - faces[2][i]), 0) /
      faces[0].length,
  ).toBeGreaterThan(2);
  console.log(
    JSON.stringify({
      audioCorrelation: correlation,
      audioLagMs: lagSamples / 8,
      exportedForegroundAndReplacementCheckedAt: [1, 3, 5],
    }),
  );
  console.log(
    JSON.stringify({
      movingPresenter: true,
      info: info.streams.map((s: { codec_name: string }) => s.codec_name),
      duration: info.format.duration,
    }),
  );
});
test("three-minute real moving presenter encodes source timestamps without wall-clock drift", async ({
  page,
}) => {
  test.skip(
    !fixtures || !process.env.ECONTENT_BACKGROUND_LONG,
    "Set ECONTENT_BACKGROUND_LONG=1 for the real-time three-minute test.",
  );
  test.setTimeout(900000);
  const dir = resolve(fixtures!);
  await open(page, dir, "presenter-180.mp4");
  await page
    .getByLabel("Export frame rate", { exact: true })
    .selectOption("12");
  await page
    .getByRole("button", { name: "Export short video (WebM)", exact: true })
    .click();
  const path = await download(page, dir, "long-result.webm"),
    info = mediaInfo(path);
  expect(Number(info.format.duration)).toBeGreaterThan(179.5);
  expect(Number(info.format.duration)).toBeLessThan(182);
  expect(
    info.streams.map((s: { codec_type: string }) => s.codec_type).sort(),
  ).toEqual(["audio", "video"]);
  console.log(
    JSON.stringify({
      longExportSeconds: info.format.duration,
      bytes: info.format.size,
    }),
  );
});

test("unsupported browser encoding and damaged images fail clearly without fallback exports", async ({
  page,
}) => {
  const dir = generated();
  await page.addInitScript(() =>
    Object.defineProperty(window, "VideoEncoder", {
      value: undefined,
      configurable: true,
    }),
  );
  try {
    await open(page, dir);
    await page
      .getByRole("button", { name: "Export short video (WebM)", exact: true })
      .click();
    await expect(
      page.getByText(/lacks WebCodecs video encoding/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download result", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Replacement image", { exact: true }).setInputFiles({
      name: "damaged.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /replacement image could not decode/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Export short video (WebM)",
        exact: true,
      }),
    ).toBeDisabled();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("chroma key remains functional and exports an explicit silent WebM", async ({
  page,
}) => {
  const dir = generated();
  try {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x00ff00:s=320x180:d=1,drawbox=x=80:y=30:w=160:h=150:color=red:t=fill",
      "-c:v",
      "libx264",
      join(dir, "green.mp4"),
    ]);
    await page.goto("/ai-background");
    await page
      .getByLabel("Removal method", { exact: false })
      .selectOption("chroma");
    await page
      .getByLabel("Upload video", { exact: true })
      .setInputFiles(join(dir, "green.mp4"));
    await page
      .getByLabel("Replacement image", { exact: true })
      .setInputFiles(join(dir, "background.png"));
    await page.getByLabel("Include original audio mix track").uncheck();
    await expect(
      page.getByRole("button", {
        name: "Export short video (WebM)",
        exact: true,
      }),
    ).toBeEnabled();
    const preview = await pixels(page);
    expect(preview.corner[2]).toBeGreaterThan(240);
    expect(preview.middle[0]).toBeGreaterThan(240);
    await page
      .getByRole("button", { name: "Export short video (WebM)", exact: true })
      .click();
    const path = await download(page, dir, "chroma.webm");
    expect(
      mediaInfo(path).streams.map((s: { codec_type: string }) => s.codec_type),
    ).toEqual(["video"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("low frame-rate input can repeat decoded frames on a 24fps export without stalling", async ({
  page,
}) => {
  const dir = generated(1, 12);
  try {
    await open(page, dir);
    await page.getByLabel("Include original audio mix track").uncheck();
    await page
      .getByRole("button", { name: "Export short video (WebM)", exact: true })
      .click();
    const path = await download(page, dir, "low-fps.webm");
    expect(Number(mediaInfo(path).format.duration)).toBeCloseTo(1, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
