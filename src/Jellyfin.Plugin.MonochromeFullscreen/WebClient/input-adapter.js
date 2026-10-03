const FOCUS_SELECTOR = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard, D-pad, focus trap, and browser-back behavior for the overlay.
 */
export class InputAdapter {
    constructor(root, { onClose, onSeekBy, historyObject = globalThis.history, windowObject = globalThis.window }) {
        this.root = root;
        this.onClose = onClose;
        this.onSeekBy = onSeekBy;
        this.history = historyObject;
        this.window = windowObject;
        this.active = false;
        this.addedHistoryEntry = false;
        this.previousFocus = null;
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onPopState = this.onPopState.bind(this);
    }

    activate() {
        if (this.active) return;
        this.active = true;
        this.previousFocus = this.root.ownerDocument.activeElement;
        this.root.addEventListener('keydown', this.onKeyDown);
        this.window?.addEventListener?.('popstate', this.onPopState);
        if (this.history?.pushState) {
            this.history.pushState({ ...(this.history.state || {}), monochromeFullscreen: true }, '', this.window?.location?.href);
            this.addedHistoryEntry = true;
        }
        this.focusables()[0]?.focus();
    }

    deactivate({ fromHistory = false } = {}) {
        if (!this.active) return;
        this.active = false;
        this.root.removeEventListener('keydown', this.onKeyDown);
        this.window?.removeEventListener?.('popstate', this.onPopState);
        if (this.addedHistoryEntry && !fromHistory && this.history?.state?.monochromeFullscreen) {
            this.history.back();
        }
        this.addedHistoryEntry = false;
        this.previousFocus?.focus?.();
        this.previousFocus = null;
    }

    onPopState() {
        if (!this.active) return;
        this.addedHistoryEntry = false;
        this.onClose({ fromHistory: true });
    }

    onKeyDown(event) {
        if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'Backspace') {
            event.preventDefault();
            this.onClose({ fromHistory: false });
            return;
        }

        const focusables = this.focusables();
        if (!focusables.length) return;
        const currentIndex = Math.max(0, focusables.indexOf(this.root.ownerDocument.activeElement));

        if (event.key === 'Tab') {
            event.preventDefault();
            const delta = event.shiftKey ? -1 : 1;
            focusables[(currentIndex + delta + focusables.length) % focusables.length].focus();
            return;
        }

        const targetRole = event.target?.dataset?.role;
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && targetRole === 'progress') {
            event.preventDefault();
            this.onSeekBy(event.key === 'ArrowLeft' ? -10 : 10);
            return;
        }

        if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key) && targetRole !== 'volume') {
            event.preventDefault();
            const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
            focusables[(currentIndex + delta + focusables.length) % focusables.length].focus();
        }
    }

    focusables() {
        return Array.from(this.root.querySelectorAll(FOCUS_SELECTOR)).filter(element => !element.hidden);
    }
}
