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

        const close = button(this.document, 'mfs-close', 'Close fullscreen view', '×');
        close.dataset.action = 'close';
        close.addEventListener('click', () => this.actions.close({ fromHistory: false }));
        root.appendChild(close);

        const layout = element(this.document, 'div', 'mfs-layout');
        const artworkFrame = element(this.document, 'div', 'mfs-artwork-frame');
        this.cover = element(this.document, 'img', 'mfs-cover');
        this.cover.alt = '';
        this.cover.hidden = true;
        this.cover.addEventListener('error', () => {
            this.cover.hidden = true;
            artworkFrame.classList.add('mfs-artwork-missing');
        });
        artworkFrame.appendChild(this.cover);

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
        this.previousButton = button(this.document, 'mfs-control mfs-previous', 'Previous track', '⏮');
        this.previousButton.addEventListener('click', () => this.actions.previous());
        this.playButton = button(this.document, 'mfs-control mfs-play', 'Pause', 'Ⅱ');
        this.playButton.addEventListener('click', () => this.actions.playPause());
        this.nextButton = button(this.document, 'mfs-control mfs-next', 'Next track', '⏭');
        this.nextButton.addEventListener('click', () => this.actions.next());
        controls.append(this.previousButton, this.playButton, this.nextButton);
        details.appendChild(controls);

        const volumeGroup = element(this.document, 'div', 'mfs-volume-group');
        this.muteButton = button(this.document, 'mfs-control mfs-mute', 'Mute', '🔊');
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

        layout.append(artworkFrame, details);
        root.appendChild(layout);
        this.document.body.appendChild(root);

        this.root = root;
        this.input = new InputAdapter(root, {
            onClose: options => this.actions.close(options),
            onSeekBy: seconds => this.actions.seekBy(seconds),
            historyObject: this.window.history,
            windowObject: this.window
        });
        return root;
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
        this.playButton.textContent = model.paused ? '▶' : 'Ⅱ';
        this.playButton.setAttribute('aria-label', model.paused ? 'Play' : 'Pause');
        this.volume.value = String(Math.max(0, Math.min(100, model.volume)));
        this.muteButton.textContent = model.muted ? '🔇' : '🔊';
        this.muteButton.setAttribute('aria-label', model.muted ? 'Unmute' : 'Mute');

        if (model.coverUrl) {
            this.cover.src = model.coverUrl;
            this.cover.hidden = false;
            this.cover.parentElement.classList.remove('mfs-artwork-missing');
            this.backdrop.style.backgroundImage = `linear-gradient(135deg, rgba(4, 6, 12, .78), rgba(8, 11, 20, .94)), url(${JSON.stringify(model.coverUrl)})`;
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
    }
}

export { formatTime };
