import { InputAdapter } from './input-adapter.js';

function element(documentObject, tag, className, text) {
    const node = documentObject.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(documentObject, className, label, text) {
    const node = element(documentObject, 'button', className, text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    return node;
}

function icon(documentObject, name, paths) {
    const namespace = 'http://www.w3.org/2000/svg';
    const create = tag => documentObject.createElementNS
        ? documentObject.createElementNS(namespace, tag)
        : documentObject.createElement(tag);
    const svg = create('svg');
    svg.setAttribute('class', `mfs-icon mfs-icon-${name}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const data of paths) {
        const path = create('path');
        path.setAttribute('d', data);
        svg.appendChild(path);
    }
    return svg;
}

function setIconHidden(node, hidden) {
    if (hidden) node.setAttribute('hidden', '');
    else node.removeAttribute('hidden');
}

// Control treatment adapted and modified from Monochrome at commit
// 5b1e6ef9b2531e3c9c9a83a1c7690b5a833567a7 (Apache-2.0).
const ICONS = {
    close: ['M18 6 6 18M6 6l12 12'],
    lyrics: ['M5 5h14M5 9h10M5 13h14M5 17h8', 'M17 15v4.25a2.25 2.25 0 11-1.5-2.12V15z'],
    previous: ['M6.5 5v14M18 6.5l-8 5.5 8 5.5z'],
    play: ['M8.5 5.5v13l10-6.5z'],
    pause: ['M8 5.5v13M16 5.5v13'],
    next: ['M17.5 5v14M6 6.5l8 5.5-8 5.5z'],
    volume: ['M4.5 10v4h3l4 3.5v-11L7.5 10z', 'M15 9a4 4 0 010 6M17.5 6.5a7.5 7.5 0 010 11'],
    muted: ['M4.5 10v4h3l4 3.5v-11L7.5 10z', 'M15.5 9.5l4 5M19.5 9.5l-4 5'],
    audioLines: ['M5 5v14M9 8v8M13 3v18M17 8v8M21 5v14'],
    eye: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z', 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
    eyeOff: ['M3 3l18 18', 'M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a10.8 10.8 0 0 0 3.5-.6']
};

function formatTime(ticks) {
    const seconds = Math.max(0, Math.floor(Number(ticks || 0) / 10_000_000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * Fullscreen overlay. It receives plain view models and callbacks only.
 */
export class FullscreenOverlay {
    constructor({ documentObject = document, windowObject = window, actions }) {
        this.document = documentObject;
        this.window = windowObject;
        this.actions = actions;
        this.root = null;
        this.input = null;
        this.isOpen = false;
        this.lastModel = null;
        this.lyricsVisible = false;
        this.playbackPaused = false;
        this.lyricsAvailable = false;
        this.lyricsHost = null;
        this.visualizerEnabled = true;
        this.uiHidden = false;
    }

    mount() {
        const existing = this.document.getElementById('monochromeFullscreen');
        if (existing) {
            if (existing !== this.root && existing.dataset.monochromeFullscreenOwned !== 'true') {
                throw new Error('The #monochromeFullscreen id is already owned by another page element.');
            }
            this.root = existing;
            return existing;
        }

        const root = element(this.document, 'section', 'mfs-overlay');
        root.id = 'monochromeFullscreen';
        root.dataset.monochromeFullscreenOwned = 'true';
        root.hidden = true;
        root.tabIndex = -1;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Now playing fullscreen');

        this.canvas = element(this.document, 'canvas', 'mfs-visualizer');
        this.canvas.setAttribute('aria-hidden', 'true');
        root.appendChild(this.canvas);

        this.backdrop = element(this.document, 'div', 'mfs-cover-backdrop');
        this.backdrop.setAttribute('aria-hidden', 'true');
        root.appendChild(this.backdrop);

        const topActions = element(this.document, 'div', 'mfs-top-actions');
        topActions.setAttribute('aria-label', 'Fullscreen controls');

        const close = button(this.document, 'mfs-top-action mfs-close', 'Close fullscreen view');
        close.appendChild(icon(this.document, 'close', ICONS.close));
        close.dataset.action = 'close';
        close.addEventListener('click', () => this.actions.close({ fromHistory: false }));
        topActions.appendChild(close);

        this.lyricsButton = button(this.document, 'mfs-top-action mfs-lyrics-toggle', 'Show lyrics');
        this.lyricsButton.appendChild(icon(this.document, 'lyrics', ICONS.lyrics));
        this.lyricsButton.dataset.action = 'toggleLyrics';
        this.lyricsButton.setAttribute('aria-controls', 'monochromeFullscreenLyrics');
        this.lyricsButton.setAttribute('aria-pressed', 'false');
        this.lyricsButton.setAttribute('aria-expanded', 'false');
        this.lyricsButton.addEventListener('click', () => this.actions.toggleLyrics?.());
        topActions.appendChild(this.lyricsButton);

        this.visualizerButton = button(this.document, 'mfs-top-action mfs-visualizer-toggle', 'Disable visualizer');
        this.visualizerIcon = icon(this.document, 'audio-lines', ICONS.audioLines);
        this.visualizerButton.appendChild(this.visualizerIcon);
        this.visualizerButton.dataset.action = 'toggleVisualizer';
        this.visualizerButton.setAttribute('aria-pressed', 'true');
        this.visualizerButton.addEventListener('click', () => this.actions.toggleVisualizer?.());
        topActions.appendChild(this.visualizerButton);

        this.uiButton = button(this.document, 'mfs-top-action mfs-ui-toggle', 'Hide interface');
        this.eyeIcon = icon(this.document, 'eye', ICONS.eye);
        this.eyeOffIcon = icon(this.document, 'eye-off', ICONS.eyeOff);
        setIconHidden(this.eyeOffIcon, true);
        this.uiButton.append(this.eyeIcon, this.eyeOffIcon);
        this.uiButton.dataset.action = 'toggleUi';
        this.uiButton.setAttribute('aria-pressed', 'false');
        this.uiButton.addEventListener('click', () => this.actions.toggleUi?.());
        topActions.appendChild(this.uiButton);
        root.appendChild(topActions);

        const layout = element(this.document, 'div', 'mfs-layout');
        const stage = element(this.document, 'div', 'mfs-stage');
        const player = element(this.document, 'div', 'mfs-player');
        const artworkFrame = element(this.document, 'div', 'mfs-artwork-frame');
        this.cover = element(this.document, 'img', 'mfs-cover');
        this.cover.alt = '';
        this.cover.hidden = true;
        this.cover.addEventListener('error', () => {
            this.cover.hidden = true;
            artworkFrame.classList.add('mfs-artwork-missing');
        });
        artworkFrame.appendChild(this.cover);
        const spindle = element(this.document, 'span', 'mfs-spindle');
        spindle.setAttribute('aria-hidden', 'true');
        artworkFrame.appendChild(spindle);

        const details = element(this.document, 'div', 'mfs-details');
        this.title = element(this.document, 'h1', 'mfs-title', 'Unknown title');
        this.artist = element(this.document, 'p', 'mfs-artist', 'Unknown artist');
        this.album = element(this.document, 'p', 'mfs-album', '');
        details.append(this.title, this.artist, this.album);

        const timeline = element(this.document, 'div', 'mfs-timeline');
        this.position = element(this.document, 'span', 'mfs-time mfs-position', '0:00');
        this.progress = element(this.document, 'input', 'mfs-progress');
        this.progress.type = 'range';
        this.progress.min = '0';
        this.progress.max = '1000';
        this.progress.step = '1';
        this.progress.value = '0';
        this.progress.dataset.role = 'progress';
        this.progress.setAttribute('aria-label', 'Playback position');
        this.progress.addEventListener('change', () => this.actions.seek(Number(this.progress.value) / 1000));
        this.duration = element(this.document, 'span', 'mfs-time mfs-duration', '0:00');
        timeline.append(this.position, this.progress, this.duration);
        details.appendChild(timeline);

        const controls = element(this.document, 'div', 'mfs-controls');
        this.previousButton = button(this.document, 'mfs-control mfs-previous', 'Previous track');
        this.previousButton.appendChild(icon(this.document, 'previous', ICONS.previous));
        this.previousButton.addEventListener('click', () => this.actions.previous());
        this.playButton = button(this.document, 'mfs-control mfs-play', 'Pause');
        this.playIcon = icon(this.document, 'play', ICONS.play);
        this.pauseIcon = icon(this.document, 'pause', ICONS.pause);
        setIconHidden(this.playIcon, true);
        this.playButton.append(this.playIcon, this.pauseIcon);
        this.playButton.addEventListener('click', () => this.actions.playPause());
        this.nextButton = button(this.document, 'mfs-control mfs-next', 'Next track');
        this.nextButton.appendChild(icon(this.document, 'next', ICONS.next));
        this.nextButton.addEventListener('click', () => this.actions.next());
        controls.append(this.previousButton, this.playButton, this.nextButton);
        details.appendChild(controls);

        const volumeGroup = element(this.document, 'div', 'mfs-volume-group');
        this.muteButton = button(this.document, 'mfs-control mfs-mute', 'Mute');
        this.volumeIcon = icon(this.document, 'volume', ICONS.volume);
        this.mutedIcon = icon(this.document, 'muted', ICONS.muted);
        setIconHidden(this.mutedIcon, true);
        this.muteButton.append(this.volumeIcon, this.mutedIcon);
        this.muteButton.addEventListener('click', () => this.actions.toggleMute());
        this.volume = element(this.document, 'input', 'mfs-volume');
        this.volume.type = 'range';
        this.volume.min = '0';
        this.volume.max = '100';
        this.volume.step = '1';
        this.volume.value = '100';
        this.volume.dataset.role = 'volume';
        this.volume.setAttribute('aria-label', 'Volume');
        this.volume.addEventListener('input', () => this.actions.setVolume(Number(this.volume.value)));
        volumeGroup.append(this.muteButton, this.volume);
        details.appendChild(volumeGroup);

        player.append(artworkFrame, details);

        this.lyricsPane = element(this.document, 'section', 'mfs-lyrics-pane');
        this.lyricsPane.id = 'monochromeFullscreenLyrics';
        this.lyricsPane.setAttribute('aria-label', 'Lyrics');
        this.lyricsPane.setAttribute('aria-hidden', 'true');
        this.lyricsPane.setAttribute('inert', '');
        this.lyricsHost = element(this.document, 'div', 'mfs-lyrics-host');
        this.lyricsPane.appendChild(this.lyricsHost);

        stage.append(player, this.lyricsPane);
        layout.appendChild(stage);
        root.appendChild(layout);
        this.document.body.appendChild(root);

        this.root = root;
        this.input = new InputAdapter(root, {
            onClose: options => this.actions.close(options),
            onSeekBy: seconds => this.actions.seekBy(seconds),
            historyObject: this.window.history,
            windowObject: this.window
        });
        this.setLyricsVisible(this.lyricsVisible);
        this.setLyricsAvailable(this.lyricsAvailable);
        this.setPlaybackPaused(this.playbackPaused);
        this.setVisualizerEnabled(this.visualizerEnabled);
        this.setUiHidden(this.uiHidden);
        return root;
    }

    setVisualizerEnabled(enabled) {
        this.visualizerEnabled = Boolean(enabled);
        if (this.visualizerEnabled) this.root?.classList.remove('mfs-visualizer-disabled');
        else this.root?.classList.add('mfs-visualizer-disabled');
        this.visualizerButton?.setAttribute('aria-pressed', String(this.visualizerEnabled));
        this.visualizerButton?.setAttribute('aria-label', this.visualizerEnabled ? 'Disable visualizer' : 'Enable visualizer');
    }

    setUiHidden(hidden) {
        this.uiHidden = Boolean(hidden);
        if (this.uiHidden) this.root?.classList.add('mfs-ui-hidden');
        else this.root?.classList.remove('mfs-ui-hidden');
        this.uiButton?.setAttribute('aria-pressed', String(this.uiHidden));
        this.uiButton?.setAttribute('aria-label', this.uiHidden ? 'Show interface' : 'Hide interface');
        setIconHidden(this.eyeIcon, this.uiHidden);
        setIconHidden(this.eyeOffIcon, !this.uiHidden);
    }

    setLyricsVisible(visible) {
        this.lyricsVisible = Boolean(visible) && this.lyricsAvailable;
        if (!this.root) return;
        if (this.lyricsVisible) this.root.classList.add('mfs-lyrics-visible');
        else this.root.classList.remove('mfs-lyrics-visible');
        this.lyricsButton?.setAttribute('aria-pressed', String(this.lyricsVisible));
        this.lyricsButton?.setAttribute('aria-expanded', String(this.lyricsVisible));
        this.lyricsButton?.setAttribute('aria-label', this.lyricsVisible ? 'Hide lyrics' : 'Show lyrics');
        this.lyricsPane?.setAttribute('aria-hidden', String(!this.lyricsVisible));
        if (this.lyricsVisible) this.lyricsPane?.removeAttribute('inert');
        else this.lyricsPane?.setAttribute('inert', '');
    }

    setLyricsAvailable(available) {
        this.lyricsAvailable = Boolean(available);
        if (!this.lyricsAvailable) this.setLyricsVisible(false);
        if (this.lyricsAvailable) this.lyricsButton?.removeAttribute('disabled');
        else this.lyricsButton?.setAttribute('disabled', '');
        this.lyricsButton?.setAttribute('aria-disabled', String(!this.lyricsAvailable));
    }

    setPlaybackPaused(paused) {
        this.playbackPaused = Boolean(paused);
        if (this.playbackPaused) this.root?.classList.add('mfs-playback-paused');
        else this.root?.classList.remove('mfs-playback-paused');
    }

    open() {
        this.mount();
        if (this.isOpen) return;
        this.isOpen = true;
        this.root.hidden = false;
        this.root.classList.add('mfs-open');
        this.document.body.classList.add('mfs-overlay-active');
        this.input.activate();
    }

    close(options = {}) {
        if (!this.root || !this.isOpen) return;
        this.isOpen = false;
        this.input.deactivate(options);
        this.root.classList.remove('mfs-open');
        this.root.hidden = true;
        this.document.body.classList.remove('mfs-overlay-active');
    }

    update(model) {
        this.mount();
        this.lastModel = model;
        this.title.textContent = model.title || 'Unknown title';
        this.artist.textContent = model.artist || 'Unknown artist';
        this.album.textContent = model.album || '';
        this.album.hidden = !model.album;
        this.position.textContent = formatTime(model.positionTicks);
        this.duration.textContent = formatTime(model.durationTicks);
        const ratio = model.durationTicks > 0 ? model.positionTicks / model.durationTicks : 0;
        this.progress.value = String(Math.round(Math.max(0, Math.min(1, ratio)) * 1000));
        this.progress.disabled = !model.canSeek;
        setIconHidden(this.playIcon, !model.paused);
        setIconHidden(this.pauseIcon, model.paused);
        this.setPlaybackPaused(model.paused);
        this.playButton.setAttribute('aria-label', model.paused ? 'Play' : 'Pause');
        this.volume.value = String(Math.max(0, Math.min(100, model.volume)));
        setIconHidden(this.volumeIcon, model.muted);
        setIconHidden(this.mutedIcon, !model.muted);
        this.muteButton.setAttribute('aria-label', model.muted ? 'Unmute' : 'Mute');
        this.progress.style.setProperty?.('--mfs-range-value', `${Math.max(0, Math.min(1, ratio)) * 100}%`);
        this.volume.style.setProperty?.('--mfs-range-value', `${Math.max(0, Math.min(100, model.volume))}%`);

        if (model.coverUrl) {
            this.cover.src = model.coverUrl;
            this.cover.hidden = false;
            this.cover.parentElement.classList.remove('mfs-artwork-missing');
            this.backdrop.style.backgroundImage = `url(${JSON.stringify(model.coverUrl)})`;
        } else {
            this.cover.removeAttribute('src');
            this.cover.hidden = true;
            this.cover.parentElement.classList.add('mfs-artwork-missing');
            this.backdrop.style.backgroundImage = '';
        }
    }

    destroy() {
        this.close();
        this.root?.remove();
        this.root = null;
        this.input = null;
        this.lyricsHost = null;
    }
}

export { formatTime };
