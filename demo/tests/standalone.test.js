import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../',import.meta.url);
test('the single-file export retains complete runnable module sources',()=>{
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
  const html=readFileSync(new URL('dist/ember-demo.html',root),'utf8');
  assert.equal((html.match(/<script type="module">/g)??[]).length,1);
  assert.equal((html.match(/<\/script>/g)??[]).length,1);
  const serialized=html.split('const sources = ')[1].split(';\nconst moduleUrl')[0];
  const sources=JSON.parse(serialized);
  assert.equal(sources.core,readFileSync(new URL('vendor/three.core.js',root),'utf8'));
  assert.equal(sources.main,readFileSync(new URL('src/main.js',root),'utf8'));
  assert.equal(sources.simulation,readFileSync(new URL('src/simulation.js',root),'utf8'));
  assert.equal(sources.response,readFileSync(new URL('src/response-view.js',root),'utf8'));
  assert.equal(sources.furnishings,readFileSync(new URL('src/furnishings.js',root),'utf8'));
  assert.equal(sources.building,readFileSync(new URL('src/building.js',root),'utf8'));
});
