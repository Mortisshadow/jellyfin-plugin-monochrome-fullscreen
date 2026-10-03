import test from 'node:test';
import assert from 'node:assert/strict';
import { ActiveAnimationClock, MAX_FRAME_DELTA_MS } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/animation-clock.js';
import { AmbientVisualizer } from '../../src/Jellyfin.Plugin.MonochromeFullscreen/WebClient/visualizer.js';

function eventTarget(properties = {}) {
    const listeners = new Map();
    return {
        ...properties,
        addEventListener(name, callback) {
            const callbacks = listeners.get(name) || [];
            callbacks.push(callback);
            listeners.set(name, callbacks);
        },
        removeEventListener(name, callback) {
            listeners.set(name, (listeners.get(name) || []).filter(value => value !== callback));
        },
        dispatch(name) {
            for (const callback of listeners.get(name) || []) callback({ type: name, preventDefault() {} });
        }
    };
}

function visualizerFixture() {
    const documentObject = eventTarget({ hidden: false });
    const windowObject = eventTarget({
        devicePixelRatio: 1,
        matchMedia: () => ({ matches: false })
    });
    const canvas = eventTarget({
        hidden: false,
        width: 0,
        height: 0,
        getBoundingClientRect: () => ({ width: 160, height: 90 })
    });
    const renderedTimes = [];
    let callback = null;
    let nextHandle = 0;
    const visualizer = new AmbientVisualizer(canvas, {
        backgroundEffect: true,
        reducedMotion: false,
        lowPowerMode: false,
        fpsLimit: 60
    }, {
        documentObject,
        windowObject,
        rendererFactory: () => ({
            resize() {},
            render(activeTime) { renderedTimes.push(activeTime); },
            destroy() {}
        }),
        requestAnimationFrame: next => {
            callback = next;
            nextHandle += 1;
            return nextHandle;
        },
        cancelAnimationFrame: () => { callback = null; }
    });

    return {
        documentObject,
        renderedTimes,
        visualizer,
        frame(timestamp) {
            const next = callback;
            assert.ok(next, `no frame queued for timestamp ${timestamp}`);
            callback = null;
            next(timestamp);
        }
    };
}

test('playback pause excludes a 60-second wall-time gap and resume does not jump', () => {
    const fixture = visualizerFixture();
    fixture.visualizer.setOverlayOpen(true);
    for (let timestamp = 0; timestamp <= 1_000; timestamp += 20) fixture.frame(timestamp);
    assert.equal(fixture.renderedTimes.at(-1), 1_000);

    fixture.visualizer.setPlaybackPaused(true);
    fixture.visualizer.setPlaybackPaused(false);
    fixture.frame(61_000);
    assert.equal(fixture.renderedTimes.at(-1), 1_000);
    fixture.frame(61_020);
    assert.equal(fixture.renderedTimes.at(-1), 1_020);
    fixture.visualizer.destroy();
});

test('visibility resume primes the first resumed frame', () => {
    const fixture = visualizerFixture();
    fixture.visualizer.setOverlayOpen(true);
    fixture.frame(4_000);
    fixture.frame(4_020);
    assert.equal(fixture.renderedTimes.at(-1), 20);

    fixture.documentObject.hidden = true;
    fixture.documentObject.dispatch('visibilitychange');
    fixture.documentObject.hidden = false;
    fixture.documentObject.dispatch('visibilitychange');
    fixture.frame(20_000);
    assert.equal(fixture.renderedTimes.at(-1), 20);
    fixture.frame(20_020);
    assert.equal(fixture.renderedTimes.at(-1), 40);
    fixture.visualizer.destroy();
});

test('normal frames accumulate active elapsed time and clamp pathological deltas', () => {
    const clock = new ActiveAnimationClock();
    clock.resume();
    assert.equal(clock.advance(10), 0);
    assert.equal(clock.advance(26), 16);
    assert.equal(clock.advance(59), 49);
    assert.equal(clock.advance(10_000), 49 + MAX_FRAME_DELTA_MS);
    assert.equal(clock.advance(10_016), 65 + MAX_FRAME_DELTA_MS);
});
