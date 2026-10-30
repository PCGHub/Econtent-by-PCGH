import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { titleMuxArgs } from "../lib/titles/commands";
test("title MP4 joins retain exact frame count and timed source audio with silent scenes and looped backgrounds", () => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-title-native-"));
  const run = (args: string[]) =>
    execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
      cwd: dir,
      maxBuffer: 8 * 1048576,
    });
  try {
    for (const [i, color] of ["red", "green", "blue"].entries())
      run([
        "-f",
        "lavfi",
        "-i",
        `color=${color}:s=160x90:r=24`,
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-video_track_timescale",
        "90000",
        `part${i}.mp4`,
      ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "color=black:s=160x90:r=24",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000",
      "-t",
      "0.4",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "background.mp4",
    ]);
    writeFileSync(
      join(dir, "chunks.txt"),
      [0, 1, 2].map((i) => `file 'part${i}.mp4'`).join("\n"),
    );
    run(
      titleMuxArgs(
        [
          { hasAudio: false, volume: 0, loop: false, duration: 1 },
          {
            path: "background.mp4",
            hasAudio: true,
            volume: 0.5,
            loop: false,
            duration: 1,
          },
          {
            path: "background.mp4",
            hasAudio: true,
            volume: 0.5,
            loop: true,
            sourceDuration: 0.4,
            duration: 1,
          },
        ],
        3,
      ),
    );
    const info = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-count_frames",
          "-show_streams",
          "-of",
          "json",
          join(dir, "titles.mp4"),
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(info.streams[0].nb_read_frames, "72");
    assert.equal(info.streams[1].codec_name, "aac");
    for (const [time, active] of [
      [0.2, false],
      [1.2, true],
      [1.7, false],
      [2.2, true],
      [2.8, true],
    ] as const) {
      const pcm = run([
        "-ss",
        String(time),
        "-i",
        "titles.mp4",
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
      let sum = 0;
      for (let n = 0; n < pcm.length; n += 4) sum += pcm.readFloatLE(n) ** 2;
      const rms = Math.sqrt(sum / (pcm.length / 4));
      assert.ok(active ? rms > 0.02 : rms < 0.001, `${time}: ${rms}`);
    }
    run(["-xerror", "-i", "titles.mp4", "-f", "null", "-"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("titles background audio preserves a measured positive source offset instead of moving sound to scene start", () => {
  const dir = mkdtempSync(join(tmpdir(), "econtent-title-offset-"));
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
      "color=black:s=160x90:r=24",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "part.mp4",
    ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=160x90:r=24",
      "-itsoffset",
      "0.3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "source.mp4",
    ]);
    const metadata = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            join(dir, "source.mp4"),
          ],
          { encoding: "utf8" },
        ),
      ),
      offset =
        Number(
          metadata.streams.find(
            (s: { codec_type: string }) => s.codec_type === "audio",
          ).start_time,
        ) - Number(metadata.format.start_time);
    assert.ok(offset > 0.25);
    writeFileSync(join(dir, "chunks.txt"), "file 'part.mp4'");
    run(
      titleMuxArgs(
        [
          {
            path: "source.mp4",
            hasAudio: true,
            loop: false,
            volume: 1,
            duration: 1,
            offset,
          },
        ],
        1,
      ),
    );
    for (const [time, active] of [
      [0.1, false],
      [0.5, true],
    ] as const) {
      const pcm = run([
        "-ss",
        String(time),
        "-i",
        "titles.mp4",
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
      let sum = 0;
      for (let n = 0; n < pcm.length; n += 4) sum += pcm.readFloatLE(n) ** 2;
      const rms = Math.sqrt(sum / (pcm.length / 4));
      assert.ok(active ? rms > 0.02 : rms < 0.001, `${time}: ${rms}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
