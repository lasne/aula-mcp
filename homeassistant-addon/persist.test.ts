import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const RUN = join(import.meta.dir, 'run.sh');

function migrate(dest: string, ...sources: string[]): void {
  const result = spawnSync('sh', [RUN, '--migrate-only', dest, ...sources], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `migrate exited ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
}

async function writeBundle(dir: string, tokens: string, key = 'abc123key'): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'tokens.json'), tokens, 'utf8');
  await writeFile(join(dir, '.key'), key, 'utf8');
  await chmod(join(dir, '.key'), 0o600);
  await writeFile(join(dir, 'cookies.json'), '{"session":"1"}', 'utf8');
  const transcripts = join(dir, 'transcripts');
  await mkdir(transcripts);
  await writeFile(join(transcripts, 'login-1.jsonl'), '{"ok":true}\n', 'utf8');
}

describe('add-on token migration', () => {
  test('copies tokens, key, cookies, and transcripts from the first legacy dir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aula-migrate-'));
    try {
      const dest = join(root, 'data');
      const legacy = join(root, 'config');
      await writeBundle(legacy, '{"version":1,"from":"config"}');

      migrate(dest, legacy, join(root, 'missing'));

      expect(await readFile(join(dest, 'tokens.json'), 'utf8')).toBe(
        '{"version":1,"from":"config"}',
      );
      expect(await readFile(join(dest, '.key'), 'utf8')).toBe('abc123key');
      expect((await stat(join(dest, '.key'))).mode & 0o777).toBe(0o600);
      expect(await readFile(join(dest, 'cookies.json'), 'utf8')).toContain('session');
      expect(await readFile(join(dest, 'transcripts', 'login-1.jsonl'), 'utf8')).toContain('ok');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('uses the next legacy dir when the earlier one has no tokens', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aula-migrate-'));
    try {
      const dest = join(root, 'data');
      const homeassistant = join(root, 'homeassistant');
      await writeBundle(homeassistant, '{"from":"homeassistant"}', 'host-key');

      migrate(dest, join(root, 'config'), homeassistant);

      expect(await readFile(join(dest, 'tokens.json'), 'utf8')).toBe('{"from":"homeassistant"}');
      expect(await readFile(join(dest, '.key'), 'utf8')).toBe('host-key');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('does not overwrite a session already in the persistent store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aula-migrate-'));
    try {
      const dest = join(root, 'data');
      const legacy = join(root, 'config');
      await writeBundle(dest, '{"from":"data"}', 'current-key');
      await writeBundle(legacy, '{"from":"legacy"}', 'old-key');

      migrate(dest, legacy);

      expect(await readFile(join(dest, 'tokens.json'), 'utf8')).toBe('{"from":"data"}');
      expect(await readFile(join(dest, '.key'), 'utf8')).toBe('current-key');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('does not sign the user back in from a bundle that was already imported', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aula-migrate-'));
    try {
      const dest = join(root, 'data');
      const legacy = join(root, 'config');
      await writeBundle(legacy, '{"from":"legacy"}');

      migrate(dest, legacy);
      await rm(join(dest, 'tokens.json'));

      migrate(dest, legacy);

      await expect(stat(join(dest, 'tokens.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      // The key from the imported bundle is still there; logout only removes tokens.json.
      expect(await readFile(join(dest, '.key'), 'utf8')).toBe('abc123key');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('imports again when the legacy bundle changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aula-migrate-'));
    try {
      const dest = join(root, 'data');
      const legacy = join(root, 'homeassistant');
      await writeBundle(legacy, '{"from":"v1"}', 'key-v1');
      migrate(dest, join(root, 'absent'), legacy);
      await rm(join(dest, 'tokens.json'));

      await writeFile(join(legacy, 'tokens.json'), '{"from":"version-2"}', 'utf8');
      await writeFile(join(legacy, '.key'), 'key-v2', 'utf8');
      // Fingerprint is mtime (seconds) + size. Bump mtime so a same-second
      // rewrite cannot look identical to the bundle already imported.
      const later = new Date(Date.now() + 10_000);
      await utimes(join(legacy, 'tokens.json'), later, later);
      migrate(dest, join(root, 'absent'), legacy);

      expect(await readFile(join(dest, 'tokens.json'), 'utf8')).toBe('{"from":"version-2"}');
      expect(await readFile(join(dest, '.key'), 'utf8')).toBe('key-v2');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('creates the destination and succeeds when nothing can be imported', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aula-migrate-'));
    try {
      const dest = join(root, 'data', 'aula-mcp');
      migrate(dest, join(root, 'nope'));
      expect((await stat(dest)).isDirectory()).toBe(true);
      await expect(stat(join(dest, 'tokens.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('add-on image wiring', () => {
  test('stores the session on /data and keeps the server read-only', async () => {
    const run = await readFile(RUN, 'utf8');
    expect(run).toContain('TOKEN_DIR=/data/aula-mcp');
    expect(run).toContain('export AULA_MCP_DIR="$TOKEN_DIR"');
    expect(run).toContain('/config/aula-mcp');
    expect(run).toContain('/homeassistant/aula-mcp');
    expect(run).not.toContain('AULA_MCP_DIR="/config/aula-mcp"');
    expect(run).not.toMatch(/^\s*(export )?AULA_MCP_WRITE=/m);
  });

  test('clones this fork rather than upstream', async () => {
    const dockerfile = await readFile(join(import.meta.dir, 'Dockerfile'), 'utf8');
    const build = await readFile(join(import.meta.dir, 'build.yaml'), 'utf8');
    expect(dockerfile).toContain('ARG AULA_MCP_REPO=https://github.com/lasne/aula-mcp.git');
    expect(dockerfile).toContain(`"\${AULA_MCP_REPO}"`);
    expect(dockerfile).not.toMatch(/git clone[\s\S]*Casperjuel/);
    expect(build).toContain('AULA_MCP_REPO: "https://github.com/lasne/aula-mcp.git"');
    expect(build).not.toMatch(/AULA_MCP_REPO:.*Casperjuel/);
  });

  test('is a distinct add-on with the same options', async () => {
    const config = await readFile(join(import.meta.dir, 'config.yaml'), 'utf8');
    const repository = await readFile(join(ROOT, 'repository.yaml'), 'utf8');
    expect(config).toContain('name: aula-mcp (lasne)');
    expect(config).toContain('slug: aula_mcp_lasne');
    expect(config).toContain('version: "1.1.0"');
    expect(config).toContain('url: "https://github.com/lasne/aula-mcp"');
    expect(config).toContain('aula_mcp_key: "password?"');
    expect(config).toContain('log: bool');
    expect(config).toContain('allow_remote: bool');
    expect(config).toContain('homeassistant_config:rw');
    expect(repository).toContain('url: "https://github.com/lasne/aula-mcp"');
    expect(repository).not.toContain('Casperjuel/aula-mcp');
  });
});
