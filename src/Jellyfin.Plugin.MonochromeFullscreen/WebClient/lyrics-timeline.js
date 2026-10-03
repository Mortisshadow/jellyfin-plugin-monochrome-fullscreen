function validTicks(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function lyricPartProgress(part, positionTicks) {
    if (!part) return 0;
    const start = validTicks(part.startTicks);
    const end = Math.max(start, validTicks(part.endTicks));
    if (positionTicks <= start) return 0;
    if (positionTicks >= end) return 1;
    return end === start ? 1 : (positionTicks - start) / (end - start);
}

export class LyricsTimeline {
    constructor(document = null, { timingOffsetTicks = 0 } = {}) {
        this.timingOffsetTicks = Number.isFinite(Number(timingOffsetTicks)) ? Number(timingOffsetTicks) : 0;
        this.setDocument(document);
    }

    setDocument(document) {
        this.document = document || null;
        this.track = document?.tracks?.find(track => track.type === 'main') || document?.tracks?.[0] || null;
        this.lines = this.track?.lines || [];
        this.isSynced = document?.syncType !== 'unsynced';
        this.cursor = -1;
        this.lastPosition = -1;
    }

    setTimingOffset(timingOffsetTicks) {
        this.timingOffsetTicks = Number.isFinite(Number(timingOffsetTicks)) ? Number(timingOffsetTicks) : 0;
        this.lastPosition = -1;
    }

    seek(positionTicks) {
        const position = Math.max(0, validTicks(positionTicks) + this.timingOffsetTicks);
        if (!this.isSynced) {
            this.cursor = -1;
            this.lastPosition = position;
            return this.state(position);
        }
        let low = 0;
        let high = this.lines.length - 1;
        let match = -1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            if (this.lines[middle].startTicks <= position) {
                match = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        this.cursor = match;
        this.lastPosition = position;
        return this.state(position);
    }

    update(positionTicks) {
        const position = Math.max(0, validTicks(positionTicks) + this.timingOffsetTicks);
        if (this.lastPosition < 0 || position < this.lastPosition) return this.seek(positionTicks);
        while (this.cursor + 1 < this.lines.length && this.lines[this.cursor + 1].startTicks <= position) this.cursor++;
        this.lastPosition = position;
        return this.state(position);
    }

    state(positionTicks) {
        const line = this.cursor >= 0 ? this.lines[this.cursor] : null;
        let partIndex = -1;
        if (line) {
            for (let index = 0; index < line.parts.length; index++) {
                if (line.parts[index].startTicks <= positionTicks) partIndex = index;
                else break;
            }
        }
        return {
            positionTicks,
            track: this.track,
            line,
            index: this.cursor,
            partIndex,
            partProgress: partIndex >= 0 ? lyricPartProgress(line.parts[partIndex], positionTicks) : 0
        };
    }
}
