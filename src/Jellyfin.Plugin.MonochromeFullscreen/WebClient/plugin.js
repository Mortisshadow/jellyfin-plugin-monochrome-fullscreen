import { FullscreenOverlay } from './overlay.js';
import { JellyfinPlaybackAdapter } from './playback-adapter.js';
import { AmbientVisualizer } from './visualizer.js';

const INSTANCE_KEY = Symbol.for('jellyfin.monochromeFullscreen.instance');

export class MonochromeFullscreenController {
    constructor({ adapter, overlay, visualizer, settings }) {
        this.adapter = adapter;
        this.overlay = overlay;
        this.visualizer = visualizer;
        this.settings = settings;
        this.unsubscribe = null;
        this.dismissedItemId = null;
        this.started = false;
        this.onPlaybackEvent = this.onPlaybackEvent.bind(this);
    }

    start() {
        if (this.started || !this.settings.enabled) return;
        this.started = true;
        this.overlay.mount();
        this.unsubscribe = this.adapter.subscribe(this.onPlaybackEvent);
        this.adapter.start();
    }

    onPlaybackEvent(event) {
        if (event.type === 'stop') {
            this.close({ fromHistory: false, userInitiated: false });
            this.dismissedItemId = null;
            return;
        }

        if (event.mediaType !== 'Audio' || !event.item) {
            if (['start', 'initial', 'playerchange'].includes(event.type)) {
                this.close({ fromHistory: false, userInitiated: false });
            }
            return;
        }
        this.overlay.update(event.item);
        this.visualizer.setPlaybackPaused(event.item.paused);

        if ((event.type === 'start' || event.type === 'initial')
            && this.settings.autoOpen
            && event.item.id !== this.dismissedItemId) {
            this.overlay.open();
            this.visualizer.setOverlayOpen(true);
        }
    }

    close({ fromHistory = false, userInitiated = true } = {}) {
        if (userInitiated && this.overlay.lastModel?.id) this.dismissedItemId = this.overlay.lastModel.id;
        this.overlay.close({ fromHistory });
        this.visualizer.setOverlayOpen(false);
    }

    destroy() {
        if (!this.started) return;
        this.started = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.adapter.destroy();
        this.visualizer.destroy();
        this.overlay.destroy();
    }
}

async function loadSettings() {
    const response = await fetch(new URL('config.json', import.meta.url), {
        cache: 'no-store',
        credentials: 'same-origin'
    });
    if (!response.ok) throw new Error(`Configuration request failed with ${response.status}`);
    const settings = await response.json();
    const fpsLimit = [24, 30, 60].includes(settings.fpsLimit) ? settings.fpsLimit : 30;
    return {
        enabled: settings.enabled !== false,
        autoOpen: settings.autoOpen !== false,
        fpsLimit,
        backgroundEffect: settings.backgroundEffect !== false,
        reducedMotion: settings.reducedMotion === true,
        lowPowerMode: settings.lowPowerMode === true
    };
}

export default class MonochromeFullscreenPlugin {
    constructor(dependencies) {
        this.id = 'monochromeFullscreen';
        this.name = 'Monochrome Fullscreen';
        this.type = 'monochromeFullscreen';

        if (globalThis[INSTANCE_KEY]) {
            return globalThis[INSTANCE_KEY];
        }
        globalThis[INSTANCE_KEY] = this;
        this.initialize(dependencies).catch(error => {
            console.error('[MonochromeFullscreen] Client initialization failed', error);
        });
    }

    async initialize(dependencies) {
        const settings = await loadSettings();
        if (!settings.enabled) return;

        const adapter = new JellyfinPlaybackAdapter({
            events: dependencies.events,
            playbackManager: dependencies.playbackManager,
            ServerConnections: dependencies.ServerConnections
        });

        let controller;
        const overlay = new FullscreenOverlay({
            actions: {
                close: options => controller.close({ ...options, userInitiated: true }),
                playPause: () => adapter.playPause(),
                previous: () => adapter.previous(),
                next: () => adapter.next(),
                seek: ratio => adapter.seekToRatio(ratio),
                seekBy: seconds => adapter.seekBySeconds(seconds),
                setVolume: value => adapter.setVolume(value),
                toggleMute: () => adapter.toggleMute()
            }
        });
        overlay.mount();
        const visualizer = new AmbientVisualizer(overlay.canvas, settings);
        controller = new MonochromeFullscreenController({ adapter, overlay, visualizer, settings });
        this.controller = controller;
        controller.start();
        console.info('[MonochromeFullscreen] Client extension initialized');
    }
}

export { loadSettings };
