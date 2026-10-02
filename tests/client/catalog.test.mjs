import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const metadata = JSON.parse(fs.readFileSync('meta.json', 'utf8'));

test('catalog manifest is valid and matches the plugin identity', () => {
  assert.equal(Array.isArray(manifest), true);
  assert.equal(manifest.length, 1);

  const plugin = manifest[0];
  assert.equal(plugin.guid, metadata.guid);
  assert.equal(plugin.name, metadata.name);
  assert.equal(plugin.category, metadata.category);
  assert.equal(plugin.owner, metadata.owner);
  assert.ok(plugin.versions.length >= 1);

  for (const release of plugin.versions) {
    assert.match(release.checksum, /^[a-f0-9]{32}$/);
    assert.equal(release.targetAbi, metadata.targetAbi);
    assert.equal(
      release.sourceUrl,
      `https://github.com/Mortisshadow/jellyfin-plugin-monochrome-fullscreen/releases/download/v${release.version}/MonochromeFullscreen_${release.version}.zip`
    );
  }
});
