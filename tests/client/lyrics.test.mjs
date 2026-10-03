import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLyricDocument } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/lyrics-model.js';
import { LyricsTimeline, lyricPartProgress } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/lyrics-timeline.js';
import { LyricsAdapter } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/lyrics-adapter.js';
import { LyricsView } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/lyrics-view.js';

class Node {
    constructor(tag, ownerDocument) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentElement = null;
        this.textContent = ''; this.dataset = {}; this.attributes = {}; this.listeners = {};
        this.style = { values: {}, setProperty: (key, value) => { this.style.values[key] = value; } };
        this.classList = { values: new Set(), toggle: (name, force) => force ? this.classList.values.add(name) : this.classList.values.delete(name) };
    }
    appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
    removeChild(node) { this.children.splice(this.children.indexOf(node), 1); node.parentElement = null; }
    get firstChild() { return this.children[0] || null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    dispatchEvent(event) { for (const listener of this.listeners[event.type] || []) listener(event); }
    remove() { this.parentElement?.removeChild(this); }
    scrollIntoView(options) { this.scrolled = options; }
}
class Document { createElement(tag) { return new Node(tag, this); } }

const dto = {
    Language: 'en', Cues: [
        { Text: 'later', StartTicks: 20, EndTicks: 'bad' },
        { Text: 'first', StartTicks: 10, Syllables: [{ Text: 'fir', StartTicks: 10, EndTicks: 15 }, { Text: 'st', StartTicks: 15, EndTicks: 20 }] },
        { Text: 123, StartTicks: -1 }
    ]
};

test('normalizer validates, sorts, infers ends, and produces safe schema v1 strings', () => {
    const result = normalizeLyricDocument(dto);
    assert.equal(result.schemaVersion, 1); assert.equal(result.language, 'en'); assert.equal(result.syncType, 'word');
    assert.deepEqual(result.tracks[0].lines.map(line => line.startTicks), [10, 20]);
    assert.equal(result.tracks[0].lines[0].endTicks, 20);
    assert.equal(result.tracks[0].lines[1].endTicks, 20);
});

test('future tracks retain roles, agents, background, and syllable timing', () => {
    const result = normalizeLyricDocument({ Tracks: [
        { Type: 'translation', Lines: [{ Text: 'Hola', Start: 5 }] },
        { Type: 'main', Language: 'en', Lines: [{ Id: 'a', Text: 'Hi', Start: 5, Agents: ['lead', null], Background: true, Syllables: [{ Text: 'Hi', Start: 5, End: 9 }] }] }
    ] });
    assert.deepEqual(result.tracks.map(track => track.type), ['translation', 'main']);
    assert.deepEqual(result.tracks[1].lines[0].agentIds, ['lead']);
    assert.equal(result.tracks[1].lines[0].background, true);
    assert.equal(result.tracks[1].lines[0].parts[0].endTicks, 9);
});

test('timeline binary-seeks backwards and advances monotonically with an offset', () => {
    const document = normalizeLyricDocument({ Cues: [{ Text: 'a', StartTicks: 10 }, { Text: 'b', StartTicks: 20 }, { Text: 'c', StartTicks: 30 }] });
    const timeline = new LyricsTimeline(document, { timingOffsetTicks: 2 });
    assert.equal(timeline.seek(19).line.text, 'b');
    assert.equal(timeline.update(29).line.text, 'c');
    assert.equal(timeline.update(7).index, -1);
    assert.equal(timeline.update(8).line.text, 'a');
});

test('unsynchronized lyrics remain readable without selecting the final zero-time line', () => {
    const document = normalizeLyricDocument({ Lyrics: [{ Text: 'first' }, { Text: 'second' }] });
    const timeline = new LyricsTimeline(document);
    assert.equal(document.syncType, 'unsynced');
    assert.equal(timeline.update(50_000_000).index, -1);
});

