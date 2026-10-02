const TICKS_PER_SECOND = 10_000_000;

/**
 * Central compatibility boundary around Jellyfin Web's injected playback APIs.
 * No UI module accesses Jellyfin globals or internal player objects directly.
 */
export class JellyfinPlaybackAdapter {
    constructor({ events, playbackManager, ServerConnections, logger = console }) {
        this.events = events;
        this.manager = playbackManager;
        this.connections = ServerConnections;
        this.logger = logger;
        this.listeners = new Set();
        this.player = null;
        this.started = false;

        this.onPlaybackStart = this.onPlaybackStart.bind(this);
        this.onPlaybackStop = this.onPlaybackStop.bind(this);
        this.onPlayerChange = this.onPlayerChange.bind(this);
        this.onPlayerUpdate = this.onPlayerUpdate.bind(this);
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    start() {
        if (this.started) return;
        this.started = true;
        this.events.on(this.manager, 'playbackstart', this.onPlaybackStart);
        this.events.on(this.manager, 'playbackstop', this.onPlaybackStop);
        this.events.on(this.manager, 'playerchange', this.onPlayerChange);
        this.bindPlayer(this.manager.getCurrentPlayer?.());
        this.emitCurrent('initial');
    }

    destroy() {
        if (!this.started) return;
        this.started = false;
        this.events.off(this.manager, 'playbackstart', this.onPlaybackStart);
        this.events.off(this.manager, 'playbackstop', this.onPlaybackStop);
        this.events.off(this.manager, 'playerchange', this.onPlayerChange);
        this.bindPlayer(null);
        this.listeners.clear();
    }

    onPlaybackStart(_event, player, state) {
        this.bindPlayer(player);
        this.emitState('start', player, state);
    }

    onPlaybackStop(_event, stopInfo = {}) {
        if (stopInfo.nextMediaType === 'Audio') return;
        this.emit({ type: 'stop' });
    }

    onPlayerChange() {
        this.bindPlayer(this.manager.getCurrentPlayer?.());
        this.emitCurrent('playerchange');
    }

    onPlayerUpdate() {
        this.emitCurrent('update');
    }

    bindPlayer(nextPlayer) {
        if (nextPlayer === this.player) return;
        if (this.player) {
            for (const eventName of ['timeupdate', 'pause', 'unpause', 'volumechange']) {
                this.events.off(this.player, eventName, this.onPlayerUpdate);
            }
        }

        this.player = nextPlayer || null;
        if (this.player) {
            for (const eventName of ['timeupdate', 'pause', 'unpause', 'volumechange']) {
                this.events.on(this.player, eventName, this.onPlayerUpdate);
            }
        }
    }

    emitCurrent(type) {
        const player = this.manager.getCurrentPlayer?.() || this.player;
        if (!player) return;
        try {
            this.emitState(type, player, this.manager.getPlayerState(player));
        } catch (error) {
            this.logger.warn('[MonochromeFullscreen] Unable to read player state', error);
        }
    }

    emitState(type, player, state) {
        const item = state?.NowPlayingItem;
        if (!item) return;
        this.emit({
            type,
            mediaType: item.MediaType || null,
            item: this.toViewModel(item, state, player)
        });
    }

    emit(event) {
        for (const listener of this.listeners) listener(event);
    }

    toViewModel(item, state, player) {
        const playState = state.PlayState || {};
        const durationTicks = Number(item.RunTimeTicks || this.manager.duration?.(player) || 0);
        const artist = Array.isArray(item.Artists) && item.Artists.length
            ? item.Artists.join(', ')
            : (item.AlbumArtist || '');

        return {
            id: String(item.Id || ''),
            title: String(item.Name || 'Unknown title'),
            artist: String(artist || 'Unknown artist'),
            album: String(item.Album || ''),
            positionTicks: Number(playState.PositionTicks || 0),
            durationTicks,
            paused: Boolean(playState.IsPaused),
            muted: Boolean(playState.IsMuted ?? this.manager.isMuted?.(player)),
            volume: Number(playState.VolumeLevel ?? this.manager.getVolume?.(player) ?? 100),
            canSeek: playState.CanSeek !== false,
            coverUrl: this.getCoverUrl(item)
        };
    }

    getCoverUrl(item) {
        if (!item?.ServerId) return null;
        const apiClient = this.connections.getApiClient?.(item.ServerId);
        if (!apiClient?.getScaledImageUrl) return null;

        const itemId = item.PrimaryImageItemId || item.Id;
        const primaryTag = item.ImageTags?.Primary;
        if (itemId && primaryTag) {
            return apiClient.getScaledImageUrl(itemId, { type: 'Primary', tag: primaryTag, maxHeight: 1200 });
        }

        if (item.AlbumId && item.AlbumPrimaryImageTag) {
            return apiClient.getScaledImageUrl(item.AlbumId, {
                type: 'Primary',
                tag: item.AlbumPrimaryImageTag,
                maxHeight: 1200
            });
        }

        return null;
    }

    playPause() {
        return this.manager.playPause?.(this.player);
    }

    previous() {
        return this.manager.previousTrack?.(this.player);
    }

    next() {
        return this.manager.nextTrack?.(this.player);
    }

    seekToRatio(ratio) {
        if (!this.player) return;
        const state = this.manager.getPlayerState(this.player);
        const duration = Number(state?.NowPlayingItem?.RunTimeTicks || this.manager.duration?.(this.player) || 0);
        if (duration > 0) this.manager.seek?.(Math.round(duration * Math.max(0, Math.min(1, ratio))), this.player);
    }

    seekBySeconds(seconds) {
        if (!this.player) return;
        const state = this.manager.getPlayerState(this.player);
        const current = Number(state?.PlayState?.PositionTicks || 0);
        const duration = Number(state?.NowPlayingItem?.RunTimeTicks || this.manager.duration?.(this.player) || 0);
        const target = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, current + (seconds * TICKS_PER_SECOND)));
        this.manager.seek?.(target, this.player);
    }

    setVolume(value) {
        this.manager.setVolume?.(Math.max(0, Math.min(100, Number(value))), this.player);
    }

    toggleMute() {
        this.manager.toggleMute?.(undefined, this.player);
    }
}

export { TICKS_PER_SECOND };
