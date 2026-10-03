import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JellyfinPlaybackAdapter } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/playback-adapter.js';
import { MonochromeFullscreenController } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/plugin.js';
import { FullscreenOverlay } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/overlay.js';
import { AmbientVisualizer, createWebGLRenderer, PROFILES } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/visualizer.js';

class Events {
  constructor() { this.bindings = []; }
  on(target, name, fn) { this.bindings.push({ target, name, fn }); }
  off(target, name, fn) { this.bindings = this.bindings.filter(b => b.target !== target || b.name !== name || b.fn !== fn); }
  emit(target, name, ...args) { for (const b of [...this.bindings]) if (b.target === target && b.name === name) b.fn(...args); }
  count(name) { return this.bindings.filter(b => b.name === name).length; }
}

class Node {
  constructor(tag = 'div', doc = null) { this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.parentElement = null; this.listeners = {}; this.classList = { values: new Set(), add: (...v) => v.forEach(x => this.classList.values.add(x)), remove: (...v) => v.forEach(x => this.classList.values.delete(x)), contains: x => this.classList.values.has(x) }; this.dataset = {}; this.style = {}; this.hidden = false; this.textContent = ''; this.attributes = {}; this.tabIndex = 0; }
  append(...nodes) { nodes.forEach(n => { n.parentElement = this; this.children.push(n); }); }
  appendChild(n) { this.append(n); return n; }
  remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(x => x !== fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  removeAttribute(k) { delete this.attributes[k]; }
  getAttribute(k) { return this.attributes[k]; }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  querySelectorAll(selector) { const result = []; const visit = n => { for (const child of n.children) { if (selector.includes('button') && child.tagName === 'BUTTON' || selector.includes('input') && child.tagName === 'INPUT' || selector.includes('[tabindex') && child.tabIndex >= 0) result.push(child); visit(child); } }; visit(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class Document extends Node {
  constructor() { super('#document', null); this.ownerDocument = this; this.body = new Node('body', this); this.appendChild(this.body); this.activeElement = null; this.hidden = false; }
  createElement(tag) { return new Node(tag, this); }
  getElementById(id) { let found = null; const visit = n => { if (n.attributes.id === id || n.id === id) found = n; n.children.forEach(visit); }; visit(this); return found; }
}

class Window extends Node {
  constructor() { super('window', null); this.history = { state: {}, pushState: () => {}, back: () => {} }; this.location = { href: 'http://localhost/' }; this.devicePixelRatio = 1; }
  matchMedia() { return { matches: false }; }
  requestAnimationFrame(fn) { this.callback = fn; return 1; }
  cancelAnimationFrame() { this.callback = null; }
}

function playbackFixture() {
  const events = new Events();
  const player = {};
  const manager = { getCurrentPlayer: () => player, getPlayerState: () => ({ NowPlayingItem: { Id: '1', Name: 'Song', MediaType: 'Audio', Artists: ['Artist'], Album: 'Album', RunTimeTicks: 20_000_000 }, PlayState: { PositionTicks: 0, CanSeek: true } }) };
  return { events, player, manager, adapter: new JellyfinPlaybackAdapter({ events, playbackManager: manager, ServerConnections: {} }) };
}

function fakeOverlay() { return { lastModel: null, mounted: 0, opened: 0, closed: 0, destroyed: 0, mount() { this.mounted++; }, update(model) { this.lastModel = model; }, open() { this.opened++; }, close() { this.closed++; }, destroy() { this.destroyed++; } }; }
function fakeVisualizer() { return { paused: [], open: [], destroyed: 0, setPlaybackPaused(v) { this.paused.push(v); }, setOverlayOpen(v) { this.open.push(v); }, destroy() { this.destroyed++; } }; }
const audio = item => ({ type: 'start', mediaType: 'Audio', item: { id: item, title: `Title ${item}`, artist: 'Artist', album: 'Album', paused: false, volume: 80 } });

test('playback adapter starts audio, ignores video, and updates track metadata', () => {
  const { adapter, events, player, manager } = playbackFixture();
  const seen = []; adapter.subscribe(e => seen.push(e)); adapter.start();
  events.emit(manager, 'playbackstart', { type: 'playbackstart' }, player, { NowPlayingItem: { Id: 'a', Name: 'Audio', MediaType: 'Audio' }, PlayState: {} });
  events.emit(manager, 'playbackstart', { type: 'playbackstart' }, player, { NowPlayingItem: { Id: 'v', Name: 'Video', MediaType: 'Video' }, PlayState: {} });
  events.emit(manager, 'playerchange', { type: 'playerchange' });
  assert.equal(seen.some(e => e.item?.title === 'Audio'), true);
  assert.equal(seen.some(e => e.mediaType === 'Video'), true); // adapter exposes media type; controller filters it
  const controller = new MonochromeFullscreenController({ adapter: { subscribe: () => () => {}, start() {} }, overlay: fakeOverlay(), visualizer: fakeVisualizer(), settings: { enabled: true, autoOpen: true } });
  controller.onPlaybackEvent(audio('one')); controller.onPlaybackEvent(audio('two')); assert.equal(controller.overlay.lastModel.id, 'two');
});

test('controller auto-opens audio only, closes on stop, and autoOpen false stays closed', () => {
  const overlay = fakeOverlay(); const visualizer = fakeVisualizer();
  const controller = new MonochromeFullscreenController({ adapter: { subscribe: () => () => {}, start() {}, destroy() {} }, overlay, visualizer, settings: { enabled: true, autoOpen: true } });
  controller.onPlaybackEvent(audio('a')); controller.onPlaybackEvent({ type: 'start', mediaType: 'Video', item: audio('v').item });
  assert.equal(overlay.opened, 1); assert.equal(overlay.closed, 1); assert.deepEqual(visualizer.open, [true, false]);
  controller.onPlaybackEvent({ type: 'stop' }); assert.equal(overlay.closed, 2); assert.deepEqual(visualizer.open, [true, false, false]);
  const noAuto = fakeOverlay(); const c2 = new MonochromeFullscreenController({ adapter: {}, overlay: noAuto, visualizer: fakeVisualizer(), settings: { enabled: true, autoOpen: false } });
  c2.onPlaybackEvent(audio('b')); assert.equal(noAuto.opened, 0);
  const videoOnly = fakeOverlay(); const c3 = new MonochromeFullscreenController({ adapter: {}, overlay: videoOnly, visualizer: fakeVisualizer(), settings: { enabled: true, autoOpen: true } });
  c3.onPlaybackEvent({ type: 'start', mediaType: 'Video', item: audio('v').item }); assert.equal(videoOnly.opened, 0);
});

test('controller start is idempotent and destroy unsubscribes once', () => {
  let subscriptions = 0; let unsubscribes = 0; let starts = 0; let destroys = 0;
  const adapter = { subscribe: () => { subscriptions++; return () => { unsubscribes++; }; }, start: () => { starts++; }, destroy: () => { destroys++; } };
  const controller = new MonochromeFullscreenController({ adapter, overlay: fakeOverlay(), visualizer: fakeVisualizer(), settings: { enabled: true, autoOpen: true } });
  controller.start(); controller.start(); assert.equal(subscriptions, 1); assert.equal(starts, 1); controller.destroy(); controller.destroy(); assert.equal(unsubscribes, 1); assert.equal(destroys, 1);
});

test('controller loads lyrics once per item and preserves explicit lyrics visibility', async () => {
  const overlay = {
    ...fakeOverlay(), lyricsVisible: false, availability: [], visibility: [],
    setLyricsAvailable(value) { this.availability.push(value); },
    setLyricsVisible(value) { this.lyricsVisible = value; this.visibility.push(value); }
  };
  const lyricDocument = { syncType: 'line', tracks: [{ type: 'main', lines: [{ id: 'a', startTicks: 0, endTicks: 10, text: 'line', parts: [] }] }] };
  const fetches = [];
  const lyricsAdapter = { async fetch(id, serverId) { fetches.push([id, serverId]); return lyricDocument; }, abort() {}, destroy() {} };
  const lyricsView = { documents: [], positions: [], setDocument(value) { this.documents.push(value); }, update(value) { this.positions.push(value); }, destroy() {} };
  const controller = new MonochromeFullscreenController({ adapter: {}, overlay, visualizer: fakeVisualizer(), lyricsAdapter, lyricsView, settings: { enabled: true, autoOpen: false } });
  const event = audio('track'); event.item.serverId = 'server'; event.item.positionTicks = 4;
  controller.onPlaybackEvent(event);
  await Promise.resolve();
  assert.deepEqual(fetches, [['track', 'server']]); assert.equal(controller.lyricsAvailable, true);
  controller.toggleLyrics(); assert.equal(overlay.lyricsVisible, true);
  controller.onPlaybackEvent({ ...event, type: 'update', item: { ...event.item, positionTicks: 8 } });
  assert.equal(fetches.length, 1); assert.equal(lyricsView.positions.at(-1), 8);
});

test('overlay handles Escape, close callback, missing metadata, and text as data', () => {
  globalThis.CSS = { escape: value => String(value).replaceAll('"', '\\"') };
  const documentObject = new Document(); const windowObject = new Window(); const actions = { closeCalls: [], close(options) { this.closeCalls.push(options); }, seek() {}, seekBy() {}, previous() {}, next() {}, playPause() {}, setVolume() {}, toggleMute() {} };
  const overlay = new FullscreenOverlay({ documentObject, windowObject, actions }); overlay.mount(); overlay.update({ title: '<script>alert(1)</script>', artist: null, album: null, positionTicks: 0, durationTicks: 0, canSeek: false, paused: false, volume: 50, muted: false });
  assert.equal(overlay.title.textContent, '<script>alert(1)</script>'); assert.equal(overlay.title.children.length, 0); assert.doesNotThrow(() => overlay.update({}));
  overlay.open(); overlay.root.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} }); assert.equal(actions.closeCalls.length, 1); overlay.close(); assert.equal(overlay.root.hidden, true);
  const closeButton = overlay.root.children.find(child => child.dataset.action === 'close'); closeButton.dispatchEvent({ type: 'click' }); assert.equal(actions.closeCalls.length, 2);
  overlay.update({ title: 'No cover', artist: '', album: '', positionTicks: 0, durationTicks: 0, canSeek: true, paused: true, volume: 0, muted: true, coverUrl: null }); assert.equal(overlay.cover.hidden, true);
  assert.equal(overlay.playIcon.getAttribute('hidden'), undefined); assert.equal(overlay.pauseIcon.getAttribute('hidden'), '');
  assert.equal(overlay.volumeIcon.getAttribute('hidden'), ''); assert.equal(overlay.mutedIcon.getAttribute('hidden'), undefined);
  assert.equal(overlay.mount(), overlay.root); assert.equal(documentObject.body.children.filter(child => child.id === 'monochromeFullscreen').length, 1);
});

test('visualizer stops when overlay closes and pauses while document is hidden', () => {
  const documentObject = new Document(); const windowObject = new Window(); const canvas = new Node('canvas', documentObject); canvas.getBoundingClientRect = () => ({ width: 100, height: 100 });
  let renders = 0; const covers = []; const visualizer = new AmbientVisualizer(canvas, { backgroundEffect: true, reducedMotion: false, lowPowerMode: false, fpsLimit: 30 }, { documentObject, windowObject, rendererFactory: () => ({ resize() {}, render() { renders++; }, loadCover(url) { covers.push(url); }, destroy() {} }), requestAnimationFrame: fn => { windowObject.callback = fn; return 1; }, cancelAnimationFrame: () => { windowObject.callback = null; } });
  visualizer.setCoverUrl('/cover.jpg');
  visualizer.setOverlayOpen(true); assert.equal(visualizer.frameHandle, 1); documentObject.hidden = true; documentObject.dispatchEvent({ type: 'visibilitychange' }); assert.equal(visualizer.frameHandle, null); documentObject.hidden = false; visualizer.setOverlayOpen(true); visualizer.setPlaybackPaused(true); assert.equal(visualizer.frameHandle, null); visualizer.setOverlayOpen(false); assert.equal(visualizer.frameHandle, null); visualizer.destroy();
  assert.deepEqual(covers, ['/cover.jpg']);
});

test('visualizer initializes an asynchronous renderer and forwards artwork', async () => {
  const documentObject = new Document(); const windowObject = new Window(); const canvas = new Node('canvas', documentObject); canvas.getBoundingClientRect = () => ({ width: 160, height: 90 });
  const covers = []; const renderer = { resize() {}, render() {}, loadCover(url) { covers.push(url); }, destroy() {} };
  const visualizer = new AmbientVisualizer(canvas, { backgroundEffect: true, reducedMotion: false, lowPowerMode: false, fpsLimit: 30 }, { documentObject, windowObject, rendererFactory: async () => renderer, requestAnimationFrame: fn => { windowObject.callback = fn; return 1; }, cancelAnimationFrame: () => { windowObject.callback = null; } });
  visualizer.setCoverUrl('/async-cover.jpg'); visualizer.setOverlayOpen(true);
  await visualizer.rendererLoading;
  assert.equal(visualizer.renderer, renderer); assert.equal(visualizer.frameHandle, 1); assert.deepEqual(covers, ['/async-cover.jpg']); visualizer.destroy();
});

test('renderer falls back from a broken WebGL2 pipeline to WebGL1', () => {
  const fakeGl = compileOk => ({
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, BLEND: 8, SRC_ALPHA: 9, ONE: 10, COLOR_BUFFER_BIT: 11, POINTS: 12,
    createProgram: () => ({}), createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => compileOk, getShaderInfoLog: () => 'compile failed', deleteShader() {}, attachShader() {}, linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => '', deleteProgram() {},
    createBuffer: () => ({}), bindBuffer() {}, bufferData() {}, deleteBuffer() {}, getAttribLocation: () => 0, getUniformLocation: () => ({}), useProgram() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, clearColor() {}, enable() {}, blendFunc() {}, viewport() {}, clear() {}, uniform1f() {}, drawArrays() {},
    getExtension: () => ({ loseContext() {} })
  });
  const requested = []; const options = [];
  const canvas = { getContext(name, value) { requested.push(name); options.push(value); return name === 'webgl2' ? fakeGl(false) : fakeGl(true); } };
  const renderer = createWebGLRenderer(canvas, PROFILES.balanced);
  assert.ok(renderer); assert.deepEqual(requested, ['webgl2', 'webgl']); assert.equal(options.every(value => value.preserveDrawingBuffer === false && value.antialias === false), true); renderer.destroy();
});

test('styles are scoped and Abyss variables include fallbacks', () => {
  const css = fs.readFileSync(path.resolve('src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/styles.css'), 'utf8');
  const lyricsCss = fs.readFileSync(path.resolve('src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/lyrics.css'), 'utf8');
  assert.match(css, /#monochromeFullscreen/); assert.match(css, /var\(--abyss-accent,\s*#f6f4ef\)/); assert.match(css, /var\(--abyss-radius,\s*1\.125rem\)/);
  assert.match(css, /mask-image:\s*radial-gradient\(circle at center,\s*transparent 0 6\.25%/);
  assert.doesNotMatch(css, /\.mfs-spindle::after/);
  assert.match(css, /\.mfs-visualizer\s*\{[^}]*opacity:\s*\.8/);
  assert.match(css, /top:\s*calc\(2rem \+ env\(safe-area-inset-top\)\)/);
  assert.match(lyricsCss, /opacity:\s*max\(0\.08,\s*calc\(1 - var\(--mfs-lyric-distance\) \* 0\.55\)\)/);
  assert.match(lyricsCss, /--mfs-lyric-color:\s*var\(--abyss-text,\s*#f6f4ef\)/);
  assert.doesNotMatch(lyricsCss, /linear-gradient\([^\n]*currentColor/);
  assert.doesNotMatch(fs.readFileSync(path.resolve('src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/overlay.js'), 'utf8'), /🔊|🔇|⏮|⏭/);
  for (const line of css.split(/\r?\n/).map(value => value.trim()).filter(value => value.endsWith('{'))) {
    if (line.startsWith('@')) continue;
    assert.equal(line.startsWith('#monochromeFullscreen'), true, `unscoped selector: ${line}`);
  }
});

test('middleware exposes every imported client module and both stylesheets', () => {
  const middleware = fs.readFileSync(path.resolve('src/Jellyfin.Plugin.MonochromeFullscreen/WebClientMiddleware.cs'), 'utf8');
  for (const asset of ['animation-clock.js', 'lyrics-adapter.js', 'lyrics-model.js', 'lyrics-timeline.js', 'lyrics-view.js', 'lyrics.css']) {
    assert.match(middleware, new RegExp(`\\["${asset.replace('.', '\\.')}"\\]`));
  }
  assert.match(middleware, /lyrics\.css\?v=/);
});
