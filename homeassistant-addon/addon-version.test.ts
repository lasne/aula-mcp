import { describe, expect, test } from 'bun:test';
import {
  bumpAddonVersion,
  compareAddonVersions,
  replaceQuotedVersion,
  upsertChangelog,
} from './addon-version.ts';

describe('compareAddonVersions', () => {
  test('orders the fork suffix above the installed add-on and within itself', () => {
    expect(compareAddonVersions('1.6.2-lasne.1', '1.1.0')).toBeGreaterThan(0);
    expect(compareAddonVersions('1.6.2-lasne.2', '1.6.2-lasne.1')).toBeGreaterThan(0);
    expect(compareAddonVersions('1.6.3-lasne.1', '1.6.2-lasne.9')).toBeGreaterThan(0);
    expect(compareAddonVersions('1.6.2', '1.6.2-lasne.1')).toBeGreaterThan(0);
    expect(compareAddonVersions('1.6.2-lasne.1', '1.6.2-lasne.1')).toBe(0);
  });
});

describe('bumpAddonVersion', () => {
  test('moves the installed 1.1.0 onto the upstream release suffix', () => {
    expect(bumpAddonVersion('1.1.0', '1.6.2')).toBe('1.6.2-lasne.1');
  });

  test('increments the suffix when upstream has not released again', () => {
    expect(bumpAddonVersion('1.6.2-lasne.1', '1.6.2')).toBe('1.6.2-lasne.2');
  });

  test('starts a new suffix when upstream releases', () => {
    expect(bumpAddonVersion('1.6.2-lasne.4', '1.6.3')).toBe('1.6.3-lasne.1');
  });

  test('does not go backwards when the fork base is already ahead', () => {
    expect(bumpAddonVersion('1.6.4-lasne.2', '1.6.2')).toBe('1.6.4-lasne.3');
  });

  test('refuses a suffix that would sort below the current release version', () => {
    expect(() => bumpAddonVersion('1.6.2', '1.6.2')).toThrow(/not newer/);
  });
});

describe('changelog and config edits', () => {
  test('replaces only the quoted version', () => {
    const yaml = 'name: aula-mcp (lasne)\nversion: "1.1.0"\nslug: aula_mcp_lasne\n';
    expect(replaceQuotedVersion(yaml, '1.6.2-lasne.1')).toContain('version: "1.6.2-lasne.1"');
  });

  test('inserts a section once', () => {
    const once = upsertChangelog(
      '# Changelog\n\n## 1.1.0\n\n- first\n',
      '1.6.2-lasne.1',
      '- merge',
    );
    expect(once.startsWith('# Changelog\n\n## 1.6.2-lasne.1\n')).toBe(true);
    expect(once).toContain('## 1.1.0');
    expect(upsertChangelog(once, '1.6.2-lasne.1', '- again')).toBe(once);
  });
});
