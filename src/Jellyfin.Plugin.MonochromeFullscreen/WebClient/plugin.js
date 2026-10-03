import { FullscreenOverlay } from './overlay.js';
import { JellyfinPlaybackAdapter } from './playback-adapter.js';
import { AmbientVisualizer } from './visualizer.js';
import { LyricsAdapter } from './lyrics-adapter.js';
import { LyricsView } from './lyrics-view.js';

const INSTANCE_KEY = Symbol.for('jellyfin.monochromeFullscreen.instance');

export class MonochromeFullscreenController {
    constructor({ adapter, overlay, visualizer, lyricsAdapter, lyricsView, settings }) {
        this.adapter = adapter;
        this.overlay = overlay;
        this.visualizer = visualizer;
        this.lyricsAdapter = lyricsAdapter;
        this.lyricsView = lyricsView;
        this.settings = settings;
        this.unsubscribe = null;
        this.dismissedItemId = null;
        this.lyricsItemId = null;
        this.lyricsRequested = false;
        this.lyricsAvailable = false;
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
            this.clearLyrics();
            return;
        }

        if (event.mediaType !== 'Audio' || !event.item) {
            if (['start', 'initial', 'playerchange'].includes(event.type)) {
                this.close({ fromHistory: false, userInitiated: false });
                this.clearLyrics();
            }
            return;
        }
        this.overlay.update(event.item);
        this.visualizer.setCoverUrl?.(event.item.coverUrl);
        this.visualizer.setPlaybackPaused(event.item.paused);
        this.lyricsView?.update(event.item.positionTicks);

        if (this.lyricsAdapter && this.lyricsView && event.item.id !== this.lyricsItemId) {
            this.loadLyrics(event.item).catch(error => {
                console.warn('[MonochromeFullscreen] Unable to prepare lyrics', error);
            });
        }

        if ((event.type === 'start' || event.type === 'initial')
            && this.settings.autoOpen
            && event.item.id !== this.dismissedItemId) {
            this.overlay.open();
            this.visualizer.setOverlayOpen(true);
        }
    }

    async loadLyrics(item) {
        this.lyricsItemId = item.id;
        this.lyricsAvailable = false;
        this.overlay.setLyricsAvailable(false);
        this.lyricsView.setDocument(null);
        const document = await this.lyricsAdapter.fetch(item.id, item.serverId);
        if (this.lyricsItemId !== item.id) return;
        this.lyricsView.setDocument(document);
        this.lyricsAvailable = Boolean(document?.tracks?.length);
        this.overlay.setLyricsAvailable(this.lyricsAvailable);
        this.overlay.setLyricsVisible(this.lyricsRequested && this.lyricsAvailable);
        this.lyricsView.update(this.overlay.lastModel?.positionTicks || 0);
    }

    toggleLyrics() {
        if (!this.lyricsAvailable) return;
        this.lyricsRequested = !this.overlay.lyricsVisible;
        this.overlay.setLyricsVisible(this.lyricsRequested);
    }

    clearLyrics() {
        this.lyricsAdapter?.abort();
        this.lyricsItemId = null;
        this.lyricsAvailable = false;
        this.lyricsView?.setDocument(null);
        this.overlay.setLyricsAvailable?.(false);
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
        this.lyricsAdapter?.destroy();
        this.lyricsView?.destroy();
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
                toggleMute: () => adapter.toggleMute(),
                toggleLyrics: () => controller.toggleLyrics()
            }
        });
        overlay.mount();
        const visualizer = new AmbientVisualizer(overlay.canvas, settings);
        const lyricsAdapter = new LyricsAdapter({ apiClientProvider: serverId => adapter.getApiClient(serverId) });
        const lyricsView = new LyricsView({ host: overlay.lyricsHost, onSeek: ticks => adapter.seekTicks(ticks) });
        controller = new MonochromeFullscreenController({ adapter, overlay, visualizer, lyricsAdapter, lyricsView, settings });
        this.controller = controller;
        controller.start();
        console.info('[MonochromeFullscreen] Client extension initialized');
    }
}

export { loadSettings };