test('word progress is deterministic and clamped', () => {
    const part = { startTicks: 10, endTicks: 20 };
    assert.equal(lyricPartProgress(part, 5), 0); assert.equal(lyricPartProgress(part, 15), 0.5); assert.equal(lyricPartProgress(part, 25), 1);
});

test('view uses textContent, renders secondary lines, updates progress, and seeks', () => {
    const documentObject = new Document(); const host = new Node('div', documentObject); const seeks = [];
    const document = normalizeLyricDocument({ Tracks: [
        { Type: 'main', Lines: [{ Text: '<img src=x onerror=alert(1)>', StartTicks: 10, Syllables: [{ Text: '<b>', StartTicks: 10, EndTicks: 20 }] }] },
        { Type: 'translation', Lines: [{ Text: '<script>translated</script>', StartTicks: 10 }] },
        { Type: 'phonetic', Lines: [{ Text: 'phonetic', StartTicks: 10 }] }
    ] });
    const view = new LyricsView({ host, documentObject, onSeek: ticks => seeks.push(ticks) });
    view.setDocument(document);
    const row = view.nodes[0].row;
    assert.equal(view.nodes[0].partNodes[0].textContent, '<b>');
    assert.equal(row.children[1].textContent, '<script>translated</script>');
    assert.equal(view.nodes[0].partNodes[0].children.length, 0);
    row.dispatchEvent({ type: 'click' }); assert.deepEqual(seeks, [10]);
    view.update(15); assert.equal(view.nodes[0].partNodes[0].style.values['--mfs-lyric-progress'], '50%');
    assert.equal(row.classList.values.has('mfs-lyric-active'), true);
    view.destroy(); assert.equal(host.children.length, 0);
});

test('missing and malformed data returns null without throwing', async () => {
    assert.equal(normalizeLyricDocument(null), null);
    assert.equal(normalizeLyricDocument({ Cues: [null, 4, {}] }), null);
    const adapter = new LyricsAdapter({ apiClient: { getUrl: path => path, getJSON: async () => { const error = new Error('missing'); error.status = 404; throw error; } } });
    assert.equal(await adapter.fetch('item'), null);
    assert.equal(await adapter.fetch(''), null);
});

test('adapter prefers the authenticated plugin route and aborts stale requests', async () => {
    const calls = []; let resolveFirst;
    const apiClient = { getUrl: path => path, getJSON(url, options) { calls.push({ url, options }); if (calls.length === 1) return new Promise(resolve => { resolveFirst = resolve; }); return Promise.resolve({ Cues: [{ Text: 'new', StartTicks: 0 }] }); } };
    const adapter = new LyricsAdapter({ apiClient });
    const stale = adapter.fetch('old'); const current = adapter.fetch('new'); resolveFirst({ Cues: [{ Text: 'old', StartTicks: 0 }] });
    assert.equal(await stale, null); assert.equal((await current).tracks[0].lines[0].text, 'new');
    assert.deepEqual(calls.map(call => call.url), ['/MonochromeFullscreen/Audio/old/Lyrics', '/MonochromeFullscreen/Audio/new/Lyrics']);
    assert.equal(calls[0].options.signal.aborted, true);
});

test('adapter falls back to Jellyfin native lyrics when no TTML sidecar exists', async () => {
    const calls = [];
    const adapter = new LyricsAdapter({ apiClient: {
        getUrl: path => path,
        async getJSON(url) {
            calls.push(url);
            if (url.startsWith('/MonochromeFullscreen/')) { const error = new Error('missing'); error.status = 404; throw error; }
            return { Lyrics: [{ Text: 'native', Start: 12 }] };
        }
    } });
    const document = await adapter.fetch('item');
    assert.equal(document.tracks[0].lines[0].text, 'native');
    assert.deepEqual(calls, ['/MonochromeFullscreen/Audio/item/Lyrics', '/Audio/item/Lyrics']);
});
