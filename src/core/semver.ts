/**
 * Tiny semver comparison helpers, extracted from `check-update.ts` so both
 * the update-check path and the new self-upgrade decision module
 * (`src/core/self-upgrade.ts`) can depend on them without an import cycle
 * (self-upgrade ← check-update would cycle once check-update imports the
 * cache helpers back from self-upgrade). `check-update.ts` re-exports the
 * public helpers for back-compat with existing importers.
 *
 * Supports both 3-segment (`0.41.38`) and 4-segment (`0.42.3.0`) gbrain
 * version strings. The 4th `.MICRO` segment is gbrain's dot-suffix
 * follow-up channel; comparisons use it as a 4th ordering key.
 *
 * Also accepts semver BUILD METADATA (`+<identifiers>`, e.g. `0.42.3.0+caracal.1`)
 * — a fork or downstream build tags its binary this way, and per the semver
 * spec build metadata does not affect precedence, so it is validated and then
 * dropped before parsing the numeric core. Rejecting it here previously meant
 * `parseSemver` returned null for a fork's OWN version string, which silently
 * disabled the self-upgrade marker and threw where a caller assumed a non-null
 * result (`parseSemver(VERSION)!`) — see downstream forks' known-red notes.
 */

/** A parsed gbrain version tuple (major, minor, patch, micro). Historical
 * 3-segment versions are normalized with a zero micro segment. */
export type SemverTuple = [number, number, number, number];

/** Strict shape gate for a remote version string before it reaches the agent.
 * Accepts both 3-segment (`0.41.38`) and 4-segment (`0.42.3.0`) gbrain versions. */
export const VERSION_RE = /^\d+\.\d+(?:\.\d+){0,2}$/;

/** Semver build-metadata identifiers: dot-separated alphanumerics/hyphens, each non-empty. */
const BUILD_METADATA_RE = /^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/;

/** Split `<core>[+<build>]`. Build metadata is optional and, when present,
 * must be non-empty and match `BUILD_METADATA_RE`. Returns null on a
 * malformed (present-but-invalid) build-metadata segment. */
function splitBuildMetadata(v: string): { core: string; build: string | null } | null {
  const i = v.indexOf('+');
  if (i === -1) return { core: v, build: null };
  const build = v.slice(i + 1);
  if (!BUILD_METADATA_RE.test(build)) return null;
  return { core: v.slice(0, i), build };
}

/** True iff `v` (optionally `v`-prefixed) is a plain numeric dotted version,
 * optionally followed by valid `+build.metadata`. */
export function isValidVersionString(v: string): boolean {
  const split = splitBuildMetadata(v.replace(/^v/, ''));
  return !!split && VERSION_RE.test(split.core);
}

/**
 * Parse a version string into a (major, minor, patch, micro) tuple. Returns
 * null on any malformed input. Accepts a leading `v` and trailing
 * `+build.metadata` (dropped — semver build metadata never affects
 * precedence); historical 3-segment versions are padded with a zero micro
 * segment.
 */
export function parseSemver(v: string): SemverTuple | null {
  const split = splitBuildMetadata(v.replace(/^v/, ''));
  if (!split) return null;
  const { core } = split;
  if (!VERSION_RE.test(core)) return null;
  const parts = core.split('.');
  if (parts.length < 3) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return [nums[0], nums[1], nums[2], nums[3] ?? 0];
}

/** Strict greater-than over the tuple. */
export function semverGt(a: SemverTuple, b: SemverTuple): boolean {
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** a <= b. */
export function semverLte(a: SemverTuple, b: SemverTuple): boolean {
  return !semverGt(a, b);
}

/** True when `latest` is any strictly newer gbrain release than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  const cur = parseSemver(current);
  const lat = parseSemver(latest);
  return !!cur && !!lat && semverGt(lat, cur);
}

/**
 * True when `latest` is a minor or major bump over `current` (patch / micro
 * bumps are deliberately ignored). Kept for callers that intentionally want
 * coarse release-channel drift rather than a general update check.
 * Unparseable inputs are treated as "not a bump" (fail-open to up-to-date).
 */
export function isMinorOrMajorBump(current: string, latest: string): boolean {
  const cur = parseSemver(current);
  const lat = parseSemver(latest);
  if (!cur || !lat) return false;
  if (lat[0] > cur[0]) return true;
  if (lat[0] === cur[0] && lat[1] > cur[1]) return true;
  return false;
}
