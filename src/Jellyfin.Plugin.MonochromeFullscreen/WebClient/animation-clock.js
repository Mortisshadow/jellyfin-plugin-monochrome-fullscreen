export const MAX_FRAME_DELTA_MS = 100;

/**
 * Tracks elapsed animation time while the visualizer is actively running.
 * A resumed clock is primed by its first frame so wall time spent suspended
 * never becomes part of the animation timeline.
 */
export class ActiveAnimationClock {
    constructor(maxFrameDelta = MAX_FRAME_DELTA_MS) {
        this.maxFrameDelta = maxFrameDelta;
        this.elapsed = 0;
        this.lastTimestamp = null;
        this.running = false;
    }

    resume() {
        if (this.running) return;
        this.running = true;
        this.lastTimestamp = null;
    }

    pause() {
        this.running = false;
        this.lastTimestamp = null;
    }

    advance(timestamp) {
        if (!this.running || !Number.isFinite(timestamp)) return this.elapsed;
        if (this.lastTimestamp === null) {
            this.lastTimestamp = timestamp;
            return this.elapsed;
        }

        const delta = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;
        if (delta > 0) this.elapsed += Math.min(delta, this.maxFrameDelta);
        return this.elapsed;
    }

    reset(elapsed = 0) {
        this.elapsed = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
        this.lastTimestamp = null;
        return this.elapsed;
    }
}
