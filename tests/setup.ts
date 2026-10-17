// Node 26 ships an experimental global `localStorage` that is unusable without
// --localstorage-file (and warns on access). Replace it with jsdom's Storage.
const jsdom = (globalThis as { jsdom?: { window: { localStorage: Storage } } }).jsdom
if (jsdom) {
  Object.defineProperty(globalThis, 'localStorage', { value: jsdom.window.localStorage, configurable: true })
}
