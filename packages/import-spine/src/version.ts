// JSON candidate profiles are explicit minors, never an open-ended major-version promise.
// Binary import has a separate default-deny capability gate in import-skel.ts.
export const SUPPORTED_SPINE_MAJOR = 4;

export function parseMajorVersion(version: string): number | null {
  const match = /^(\d+)\./.exec(version.trim());
  return match ? Number.parseInt(match[1]!, 10) : null;
}

export function isSupportedVersion(version: string): boolean {
  return /^4\.(0|1|2)\.(0|[1-9]\d*)$/.test(version);
}
