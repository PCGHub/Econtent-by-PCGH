import type { CutStrategy, ProcessOptions } from "./types";
export interface SourceInspection {
  duration: number;
  sizeBytes: number;
  width: number;
  height: number;
  frameRate?: number;
  videoCodec: string;
  audioCodec?: string;
  container: string;
  compatible: boolean;
  incompatibility?: string;
}
export interface DeviceProfile {
  mobile: boolean;
  memoryGiB?: number;
}
export function defaultStrategy(
  options: Pick<ProcessOptions, "cutStrategy" | "compression">,
): CutStrategy {
  if (
    options.cutStrategy !== undefined &&
    options.cutStrategy !== "fast" &&
    options.cutStrategy !== "precision"
  )
    throw new RangeError("Unknown cut method");
  return (
    options.cutStrategy ??
    (options.compression === "off" ? "fast" : "precision")
  );
}
export function frameRate(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split("/");
  if (parts.length > 2) return undefined;
  const result = Number(parts[0]) / (parts.length === 2 ? Number(parts[1]) : 1);
  return Number.isFinite(result) && result > 0 && result <= 1000
    ? result
    : undefined;
}
export function deviceProfile(
  nav: Pick<Navigator, "userAgent"> & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  },
): DeviceProfile {
  return {
    mobile:
      !!nav.userAgentData?.mobile ||
      /Android|iPhone|iPad|iPod/i.test(nav.userAgent),
    memoryGiB:
      Number.isFinite(nav.deviceMemory) && nav.deviceMemory! > 0
        ? nav.deviceMemory
        : undefined,
  };
}
export function needsPrecisionConfirmation(device: DeviceProfile): boolean {
  return (
    device.mobile || (device.memoryGiB !== undefined && device.memoryGiB <= 4)
  );
}
export function outputBudget(device: DeviceProfile): number {
  return (needsPrecisionConfirmation(device) ? 128 : 512) * 1048576;
}
export function workloadDescription(
  info: SourceInspection,
  seconds: number,
  strategy: CutStrategy,
): string {
  const fps =
    info.frameRate === undefined
      ? "frame rate unavailable"
      : `${Number(info.frameRate.toFixed(2))} fps average`;
  const pixels =
    info.width && info.height
      ? `${info.width}×${info.height}`
      : "resolution unavailable";
  const frames =
    info.frameRate === undefined
      ? ""
      : ` · about ${Math.ceil(seconds * info.frameRate).toLocaleString()} frames`;
  const summary = `${seconds.toFixed(1)} seconds selected · ${pixels} · ${fps}${frames}`;
  return (
    summary +
    (strategy === "fast"
      ? ". Fast Cut copies compressed streams; boundaries depend on source keyframes."
      : ". Precision Cut decodes and re-encodes video. Resolution, frame rate, device speed, memory and temperature affect processing time; file size alone cannot predict it.")
  );
}
