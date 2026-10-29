export interface ImportFixture {
  name: string;
  video: string;
  audio?: string;
}
/** Generate real, synthetic media and manifest.json using the system FFmpeg. */
export function createImportFixtures(directory: string): ImportFixture[];
