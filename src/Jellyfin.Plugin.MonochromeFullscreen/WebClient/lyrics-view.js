import { LyricsTimeline, lyricPartProgress } from './lyrics-timeline.js';

function element(documentObject, tag, className, text) {
    const node = documentObject.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function matchingLine(track, mainLine, index) {
    if (!track) return null;
    return track.lines.find(line => line.startTicks === mainLine.startTicks) || track.lines[index] || null;
}

function setProgress(node, value) {
    const percent = `${Math.round(Math.max(0, Math.min(1, value)) * 10000) / 100}%`;
    node.style?.setProperty?.('--mfs-lyric-progress', percent);
    if (node.style && !node.style.setProperty) node.style['--mfs-lyric-progress'] = percent;
}

export class LyricsView {
    constructor({
        host,
        documentObject = host?.ownerDocument,
        onSeek = null,
        preferAmLyrics = Boolean(globalThis.customElements?.get?.('am-lyrics')),
        requestAnimationFrame = globalThis.requestAnimationFrame?.bind(globalThis),
        cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
        now = () => globalThis.performance?.now?.() ?? Date.now()
    } = {}) {
        if (!host || !documentObject) throw new Error('LyricsView requires an injected host element.');
        this.host = host;
        this.document = documentObject;
        this.onSeek = typeof onSeek === 'function' ? onSeek : null;
        this.preferAmLyrics = Boolean(preferAmLyrics);
        this.requestFrame = requestAnimationFrame;
        this.cancelFrame = cancelAnimationFrame;
        this.now = now;
        this.timeline = new LyricsTimeline();
        this.nodes = [];
        this.activeIndex = -1;
        this.root = null;
        this.amLyrics = null;
        this.animationFrame = null;
        this.anchorPositionMs = 0;
        this.anchorTimestamp = 0;
        this.playbackPaused = true;
        this.active = false;
        this.documentModel = null;
        this.tick = this.tick.bind(this);
        this.mount();
    }

    mount() {
        if (this.root) return this.root;
        this.root = element(this.document, 'div', 'mfs-lyrics');
        this.root.setAttribute('role', 'region');
        this.root.setAttribute('aria-live', 'off');
        this.host.appendChild(this.root);
        return this.root;
    }

    setDocument(document, item = null) {
        this.clear();
        this.documentModel = document || null;
        this.timeline.setDocument(document);
        this.root.classList?.toggle?.('mfs-lyrics-unsynced', document?.syncType === 'unsynced');
        if (this.preferAmLyrics && document?.rawTtml) {
            this.mountAmLyrics(document.rawTtml, item);
            return;
        }
        const main = this.timeline.track;
        if (!main) return;
        const translation = document.tracks.find(track => track.type === 'translation');
        const phonetic = document.tracks.find(track => track.type === 'phonetic');

        main.lines.forEach((line, index) => {
            const row = element(this.document, 'div', 'mfs-lyric-line');
            row.dataset.lyricId = line.id;
            row.dataset.agents = line.agentIds.join(',');
            row.classList?.toggle?.('mfs-lyric-background', line.background);
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-label', line.text);
            const seek = () => this.onSeek?.(line.startTicks);
            row.addEventListener('click', seek);
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault?.();
                    seek();
                }
            });

            const mainText = element(this.document, 'div', 'mfs-lyric-main');
            const partNodes = [];
            if (line.parts.length) {
                for (const part of line.parts) {
                    const partNode = element(this.document, 'span', 'mfs-lyric-part', part.text);
                    partNode.classList?.toggle?.('mfs-lyric-background', part.background);
                    setProgress(partNode, 0);
                    mainText.appendChild(partNode);
                    partNodes.push(partNode);
                }
            } else {
                mainText.textContent = line.text;
            }
            row.appendChild(mainText);

            for (const [track, className] of [[translation, 'mfs-lyric-translation'], [phonetic, 'mfs-lyric-phonetic']]) {
                const secondary = matchingLine(track, line, index);
                if (secondary?.text) row.appendChild(element(this.document, 'div', className, secondary.text));
            }
            this.root.appendChild(row);
            this.nodes.push({ row, line, partNodes });
        });
    }

    mountAmLyrics(ttml, item) {
        const component = element(this.document, 'am-lyrics', 'mfs-am-lyrics');
        component.setAttribute('autoscroll', '');
        component.setAttribute('interpolate', '');
        component.setAttribute('highlight-color', '#f6f4ef');
        component.setAttribute('no-auto-alternates', '');
        component.ttml = ttml;
        component.songTitle = item?.title || '';
        component.songArtist = item?.artist || '';
        component.songAlbum = item?.album || '';
        component.songDurationMs = Math.max(0, Number(item?.durationTicks || 0) / 10_000);
        component.addEventListener('line-click', event => {
            const milliseconds = Number(event?.detail?.timestamp);
            if (Number.isFinite(milliseconds) && milliseconds >= 0) {
                this.onSeek?.(Math.round(milliseconds * 10_000));
            }
        });
        this.root.classList?.add?.('mfs-lyrics-am');
        this.root.appendChild(component);
        this.amLyrics = component;
        this.applyAmLyricsTweaks(component);
    }

    applyAmLyricsTweaks(component) {
        const shadowRoot = component?.shadowRoot;
        if (!shadowRoot) {
            component?.updateComplete?.then?.(() => {
                if (this.amLyrics === component) this.applyAmLyricsTweaks(component);
            });
            return;
        }
        if (shadowRoot.getElementById?.('monochrome-fullscreen-lyrics-tweaks')) return;
        const style = element(this.document, 'style');
        style.id = 'monochrome-fullscreen-lyrics-tweaks';
        style.textContent = `
            .lyrics-container {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }
            .lyrics-container::-webkit-scrollbar {
                width: 0 !important;
                height: 0 !important;
                display: none !important;
                background: transparent !important;
            }
            .lyrics-line {
                transform-origin: left center;
                transition:
                    opacity .42s ease,
                    transform .55s cubic-bezier(.22, 1, .36, 1) var(--lyrics-line-delay, 0ms),
                    filter .48s cubic-bezier(.22, 1, .36, 1) !important;
            }
            .lyrics-line:not(.active):not(.pre-active) { opacity: .44; }
            .lyrics-line-container {
                transition:
                    transform .72s cubic-bezier(.22, 1, .36, 1),
                    background-color .3s ease,
                    color .3s ease !important;
            }
            .lyrics-line.active .lyrics-line-container,
            .lyrics-line.pre-active .lyrics-line-container {
                transition:
                    transform .56s cubic-bezier(.22, 1, .36, 1),
                    background-color .22s ease,
                    color .22s ease !important;
            }
            .lyrics-line.active .lyrics-line-container { transform: scale(1.015); }
        `;
        shadowRoot.appendChild(style);
    }

    clear() {
        if (!this.root) return;
        this.stopClock();
        if (this.amLyrics) this.amLyrics.duration = -1;
        while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
        // Minimal DOM shims used by host tests may expose only a children array.
        if (Array.isArray(this.root.children)) this.root.children.splice(0);
        this.nodes = [];
        this.activeIndex = -1;
        this.amLyrics = null;
        this.documentModel = null;
        this.root.classList?.remove?.('mfs-lyrics-am');
        this.root.classList?.toggle?.('mfs-lyrics-unsynced', false);
        this.timeline.setDocument(null);
    }

    update(positionTicks, paused = this.playbackPaused) {
        if (this.amLyrics) {
            this.anchorPositionMs = Math.max(0, Number(positionTicks || 0) / 10_000);
            this.anchorTimestamp = this.now();
            this.playbackPaused = Boolean(paused);
            this.amLyrics.currentTime = this.anchorPositionMs;
            if (this.active && !this.playbackPaused) this.startClock();
            else this.stopClock();
            return { positionTicks, line: null, index: -1 };
        }
        const state = this.timeline.update(positionTicks);
        if (state.index !== this.activeIndex) {
            this.activeIndex = state.index;
            for (let index = 0; index < this.nodes.length; index++) {
                const distance = this.timeline.isSynced
                    ? (state.index < 0 ? this.nodes.length : Math.abs(index - state.index))
                    : 0;
                this.nodes[index].row.classList?.toggle?.('mfs-lyric-active', index === state.index);
                this.nodes[index].row.style?.setProperty?.('--mfs-lyric-distance', String(Math.min(distance, 6)));
            }
            this.nodes[state.index]?.row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        }
        for (const node of this.nodes) {
            for (let index = 0; index < node.partNodes.length; index++) {
                setProgress(node.partNodes[index], lyricPartProgress(node.line.parts[index], state.positionTicks));
            }
        }
        return state;
    }

    setActive(active) {
        this.active = Boolean(active);
        if (this.active && this.amLyrics && !this.playbackPaused) this.startClock();
        else this.stopClock();
    }

    startClock() {
        if (this.animationFrame !== null || typeof this.requestFrame !== 'function') return;
        this.animationFrame = this.requestFrame(this.tick);
    }

    stopClock() {
        if (this.animationFrame !== null && typeof this.cancelFrame === 'function') {
            this.cancelFrame(this.animationFrame);
        }
        this.animationFrame = null;
    }

    tick(timestamp) {
        this.animationFrame = null;
        if (!this.active || this.playbackPaused || !this.amLyrics) return;
        const elapsed = Math.max(0, Number(timestamp) - this.anchorTimestamp);
        this.amLyrics.currentTime = this.anchorPositionMs + elapsed;
        this.startClock();
    }

    destroy() {
        this.active = false;
        this.clear();
        this.root?.remove?.();
        if (this.root?.parentElement && Array.isArray(this.root.parentElement.children)) {
            const index = this.root.parentElement.children.indexOf(this.root);
            if (index >= 0) this.root.parentElement.children.splice(index, 1);
        }
        this.root = null;
        this.host = null;
        this.onSeek = null;
    }
}
