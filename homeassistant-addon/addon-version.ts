/**
 * Add-on versions for this fork.
 *
 * Supervisor compares `config.yaml` `version` with AwesomeVersion. The
 * installed add-on was `1.1.0`. A prerelease on a higher major.minor.patch
 * sorts above that, and `1.6.2-lasne.N` stays semver so later bumps compare
 * correctly. A hyphen suffix on the *same* triple sorts below the release
 * (`1.6.2-lasne.1` < `1.6.2`); the counter only moves within our suffix,
 * or jumps to the next upstream release's `-lasne.1`.
 */

export interface AddonVersion {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease identifiers. Empty means a release version. */
  pre: string[];
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/;

export function parseAddonVersion(input: string): AddonVersion {
  const match = VERSION_RE.exec(input.trim());
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Not a semver add-on version: ${input}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  };
}

export function formatAddonVersion(version: AddonVersion): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  if (version.pre.length === 0) return core;
  return `${core}-${version.pre.join('.')}`;
}

function compareIdentifier(left: string, right: string): number {
  const leftNum = /^\d+$/.test(left);
  const rightNum = /^\d+$/.test(right);
  if (leftNum && rightNum) return Number(left) - Number(right);
  // Semver: numeric identifiers have lower precedence than non-numeric.
  if (leftNum !== rightNum) return leftNum ? -1 : 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Negative if a < b, zero if equal, positive if a > b. Semver precedence. */
export function compareAddonVersions(a: string, b: string): number {
  const left = parseAddonVersion(a);
  const right = parseAddonVersion(b);
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.pre.length === 0 && right.pre.length === 0) return 0;
  if (left.pre.length === 0) return 1;
  if (right.pre.length === 0) return -1;
  const length = Math.max(left.pre.length, right.pre.length);
  for (let i = 0; i < length; i++) {
    const lp = left.pre[i];
    const rp = right.pre[i];
    if (lp === undefined) return -1;
    if (rp === undefined) return 1;
    const cmp = compareIdentifier(lp, rp);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function lasneCounter(version: AddonVersion): number | undefined {
  if (version.pre.length !== 2 || version.pre[0] !== 'lasne') return undefined;
  const counter = version.pre[1];
  if (!counter || !/^\d+$/.test(counter)) return undefined;
  return Number(counter);
}

/**
 * Next add-on version after merging upstream.
 *
 * `upstreamPackage` is the npm release (for example `1.6.2`), not the
 * upstream add-on's own `config.yaml` version. The result is always
 * strictly greater than `current`.
 */
export function bumpAddonVersion(current: string, upstreamPackage: string): string {
  const upstream = parseAddonVersion(upstreamPackage);
  if (upstream.pre.length > 0) {
    throw new Error(`Upstream package version must be a release: ${upstreamPackage}`);
  }
  const base = formatAddonVersion({ ...upstream, pre: [] });
  const parsed = parseAddonVersion(current);
  const currentBase = formatAddonVersion({ ...parsed, pre: [] });
  const counter = lasneCounter(parsed);
  const upstreamIsNewer = compareAddonVersions(base, currentBase) > 0;
  let next: string;
  if (upstreamIsNewer || counter === undefined) {
    next = `${base}-lasne.1`;
  } else {
    next = `${currentBase}-lasne.${counter + 1}`;
  }
  if (compareAddonVersions(next, current) <= 0) {
    throw new Error(`Refusing to bump ${current} to ${next}, which is not newer`);
  }
  return next;
}

export function replaceQuotedVersion(configYaml: string, next: string): string {
  if (!/^version:\s*"[^"]+"/m.test(configYaml)) {
    throw new Error('config.yaml has no quoted version');
  }
  return configYaml.replace(/^version:\s*"[^"]+"/m, `version: "${next}"`);
}

/** Insert a changelog section for `version` unless that heading exists. */
export function upsertChangelog(changelog: string, version: string, body: string): string {
  const heading = `## ${version}`;
  if (changelog.split('\n').includes(heading)) return changelog;
  const section = `${heading}\n\n${body.trim()}\n`;
  const title = '# Changelog\n';
  if (changelog.startsWith(title)) {
    const rest = changelog.slice(title.length).replace(/^\n/, '');
    return `${title}\n${section}\n${rest}`;
  }
  return `${title}\n${section}\n${changelog}`;
}
