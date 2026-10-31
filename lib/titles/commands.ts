import type { TitleProject } from "./model";
export function frameSchedule(p: TitleProject) {
  let elapsed = 0,
    previous = 0;
  return p.scenes.map((scene) => {
    const start = elapsed;
    elapsed += scene.duration;
    const end = Math.ceil(elapsed * p.output.fps - 1e-7),
      frames = end - previous,
      first = previous;
    previous = end;
    return { scene, start, first, frames, duration: frames / p.output.fps };
  });
}
export function frameEncodeArgs(fps: number, frames: number, path: string) {
  return [
    "-hide_banner",
    "-y",
    "-framerate",
    String(fps),
    "-i",
    "frame-%03d.jpg",
    "-frames:v",
    String(frames),
    "-vf",
    "setsar=1",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "1",
    "-video_track_timescale",
    "90000",
    "-an",
    path,
  ];
}
export interface SceneAudio {
  path?: string;
  hasAudio: boolean;
  loop: boolean;
  volume: number;
  duration: number;
  offset?: number;
  sourceDuration?: number;
}
export function titleMuxArgs(scenes: SceneAudio[], duration: number) {
  const args = [
      "-hide_banner",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "chunks.txt",
    ],
    filters: string[] = [];
  for (const [i, scene] of scenes.entries()) {
    if (scene.path && scene.hasAudio && scene.volume > 0) {
      args.push("-i", scene.path);
      const cycle =
        scene.loop &&
        scene.sourceDuration &&
        scene.sourceDuration < scene.duration
          ? scene.sourceDuration
          : undefined;
      filters.push(
        `[${i + 1}:a:0]asetpts=PTS-STARTPTS,atrim=duration=${cycle ?? scene.duration},aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${scene.volume}${scene.offset ? `,adelay=${Math.round(scene.offset * 1000)}:all=1` : ""},apad=whole_dur=${cycle ?? scene.duration},atrim=duration=${cycle ?? scene.duration}${cycle ? `,aloop=loop=-1:size=${Math.round(cycle * 48000)}:start=0,atrim=duration=${scene.duration},asetpts=N/SR/TB` : ""}[a${i}]`,
      );
    } else {
      args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
      filters.push(
        `[${i + 1}:a]atrim=duration=${scene.duration},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
  }
  filters.push(
    scenes.map((_, i) => `[a${i}]`).join("") +
      `concat=n=${scenes.length}:v=0:a=1[a]`,
  );
  return [
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(duration),
    "-movflags",
    "+faststart",
    "-max_muxing_queue_size",
    "1024",
    "-threads",
    "1",
    "titles.mp4",
  ];
}
