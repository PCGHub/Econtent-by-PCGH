import { test, expect } from "@playwright/test";
import { createImportFixtures } from "../../scripts/create-import-fixtures.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Uses the real bundled WASM worker. These desktop browser checks are not Android hardware results.
test("broad local import explicitly converts or remuxes to playable H264 AAC MP4", async ({
  page,
}, info) => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-imports-"));
  try {
    const fixtures = createImportFixtures(dir);
    await page.goto("/editor");
    for (const item of fixtures) {
      console.log("Testing import:", item.name);
      const source = join(dir, item.name);
      await page
        .getByLabel("Choose video", { exact: true })
        .setInputFiles(source);
      await page
        .getByRole("button", { name: "Check codec compatibility", exact: true })
        .click();
      const details = page.getByRole("complementary", {
        name: "Video workload",
      });
      await expect(details).toContainText(item.video.toUpperCase(), {
        timeout: 60000,
      });
      if (item.name === "hevc-hdr.mp4") {
        await expect(details).toContainText(
          "HDR/PQ/HLG conversion requires verified tone mapping",
        );
        await expect(
          page.getByRole("option", {
            name: "Precision Cut — accurate boundaries",
          }),
        ).toHaveAttribute("disabled", "");
        continue;
      }
      if (item.video === "av1") {
        await expect(details).toContainText(
          "no usable software decoder for video codec av1",
        );
        await expect(
          page.getByRole("option", {
            name: "Precision Cut — accurate boundaries",
          }),
        ).toHaveAttribute("disabled", "");
        await expect(page.locator("article")).toHaveCount(0);
        continue;
      }
      await page.getByLabel("Start (seconds)", { exact: false }).fill("2.25");
      await page.getByLabel("End (seconds)", { exact: false }).fill("6.25");
      const audioOnly =
        item.video === "h264" &&
        !!item.audio &&
        item.audio !== "aac" &&
        !item.name.endsWith(".avi");
      const copy =
        item.video === "h264" &&
        !item.name.endsWith(".avi") &&
        !item.name.startsWith("vfr-");
      if (!copy)
        await page
          .getByLabel("Cut method", { exact: true })
          .selectOption("precision");
      await page
        .getByRole("button", { name: "Process video", exact: true })
        .click();
      if (item.name === "hevc-main10.mp4") {
        await expect(
          page.getByRole("complementary", {
            name: "Confirm precision workload",
          }),
        ).toContainText("8-bit 4:2:0");
        await expect(page.locator("article")).toHaveCount(0);
        await page
          .getByRole("button", {
            name: "Continue with Precision Cut",
            exact: true,
          })
          .click();
      }
      if (audioOnly) {
        await expect(
          page.getByRole("complementary", { name: "Confirm audio conversion" }),
        ).toBeVisible();
        await expect(page.locator("article")).toHaveCount(0);
        // Cancelling this choice must not start a worker encode/export.
        await page
          .getByRole("button", { name: "Cancel audio conversion", exact: true })
          .click();
        await expect(page.locator("article")).toHaveCount(0);
        await page
          .getByRole("button", { name: "Process video", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Convert audio and continue Fast Cut",
            exact: true,
          })
          .click();
      }
      await expect(
        page.getByRole("heading", { name: /^(Completed|Failed)$/ }),
      ).toBeVisible({ timeout: 90000 });
      await expect(
        page.getByRole("heading", { name: "Completed", exact: true }),
        await page.locator("body").innerText(),
      ).toBeVisible();
      await expect(page.getByTestId("overall-percentage")).toHaveText("100%");
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download MP4", exact: true })
        .click();
      const output = info.outputPath(item.name + ".mp4");
      await (await pending).saveAs(output);
      const probe = JSON.parse(
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
      const video = probe.streams.find(
          (s: { codec_type: string }) => s.codec_type === "video",
        ),
        audio = probe.streams.find(
          (s: { codec_type: string }) => s.codec_type === "audio",
        );
      expect(video.codec_name, item.name).toBe("h264");
      expect(video.pix_fmt).toBe("yuv420p");
      expect(video.width / video.height).toBeCloseTo(320 / 180, 4);
      if (item.name.startsWith("vfr-")) {
        const times = JSON.parse(
          execFileSync(
            "ffprobe",
            [
              "-v",
              "error",
              "-select_streams",
              "v:0",
              "-show_frames",
              "-show_entries",
              "frame=best_effort_timestamp_time",
              "-of",
              "json",
              output,
            ],
            { encoding: "utf8" },
          ),
        ).frames.map((f: { best_effort_timestamp_time: string }) =>
          Number(f.best_effort_timestamp_time),
        );
        const gaps = times.slice(1).map((t: number, i: number) => t - times[i]);
        expect(gaps.some((n: number) => n > 0.06)).toBe(true);
        expect(gaps.some((n: number) => n < 0.06)).toBe(true);
      }
      if (item.audio) {
        expect(audio.codec_name).toBe("aac");
        expect(
          Math.abs(Number(audio.start_time) - Number(video.start_time)),
        ).toBeLessThan(0.15);
      } else expect(audio).toBeUndefined();
      expect(
        Math.abs(Number(probe.format.duration) - 4),
        item.name,
      ).toBeLessThan(0.2);
      execFileSync("ffmpeg", [
        "-v",
        "error",
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
      const sourceProbe = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=start_time",
            "-of",
            "json",
            source,
          ],
          { encoding: "utf8" },
        ),
      );
      const refTime =
        Number(sourceProbe.streams[0].start_time) + (copy ? 2 : 2.25);
      const frame = (path: string, time?: number) =>
        execFileSync("ffmpeg", [
          "-v",
          "error",
          ...(time !== undefined ? ["-copyts"] : []),
          "-i",
          path,
          ...(time !== undefined ? ["-ss", String(time - 0.000001)] : []),
          "-map",
          "0:v:0",
          "-frames:v",
          "1",
          "-pix_fmt",
          "yuv420p",
          "-f",
          "rawvideo",
          "-",
        ]);
      const reference = frame(source, refTime),
        actual = frame(output);
      expect(actual.length).toBe(reference.length);
      let mse = 0;
      for (let n = 0; n < actual.length; n++)
        mse += (actual[n] - reference[n]) ** 2;
      const psnr =
        mse === 0
          ? Infinity
          : 10 * Math.log10(255 ** 2 / (mse / actual.length));
      expect(psnr, "first frame " + item.name).toBeGreaterThan(copy ? 90 : 35);
      const preview = page.getByLabel("Preview econtent-001.mp4");
      await preview.evaluate((v: HTMLVideoElement) => {
        v.muted = true;
        v.load();
      });
      await expect
        .poll(() => preview.evaluate((v: HTMLVideoElement) => v.readyState))
        .toBeGreaterThan(1);
      await preview.evaluate((v: HTMLVideoElement) => v.play());
      await expect
        .poll(() =>
          preview.evaluate((v: HTMLVideoElement) =>
            v.videoWidth > 0 && v.getVideoPlaybackQuality().totalVideoFrames > 0
              ? v.currentTime
              : 0,
          ),
        )
        .toBeGreaterThan(0);
      if (item.video === "hevc")
        await page.screenshot({
          path: info.outputPath("hevc-converted.png"),
          fullPage: true,
        });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lossless odd-sized import discloses chroma conversion and preserves display aspect ratio", async ({
  page,
}, info) => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-odd-browser-"));
  try {
    const source = join(dir, "odd.mkv");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=319x179:rate=24",
      "-t",
      "3",
      "-c:v",
      "ffv1",
      source,
    ]);
    await page.goto("/editor");
    await page
      .getByLabel("Choose video", { exact: true })
      .setInputFiles(source);
    await page
      .getByRole("button", { name: "Check codec compatibility", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Video workload" }),
    ).toContainText("FFV1");
    await page
      .getByLabel("Cut method", { exact: true })
      .selectOption("precision");
    await page.getByLabel("Start (seconds)", { exact: false }).fill(".5");
    await page.getByLabel("End (seconds)", { exact: false }).fill("2.5");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Confirm precision workload" }),
    ).toContainText("8-bit 4:2:0");
    await page
      .getByRole("button", { name: "Continue with Precision Cut", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download MP4", exact: true })
      .click();
    const out = info.outputPath("odd.mp4");
    await (await pending).saveAs(out);
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", out],
        { encoding: "utf8" },
      ),
    );
    const video = probe.streams[0];
    expect(video.codec_name).toBe("h264");
    expect(video.width).toBe(320);
    expect(video.height).toBe(180);
    const [a, b] = video.display_aspect_ratio.split(":").map(Number);
    expect(a / b).toBeCloseTo(319 / 179, 4);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      out,
      "-f",
      "null",
      "-",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HEVC conversion cancels during encoding and can recover with a fresh worker", async ({
  page,
}, info) => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-hevc-cancel-"));
  try {
    const source = join(dir, "hevc.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "30",
      "-c:v",
      "libx265",
      "-preset",
      "ultrafast",
      "-x265-params",
      "pools=none:frame-threads=1:log-level=error",
      "-c:a",
      "aac",
      source,
    ]);
    await page.goto("/editor");
    await page
      .getByLabel("Choose video", { exact: true })
      .setInputFiles(source);
    await page
      .getByRole("button", { name: "Check codec compatibility", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Video workload" }),
    ).toContainText("HEVC");
    await page
      .getByLabel("Cut method", { exact: true })
      .selectOption("precision");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Processing video", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Cancel processing", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
    await page.getByLabel("Start (seconds)", { exact: false }).fill(".5");
    await page.getByLabel("End (seconds)", { exact: false }).fill("4.5");
    await page
      .getByLabel("Compression", { exact: true })
      .selectOption("balanced");
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download all ZIP", exact: true })
      .click();
    const zip = info.outputPath("hevc-balanced.zip");
    await (await pending).saveAs(zip);
    const extracted = join(dir, "zip");
    execFileSync("unzip", ["-o", zip, "-d", extracted]);
    const output = join(extracted, "001-econtent-001.mp4");
    const p = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    expect(p.streams.map((s: { codec_name: string }) => s.codec_name)).toEqual([
      "h264",
      "aac",
    ]);
    expect(Math.abs(Number(p.format.duration) - 4)).toBeLessThan(0.1);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      output,
      "-f",
      "null",
      "-",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
