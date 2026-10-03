import { normalizeLyricDocument } from './lyrics-model.js';

function isNotFound(error) {
    return error?.status === 404 || error?.statusCode === 404 || error?.response?.status === 404;
}

/** Authenticated Jellyfin-only lyric loader with stale-request cancellation. */
export class LyricsAdapter {
    constructor({ apiClient = null, apiClientProvider = null, fetchObject = globalThis.fetch, logger = console } = {}) {
        this.apiClient = apiClient;
        this.apiClientProvider = typeof apiClientProvider === 'function' ? apiClientProvider : null;
        this.fetchObject = fetchObject;
        this.logger = logger;
        this.controller = null;
        this.requestId = 0;
    }

    async fetch(itemId, serverId = '') {
        this.abort();
        const id = typeof itemId === 'string' ? itemId.trim() : '';
        if (!id) return null;
        const requestId = ++this.requestId;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        this.controller = controller;
        const paths = [
            `/MonochromeFullscreen/Audio/${encodeURIComponent(id)}/Lyrics`,
            `/Audio/${encodeURIComponent(id)}/Lyrics`
        ];
        const apiClient = this.apiClientProvider?.(serverId) || this.apiClient;

        try {
            for (const path of paths) {
                let payload;
                try {
                    payload = await this.request(path, controller?.signal, apiClient);
                } catch (error) {
                    if (!isNotFound(error)) throw error;
                    continue;
                }
                if (requestId !== this.requestId || controller?.signal.aborted) return null;
                const document = normalizeLyricDocument(payload, { source: path.startsWith('/MonochromeFullscreen/') ? 'ttml' : 'jellyfin' });
                if (document) return document;
            }
            return null;
        } catch (error) {
            if (requestId !== this.requestId || controller?.signal.aborted || error?.name === 'AbortError' || isNotFound(error)) return null;
            this.logger?.warn?.('[MonochromeFullscreen] Unable to load lyrics', error);
            return null;
        } finally {
            if (requestId === this.requestId) this.controller = null;
        }
    }

    async request(path, signal, apiClient) {
        const url = apiClient?.getUrl ? apiClient.getUrl(path) : path;
        if (apiClient?.getJSON) return apiClient.getJSON(url, { signal });
        if (apiClient?.ajax) return apiClient.ajax({ type: 'GET', url, dataType: 'json', signal });
        if (typeof this.fetchObject !== 'function') throw new Error('No Jellyfin API client or fetch implementation is available.');
        const response = await this.fetchObject(url, { method: 'GET', credentials: 'same-origin', signal });
        if (response.status === 404) return null;
        if (!response.ok) {
            const error = new Error(`Lyrics request failed with status ${response.status}.`);
            error.status = response.status;
            throw error;
        }
        return response.json();
    }

    abort() {
        this.requestId++;
        this.controller?.abort();
        this.controller = null;
    }

    destroy() {
        this.abort();
        this.apiClient = null;
        this.apiClientProvider = null;
        this.fetchObject = null;
    }
}
