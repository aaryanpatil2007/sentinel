import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
test('the standalone guidance view inlines every module it needs', () => {
  execFileSync(process.execPath, ['scripts/build-ar.mjs'], { cwd: root });
  const html = readFileSync(new URL('jacobs-ar.html', root), 'utf8');
  assert.equal((html.match(/<script type="module">/g) ?? []).length, 1);
  assert.ok(!html.includes('type="importmap"'));
  const sources = JSON.parse(html.split('const sources = ')[1].split(';\nconst moduleUrl')[0]);
  for (const [id, path] of Object.entries({ core: 'vendor/three.core.js', packet: 'src/ar/packet.js', samples: 'src/ar/sample-packets.js', view: 'src/ar/blueprint-view.js', main: 'src/ar/main.js' }))
    assert.equal(sources[id], readFileSync(new URL(path, root), 'utf8'), id);
  assert.ok(html.includes('<style>') && html.includes('.cue-card'));
});
