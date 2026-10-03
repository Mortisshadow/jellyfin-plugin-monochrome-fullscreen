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
    constructor({ host, documentObject = host?.ownerDocument, onSeek = null } = {}) {
        if (!host || !documentObject) throw new Error('LyricsView requires an injected host element.');
        this.host = host;
        this.document = documentObject;
        this.onSeek = typeof onSeek === 'function' ? onSeek : null;
        this.timeline = new LyricsTimeline();
        this.nodes = [];
        this.activeIndex = -1;
        this.root = null;
        this.documentModel = null;
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

    setDocument(document) {
        this.clear();
        this.documentModel = document || null;
        this.timeline.setDocument(document);
        this.root.classList?.toggle?.('mfs-lyrics-unsynced', document?.syncType === 'unsynced');
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

    clear() {
        if (!this.root) return;
        while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
        // Minimal DOM shims used by host tests may expose only a children array.
        if (Array.isArray(this.root.children)) this.root.children.splice(0);
        this.nodes = [];
        this.activeIndex = -1;
        this.documentModel = null;
        this.root.classList?.toggle?.('mfs-lyrics-unsynced', false);
        this.timeline.setDocument(null);
    }

    update(positionTicks) {
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

    destroy() {
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
