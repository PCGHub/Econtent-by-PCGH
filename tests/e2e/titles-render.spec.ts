import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function shortProject(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/titles-studio");
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: /^Select title scene / })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Delete title scene", exact: true })
      .click();
  }
  await page.getByLabel("Scene duration (s)", { exact: true }).fill("1");
  await page.getByLabel("Scene duration (s)", { exact: true }).press("Tab");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page
    .getByLabel("Title output size", { exact: true })
    .selectOption("360");
}
async function rendered(page: Page) {
  await expect
    .poll(
      async () => {
        const error = await page
          .locator('main p[role="alert"]')
          .allTextContents();
        if (error.length) throw Error(error.join(" "));
        return page.getByLabel("Rendered titles MP4").count();
      },
      { timeout: 120000 },
    )
    .toBe(1);
  await expect(page.getByLabel("Rendered titles MP4")).toBeVisible();
}
async function downloaded(page: Page, path: string) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MP4", exact: true }).click();
  await (await download).saveAs(path);
}
function info(path: string) {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8" },
    ),
  );
}
function valid(path: string, width: number, height: number, duration: number) {
  const data = info(path);
  expect(data.streams.map((s: { codec_name: string }) => s.codec_name)).toEqual(
    ["h264", "aac"],
  );
  expect(data.streams[0].width).toBe(width);
  expect(data.streams[0].height).toBe(height);
  expect(Math.abs(Number(data.format.duration) - duration)).toBeLessThan(0.12);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    path,
    "-f",
    "null",
    "-",
  ]);
}
test("titles render real MP4, reuse downloads, invalidate edits, cancel and retry all four ratios", async ({
  page,
}) => {
  test.setTimeout(300000);
  const dir = mkdtempSync(join(tmpdir(), "titles-render-"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await shortProject(page);
    const start = Date.now();
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await rendered(page);
    await expect
      .poll(() =>
        page
          .getByLabel("Rendered titles MP4")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await downloaded(page, join(dir, "first.mp4"));
    valid(join(dir, "first.mp4"), 640, 360, 1);
    console.log(
      "Titles cold 360px/24fps/1s render milliseconds:",
      Date.now() - start,
    );
    await downloaded(page, join(dir, "again.mp4"));
    expect(
      readFileSync(join(dir, "first.mp4")).equals(
        readFileSync(join(dir, "again.mp4")),
      ),
    ).toBe(true);
    for (const [ratio, w, h] of [
      ["9:16", 360, 640],
      ["1:1", 360, 360],
      ["4:5", 360, 450],
    ] as const) {
      await page.getByLabel("Titles aspect ratio").selectOption(ratio);
      await expect(page.getByLabel("Rendered titles MP4")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Render Preview", exact: true })
        .click();
      await rendered(page);
      const path = join(dir, ratio.replace(":", "-") + ".mp4");
      await downloaded(page, path);
      valid(path, w, h, 1);
    }
    await page
      .getByLabel("Title output size", { exact: true })
      .selectOption("480");
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel title render", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel title render", exact: true })
      .click();
    await expect(
      page.getByText("Cancelled. No partial output accepted.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Rendered titles MP4")).toHaveCount(0);
    await page
      .getByLabel("Title output size", { exact: true })
      .selectOption("360");
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await rendered(page);
    await downloaded(page, join(dir, "retry.mp4"));
    valid(join(dir, "retry.mp4"), 360, 450, 1);
    expect(errors).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shared title raster matches encoded animation frames, styling, rotation and complete scrolling credits", async ({
  page,
}) => {
  test.setTimeout(300000);
  const dir = mkdtempSync(join(tmpdir(), "titles-parity-"));
  const run = (args: string[]) =>
    execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
      maxBuffer: 8 * 1048576,
    });
  try {
    await shortProject(page);
    await page.getByRole("tab", { name: "Text", exact: true }).click();
    await page.getByRole("button", { name: /^T2 · The Last/ }).click();
    await page.getByLabel("Title text content").fill("CINEMA\nIN MOTION");
    await page.getByLabel("Text color", { exact: true }).fill("#ffffff");
    await page.getByText("Position & transform", { exact: true }).click();
    await page.getByLabel("Text rotation", { exact: true }).fill("20");
    await page.getByLabel("Text rotation", { exact: true }).press("Tab");
    for (const effect of [
      "fade",
      "slide-up",
      "zoom",
      "typewriter",
      "word-reveal",
      "letter-reveal",
      "credit-roll",
    ]) {
      await page.getByRole("tab", { name: "Animation", exact: true }).click();
      await page.getByLabel("Title entrance effect").selectOption(effect);
      if (effect === "credit-roll")
        await page
          .getByRole("button", {
            name: "Fit complete credit roll",
            exact: true,
          })
          .click();
      await page
        .getByLabel("Titles scene scrubber", { exact: true })
        .fill("0.25");
      const reference = await page
        .getByLabel("Deterministic title animation", { exact: true })
        .evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png"));
      writeFileSync(
        join(dir, "reference.png"),
        Buffer.from(reference.split(",")[1], "base64"),
      );
      await page.getByRole("tab", { name: "Export", exact: true }).click();
      await page
        .getByRole("button", { name: "Render Preview", exact: true })
        .click();
      await rendered(page);
      const path = join(dir, effect + ".mp4");
      await downloaded(page, path);
      valid(path, 640, 360, 1);
      const expected = run([
          "-i",
          join(dir, "reference.png"),
          "-vf",
          "scale=640:360",
          "-frames:v",
          "1",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "-",
        ]),
        actual = run([
          "-ss",
          "0.25",
          "-i",
          path,
          "-frames:v",
          "1",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "-",
        ]);
      expect(actual.length).toBe(expected.length);
      let error = 0;
      for (let n = 0; n < actual.length; n++)
        error += Math.abs(actual[n] - expected[n]);
      const mae = error / actual.length;
      console.log("Titles preview/export MAE", effect, mae.toFixed(3));
      expect(mae).toBeLessThan(5);
      let foregroundError=0,foreground=0;
      for(let n=0;n<expected.length;n+=3){if(Math.max(expected[n],expected[n+1],expected[n+2])>90){foreground++;for(let c=0;c<3;c++)foregroundError+=Math.abs(actual[n+c]-expected[n+c]);}}
      expect(foreground).toBeGreaterThan(100);
      expect(foregroundError/(foreground*3)).toBeLessThan(35);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("multiple title scenes render image/video backgrounds, matching colors and timed audible looped audio", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "titles-backgrounds-"));
  const run = (args: string[]) =>
    execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
      cwd: dir,
      maxBuffer: 8 * 1048576,
    });
  try {
    run([
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x90",
      "-frames:v",
      "1",
      "red.png",
    ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=160x90:r=24",
      "-itsoffset",
      "0.2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "0.5",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "blue.mp4",
    ]);
    await shortProject(page);
    await page.getByRole("tab", { name: "Background", exact: true }).click();
    await page.getByLabel("Title background type").selectOption("image");
    await page
      .getByLabel("Upload title background")
      .setInputFiles(join(dir, "red.png"));
    await expect(page.getByAltText("Local scene background")).toBeVisible();
    await page
      .getByRole("button", { name: "Duplicate title scene", exact: true })
      .click();
    await page.getByLabel("Title background type").selectOption("video");
    await page
      .getByLabel("Upload title background")
      .setInputFiles(join(dir, "blue.mp4"));
    await expect(page.getByLabel("Titles background video")).toBeVisible();
    await page.getByLabel("Loop background video").check();
    await page.getByLabel("Titles preview volume").fill("0.5");
    await page.getByRole("tab", { name: "Export", exact: true }).click();
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await rendered(page);
    await downloaded(page, join(dir, "backgrounds.mp4"));
    valid(join(dir, "backgrounds.mp4"), 640, 360, 2);
    for (const [time, red] of [
      [0.5, true],
      [23/24, true],
      [1, false],
      [1.75, false],
    ] as const) {
      const pixel = run([
        "-ss",
        String(time),
        "-i",
        "backgrounds.mp4",
        "-vf",
        "crop=2:2:40:180,format=rgb24",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-",
      ]);
      expect(pixel[red ? 0 : 2]).toBeGreaterThan(120);
      expect(pixel[red ? 2 : 0]).toBeLessThan(35);
    }
    for (const [time, audible] of [
      [0.25, false],
      [1.05, false],
      [1.3, true],
      [1.55, false],
      [1.8, true],
    ] as const) {
      const pcm = run([
        "-ss",
        String(time),
        "-i",
        "backgrounds.mp4",
        "-t",
        "0.1",
        "-ar",
        "48000",
        "-ac",
        "1",
        "-f",
        "f32le",
        "-",
      ]);
      let energy = 0;
      for (let n = 0; n < pcm.length; n += 4) energy += pcm.readFloatLE(n) ** 2;
      const rms = Math.sqrt(energy / (pcm.length / 4));
      expect(
        audible ? rms > 0.02 : rms < 0.001,
        `Audio at ${time}s: RMS ${rms}`,
      ).toBe(true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("titles FFmpeg download failure is actionable and explicit retry creates a working worker", async ({
  page,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "titles-recovery-"));
  try {
    await shortProject(page);
    let attempts = 0;
    await page.route("**/core/ffmpeg-core.wasm", (route) => {
      attempts++;
      return route.abort();
    });
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await expect(page.locator('main p[role="alert"]')).toContainText(
      /FFmpeg|fetch|network/i,
      { timeout: 30000 },
    );
    expect(attempts).toBeGreaterThan(0);
    await expect(page.getByLabel("Rendered titles MP4")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Render Preview", exact: true }),
    ).toBeEnabled();
    await page.unroute("**/core/ffmpeg-core.wasm");
    await page
      .getByRole("button", { name: "Render Preview", exact: true })
      .click();
    await rendered(page);
    await downloaded(page, join(dir, "recovered.mp4"));
    valid(join(dir, "recovered.mp4"), 640, 360, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
