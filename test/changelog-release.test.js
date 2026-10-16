// -----------------------------------------------------------------------------
// The changelog roll of the Release workflow (.github/scripts/changelog-release.mjs).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-totalenergies';

test('the Unreleased section moves under the released version', () => {
  const text = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Something.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const rolled = rollChangelog(text, '1.0.0', '2026-10-16');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-16\n\n### Added\n\n- Something\./,
  );
  assert.match(rolled, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(rolled, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('a second release compares with the previous tag', () => {
  const text = `## [Unreleased]\n\n- Fix.\n\n## [1.0.0] - 2026-10-16\n\n- First.\n\n[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n`;
  const rolled = rollChangelog(text, '1.0.1', '2026-10-20');
  assert.match(
    rolled,
    new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`),
  );
});

test('an empty Unreleased section still names the version', () => {
  const rolled = rollChangelog('## [Unreleased]\n', '1.0.2', '2026-10-21');
  assert.match(rolled, /## \[1\.0\.2\] - 2026-10-21\n\n- Maintenance release/);
});

test('the changelog of this repository can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(text.includes('## [Unreleased]'), 'CHANGELOG.md keeps an Unreleased section');
  assert.match(rollChangelog(text, '9.9.9', '2026-12-31'), /## \[9\.9\.9\] - 2026-12-31/);
});
