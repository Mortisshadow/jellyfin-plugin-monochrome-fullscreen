# TTML implementation

Version 1.0.0.3 introduces a bounded TTML sidecar parser and a timed-lyrics UI. Jellyfin 12.1 does not discover `.ttml` in its native lyric extension list, so the plugin exposes an authenticated read-only endpoint and falls back to Jellyfin's native lyric endpoint when no TTML sidecar exists.

## Pipeline

1. Resolve the audio item through Jellyfin's user-aware library lookup, then discover only same-directory `basename.ttml` or `basename.*.ttml` files.
2. Parse each title once on the server into a normalized, sorted timeline for validation and the native fallback, while returning the same bounded TTML text to the client for `am-lyrics`.
3. Apply a user-configurable timing offset while preserving the source timestamps.
4. Use `am-lyrics`'s interpolated time and predictive-scroll implementation for valid TTML. Re-anchor its millisecond clock on Jellyfin events and stop animation-frame updates while paused, closed, or hidden.
5. Render native Jellyfin lyrics with the accessibility-first plain-line fallback.
6. Normalize Jellyfin's native LRC-derived response into the same timeline shape when TTML is unavailable.
7. Treat malformed XML, missing timing, overlap, and unsupported styling as recoverable input and show no lyrics rather than interrupt playback.

XML DTDs and external resolvers are disabled during server-side validation, documents are capped at 2 MiB, malformed files fail softly, and file paths are never returned. Raw TTML is returned only by the authenticated per-item endpoint after authorization and validation, then parsed locally by the bundled component. The server parser supports clock/offset/frame/tick timing plus timed spans, translations, phonetics, agent IDs, and background-role hints.
