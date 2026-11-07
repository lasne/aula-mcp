/**
 * Bump homeassistant-addon/config.yaml after an upstream merge.
 *
 * Reads the npm package version (upstream's release) and writes the next
 * `x.y.z-lasne.N` add-on version plus a changelog section. Prints the new
 * version on stdout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpAddonVersion, replaceQuotedVersion, upsertChangelog } from './addon-version.ts';

const root = new URL('..', import.meta.url);
const configPath = new URL('homeassistant-addon/config.yaml', root);
const changelogPath = new URL('homeassistant-addon/CHANGELOG.md', root);
const packagePath = new URL('package.json', root);

const config = readFileSync(configPath, 'utf8');
const versionMatch = config.match(/^version:\s*"([^"]+)"/m);
const current = versionMatch?.[1];
if (!current) throw new Error('config.yaml has no quoted version');

const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
if (!pkg.version) throw new Error('package.json has no version');

const next = bumpAddonVersion(current, pkg.version);
writeFileSync(configPath, replaceQuotedVersion(config, next));

let changelog = '# Changelog\n';
try {
  changelog = readFileSync(changelogPath, 'utf8');
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const sha = process.env.UPSTREAM_SHA?.trim();
const shortSha = sha ? ` \`${sha.slice(0, 7)}\`` : '';
const body = [
  `- Merge upstream${shortSha} package ${pkg.version} and bump the add-on so Home Assistant offers an update.`,
  '- Fork defaults stay: tokens on `/data/aula-mcp`, write and raw tools off, image built from this fork.',
].join('\n');

writeFileSync(changelogPath, upsertChangelog(changelog, next, body));
console.error(`${current} -> ${next}`);
console.log(next);
