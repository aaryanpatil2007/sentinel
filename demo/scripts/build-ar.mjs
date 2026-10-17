// Builds the standalone guidance view (jacobs-ar.html): every module and the
// vendored Three.js are inlined as blob-URL modules, same approach as build.mjs,
// so the page opens from a file with no server. Also copies ar.html into dist/.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(resolve(root, 'dist'), { recursive: true });
const html = await readFile(resolve(root, 'ar.html'), 'utf8');
if (!html.includes('type="importmap"')) throw new Error('Missing Three.js import map in ar.html.');
const files = {
  core: 'vendor/three.core.js', three: 'vendor/three.module.js',
  controls: 'vendor/addons/controls/OrbitControls.js', labels: 'vendor/addons/renderers/CSS2DRenderer.js',
  packet: 'src/ar/packet.js', samples: 'src/ar/sample-packets.js', view: 'src/ar/blueprint-view.js', main: 'src/ar/main.js',
};
const sources = {};
for (const [id, path] of Object.entries(files)) sources[id] = await readFile(resolve(root, path), 'utf8');
const css = await readFile(resolve(root, 'src/ar/style.css'), 'utf8');
const bootstrap = `
const sources = ${JSON.stringify(sources).replaceAll('<', '\\u003c')};
const moduleUrl = source => URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
const core = moduleUrl(sources.core);
const three = moduleUrl(sources.three.replaceAll("'./three.core.js'", JSON.stringify(core)));
const controls = moduleUrl(sources.controls.replaceAll("'three'", JSON.stringify(three)));
const labels = moduleUrl(sources.labels.replaceAll("'three'", JSON.stringify(three)));
const packet = moduleUrl(sources.packet);
const samples = moduleUrl(sources.samples);
const view = moduleUrl(sources.view.replaceAll("'three'", JSON.stringify(three)).replaceAll("'three/addons/controls/OrbitControls.js'", JSON.stringify(controls)).replaceAll("'three/addons/renderers/CSS2DRenderer.js'", JSON.stringify(labels)).replaceAll("'./packet.js'", JSON.stringify(packet)));
const main = moduleUrl(sources.main.replaceAll("'./sample-packets.js'", JSON.stringify(samples)).replaceAll("'./blueprint-view.js'", JSON.stringify(view)).replaceAll("'./packet.js'", JSON.stringify(packet)));
await import(main);
`;
const standalone = html
  .replace(/\s*<link rel="stylesheet"[^>]+>/, '')
  .replace(/\s*<script type="importmap">.*?<\/script>/s, '')
  .replace('<script type="module" src="./src/ar/main.js"></script>', () => `<style>${css}</style><script type="module">${bootstrap}</script>`);
if (standalone === html) throw new Error('ar.html did not contain the expected module script tag.');
await cp(resolve(root, 'ar.html'), resolve(root, 'dist/ar.html'));
await writeFile(resolve(root, 'dist/jacobs-ar.html'), standalone);
await writeFile(resolve(root, 'jacobs-ar.html'), standalone);
console.log('Built dist/ar.html and jacobs-ar.html (single-file guidance view, no installation needed).');
