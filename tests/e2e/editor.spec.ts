import { assertStreamCopySync } from "../media-assertions";
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    console.error(
      "EDITOR FAILURE STATE:",
      await page.locator("body").innerText(),
    );
});

test("browser worker trims 30 seconds, compresses, previews and downloads real MP4", async ({
  page,
}, info) => {
  page.on("pageerror", (error) =>
    console.error("BROWSER ERROR:", error.message),
  );
  const dir = mkdtempSync(join(tmpdir(), "econtent-browser-"));
  try {
    const input = join(dir, "input.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "35",
      "-c:v",
      "libx264",
      "-g",
      "300",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      input,
    ]);
    await page.goto("/");
    await page.getByRole("button", { name: "Start editing free" }).click();
    await page.getByLabel("Choose video", { exact: true }).setInputFiles(input);
    await expect(page.getByText(/35.000 seconds/)).toBeVisible();
    await page
      .getByLabel("Cut method", { exact: true })
      .selectOption("precision");
    await page.getByLabel("Start (seconds)", { exact: false }).fill("1.25");
    await page.getByLabel("End (seconds)", { exact: false }).fill("31.25");
    await page
      .getByLabel("Compression", { exact: true })
      .selectOption("balanced");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible({ timeout: 150000 });
    await expect(page.getByTestId("overall-percentage")).toHaveText("100%");
    await expect(
      page.getByText("MP4 exports ready.", { exact: false }),
    ).toBeVisible({ timeout: 150000 });
    const preview = page.getByLabel("Preview econtent-001.mp4");
    await preview.evaluate((video: HTMLVideoElement) => video.load());
    await expect
      .poll(() => preview.evaluate((video: HTMLVideoElement) => video.duration))
      .toBeCloseTo(30, 0);
    await preview.evaluate((video: HTMLVideoElement) => video.play());
    await expect
      .poll(() =>
        preview.evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(0);
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download MP4", exact: true })
      .click();
    const download = await pending;
    const output = info.outputPath("actual-output.mp4");
    await download.saveAs(output);
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    expect(Math.abs(Number(probe.format.duration) - 30)).toBeLessThan(0.05);
    expect(
      probe.streams.map((stream: { codec_name: string }) => stream.codec_name),
    ).toEqual(["h264", "aac"]);
    const zipPending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download all ZIP" }).click();
    const zip = await zipPending;
    const zipPath = info.outputPath("clips.zip");
    await zip.saveAs(zipPath);
    execFileSync("unzip", ["-t", zipPath]);
    await page.getByLabel("Mode", { exact: true }).selectOption("full-split");
    await page.getByLabel("Clip length (seconds)", { exact: false }).fill("10");
    await page.getByLabel("Compression", { exact: true }).selectOption("off");
    await page
      .getByLabel("Cut method", { exact: true })
      .selectOption("precision");
    await page.evaluate(() => {
      const state = window as unknown as {
        measuredProgress: { value: number | null; state: string }[];
      };
      state.measuredProgress = [];
      const panel = document.querySelector('[aria-label="Processing status"]')!;
      new MutationObserver(() => {
        const bar = panel.querySelector("progress")!;
        state.measuredProgress.push({
          value: bar.hasAttribute("value")
            ? Number(bar.getAttribute("value"))
            : null,
          state: panel.querySelector("h2")?.textContent ?? "",
        });
      }).observe(panel, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
    });
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Download MP4", exact: true }),
    ).toHaveCount(4, { timeout: 150000 });
    await expect(
      page.getByRole("button", { name: "Download all ZIP" }),
    ).toBeEnabled();
    const progressSamples = await page.evaluate(
      () =>
        (
          window as unknown as {
            measuredProgress: { value: number | null; state: string }[];
          }
        ).measuredProgress,
    );
    const measured = progressSamples.filter((sample) => sample.value !== null);
    expect(
      measured.some((sample) => sample.value! > 0 && sample.value! < 1),
    ).toBe(true);
    expect(
      measured.every(
        (sample, i) => !i || sample.value! >= measured[i - 1].value!,
      ),
    ).toBe(true);
    expect(
      measured
        .filter((sample) => sample.value === 1)
        .every((sample) => sample.state === "Completed"),
    ).toBe(true);

    const bundlePending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download all ZIP" }).click();
    const bundle = await bundlePending;
    const bundlePath = info.outputPath("split-clips.zip");
    await bundle.saveAs(bundlePath);
    const entries = execFileSync("unzip", ["-Z1", bundlePath], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(entries).toHaveLength(4);
    const extraction = info.outputPath("extracted");
    execFileSync("unzip", ["-q", bundlePath, "-d", extraction]);
    for (const [index, entry] of entries.entries()) {
      const duration = Number(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            join(extraction, entry),
          ],
          { encoding: "utf8" },
        ),
      );
      expect(Math.abs(duration - (index === 3 ? 5 : 10))).toBeLessThan(0.05);
    }
    await page.getByRole("checkbox").nth(1).uncheck();
    const subsetPending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download selected ZIP (3)", exact: true })
      .click();
    const subset = await subsetPending;
    const subsetPath = info.outputPath("subset.zip");
    await subset.saveAs(subsetPath);
    expect(
      execFileSync("unzip", ["-Z1", subsetPath], { encoding: "utf8" })
        .trim()
        .split("\n"),
    ).toHaveLength(3);
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel processing", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Process video", exact: true }),
    ).toBeEnabled();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Fast Cut progress, compatible exports, source reuse and mobile cancellation controls", async ({
  page,
}, info) => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-fast-browser-"));
  try {
    const input = join(dir, "fast.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=color=pink:sample_rate=48000:seed=1",
      "-t",
      "35",
      "-c:v",
      "libx264",
      "-g",
      "300",
      "-keyint_min",
      "300",
      "-sc_threshold",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      input,
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Start editing free" }).click();
    await page.getByLabel("Choose video", { exact: true }).setInputFiles(input);
    await expect(page.getByText(/35.000 seconds/)).toBeVisible();
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "fast",
    );
    await page.getByLabel("Mode", { exact: true }).selectOption("full-split");
    await page.getByLabel("Clip length (seconds)", { exact: false }).fill("10");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel processing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", {
        name: "Overall job progress",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download MP4", exact: true }),
    ).toHaveCount(4, { timeout: 150000 });
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("overall-percentage")).toHaveText("100%");
    await expect(
      page.locator("article").getByText("Stream copy", { exact: false }),
    ).toHaveCount(4);
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download all ZIP", exact: true })
      .click();
    const zip = await pending;
    const path = info.outputPath("fast-clips.zip");
    await zip.saveAs(path);
    execFileSync("unzip", ["-t", path]);
    const extracted = info.outputPath("fast-extracted");
    execFileSync("unzip", ["-q", path, "-d", extracted]);
    const names = execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
      .trim()
      .split("\n");
    expect(names).toHaveLength(4);
    for (const [i, name] of names.entries()) {
      const data = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            join(extracted, name),
          ],
          { encoding: "utf8" },
        ),
      );
      expect(
        Math.abs(Number(data.format.duration) - (i === 3 ? 5 : 10)),
      ).toBeLessThan(0.5);
      expect(data.streams[0].codec_name).toBe("h264");
      expect(data.streams[1].codec_name).toBe("aac");
      expect(assertStreamCopySync(input, join(extracted, name))).toBeLessThan(
        0.003,
      );
    }
    await page
      .getByLabel("Compression", { exact: true })
      .selectOption("balanced");
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "precision",
    );
    await expect(page.getByLabel("Cut method", { exact: true })).toBeDisabled();
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    const cancel = page.getByRole("button", {
      name: "Cancel processing",
      exact: true,
    });
    await expect(cancel).toBeInViewport();
    await cancel.click();
    await expect(
      page.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Android-like UI defaults to Fast Cut, confirms Precision and never falls back silently", async ({
  browser,
}, info) => {
  // UA/viewport emulation verifies UI policy only. This is not Android hardware or an Android benchmark.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  const dir = mkdtempSync(join(tmpdir(), "econtent-mobile-policy-"));
  try {
    const input = join(dir, "mobile.mp4");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "35",
      "-c:v",
      "libx264",
      "-g",
      "60",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      input,
    ]);
    await page.goto("/editor");
    await page.getByLabel("Choose video", { exact: true }).setInputFiles(input);
    await expect(
      page.getByText("35.000 seconds", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("processing-method")).toContainText(
      "Fast Cut",
    );
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "fast",
    );
    await page.getByLabel("Mode", { exact: true }).selectOption("full-split");
    await page.getByLabel("Clip length (seconds)", { exact: false }).fill("10");
    const original = page.getByLabel("Original video", { exact: true });
    await original.evaluate(async (video: HTMLVideoElement) => {
      video.muted = true;
      await video.play();
    });
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect
      .poll(() => original.evaluate((video: HTMLVideoElement) => video.paused))
      .toBe(true);
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("processing-method")).toContainText(
      "Fast Cut",
    );
    await expect(page.getByTestId("completed-clips")).toHaveText(
      "Completed clips: 4 of 4",
    );
    await expect(page.getByLabel("Video workload")).toContainText(
      "30 fps average",
    );
    await expect(page.locator("article video").first()).toHaveAttribute(
      "preload",
      "none",
    );
    await page
      .getByLabel("Compression", { exact: true })
      .selectOption("balanced");
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "precision",
    );
    await page.getByLabel("Compression", { exact: true }).selectOption("off");
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "fast",
    );
    await page
      .getByLabel("Cut method", { exact: true })
      .selectOption("precision");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(page.getByLabel("Confirm precision workload")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Continue with Precision Cut",
        exact: true,
      }),
    ).toBeInViewport();
    await expect(page.locator("article")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Use Fast Cut instead", exact: true })
      .click();
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "fast",
    );
    await expect(page.getByLabel("Confirm precision workload")).toHaveCount(0);
    await page
      .getByLabel("Cut method", { exact: true })
      .selectOption("precision");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue with Precision Cut", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("processing-method")).toContainText(
      "Precision Cut",
    );
    await expect(page.getByTestId("completed-clips")).toHaveText(
      "Completed clips: 4 of 4",
    );
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue with Precision Cut", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel processing", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible();
    const webm = join(dir, "vp9.webm");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-t",
      "3",
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      webm,
    ]);
    await page.getByLabel("Choose video", { exact: true }).setInputFiles(webm);
    await expect(
      page.getByText("3.000 seconds", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("processing-method")).toContainText(
      "Fast Cut",
    );
    await page.getByLabel("Mode", { exact: true }).selectOption("manual-trim");
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "fast",
    );
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(page.locator("section").getByRole("alert")).toContainText(
      "Fast Cut did not start",
    );
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
      "fast",
    );
    await expect(
      page.getByRole("button", { name: "Choose Precision Cut instead" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("mobile-policy-not-android-hardware.png"),
      fullPage: true,
    });
  } catch (error) {
    console.error("MOBILE POLICY UI:", await page.locator("body").innerText());
    throw error;
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codec inspection distinguishes MP3/MOV/Matroska remux from unsupported MP4 codecs", async ({
  page,
}, info) => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-codecs-"));
  const run = (args: string[]) =>
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...args,
    ]);
  try {
    const source = join(dir, "source.mp4");
    run([
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "8",
      "-c:v",
      "libx264",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      source,
    ]);
    const cases = [
      ["mp3.mp4", "libmp3lame", "mp3"],
      ["sample.mov", "copy", "aac"],
      ["sample.mkv", "copy", "aac"],
    ] as const;
    await page.goto("/editor");
    for (const [name, audio, codec] of cases) {
      const input = join(dir, name);
      run(["-i", source, "-c:v", "copy", "-c:a", audio, input]);
      await page
        .getByLabel("Choose video", { exact: true })
        .setInputFiles(input);
      await page
        .getByRole("button", { name: "Check codec compatibility", exact: true })
        .click();
      const details = page.getByRole("complementary", {
        name: "Video workload",
      });
      await expect(details).toContainText(
        codec === "mp3"
          ? "copy H.264 video and convert audio only"
          : "compatible for MP4 stream copy",
        { timeout: 60000 },
      );
      await expect(details).toContainText(`H264 / ${codec.toUpperCase()}`);
      await expect(details).toContainText(
        name.endsWith(".mkv") ? "matroska" : "mov,mp4",
      );
      await expect(page.locator("article")).toHaveCount(0);
      await page.getByLabel("End (seconds)", { exact: false }).fill("6.5");
      await page
        .getByRole("button", { name: "Process video", exact: true })
        .click();
      if (codec === "mp3") {
        await expect(
          page.getByRole("complementary", { name: "Confirm audio conversion" }),
        ).toBeVisible();
        await expect(page.locator("article")).toHaveCount(0);
        await page
          .getByRole("button", {
            name: "Convert audio and continue Fast Cut",
            exact: true,
          })
          .click();
      }
      await expect(
        page.getByRole("heading", { name: "Completed", exact: true }),
      ).toBeVisible({ timeout: 60000 });
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download MP4", exact: true })
        .click();
      const output = info.outputPath(name + ".mp4");
      await (await pending).saveAs(output);
      const data = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            output,
          ],
          { encoding: "utf8" },
        ),
      );
      expect(
        data.streams.map((s: { codec_name: string }) => s.codec_name),
      ).toEqual(["h264", "aac"]);
      expect(Math.abs(Number(data.format.duration) - 6)).toBeLessThan(0.5);
      if (codec !== "mp3")
        expect(assertStreamCopySync(input, output)).toBeLessThan(0.005);
      else {
        const video = data.streams.find(
          (s: { codec_type: string }) => s.codec_type === "video",
        );
        const audio = data.streams.find(
          (s: { codec_type: string }) => s.codec_type === "audio",
        );
        expect(
          Math.abs(Number(video.start_time) - Number(audio.start_time)),
        ).toBeLessThan(0.15);
      }
      run([
        "-xerror",
        "-i",
        output,
        "-fps_mode",
        "passthrough",
        "-enc_time_base:v",
        "1:1000000",
        "-f",
        "null",
        "-",
      ]);
      const preview = page.getByLabel("Preview econtent-001.mp4");
      await preview.evaluate((v: HTMLVideoElement) => v.load());
      await expect
        .poll(() => preview.evaluate((v: HTMLVideoElement) => v.readyState))
        .toBeGreaterThan(1);
      await preview.evaluate((v: HTMLVideoElement) => v.play());
      await expect
        .poll(() => preview.evaluate((v: HTMLVideoElement) => v.currentTime))
        .toBeGreaterThan(0);
    }
    for (const [name, vcodec, acodec, reason] of [
      ["ac3.mp4", "copy", "ac3", "audio codec ac3"],
      ["mpeg4.mp4", "mpeg4", "copy", "video codec mpeg4"],
    ] as const) {
      const input = join(dir, name);
      run(["-i", source, "-c:v", vcodec, "-c:a", acodec, input]);
      await page
        .getByLabel("Choose video", { exact: true })
        .setInputFiles(input);
      await page
        .getByRole("button", { name: "Check codec compatibility", exact: true })
        .click();
      const details = page.getByRole("complementary", {
        name: "Video workload",
      });
      await expect(details).toContainText("unavailable (unsupported-codec)");
      await expect(details).toContainText(reason);
      await expect(page.getByLabel("Cut method", { exact: true })).toHaveValue(
        "fast",
      );
      await expect(page.locator("article")).toHaveCount(0);
      await expect(
        details.getByRole("button", {
          name: "Choose Precision Cut explicitly",
        }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: info.outputPath("codec-compatibility.png"),
      fullPage: true,
    });
    // A truncated MP4 is not classified as a codec rejection.
    await page.getByLabel("Choose video", { exact: true }).setInputFiles({
      name: "truncated.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from([
        0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105,
        115, 111, 109, 109, 112, 52, 49,
      ]),
    });
    await page
      .getByRole("button", { name: "Check codec compatibility", exact: true })
      .click();
    await expect(page.locator("section").getByRole("alert")).toContainText(
      "Malformed or incomplete media metadata",
      { timeout: 60000 },
    );
    await expect(
      page.getByRole("complementary", { name: "Video workload" }),
    ).toHaveCount(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
