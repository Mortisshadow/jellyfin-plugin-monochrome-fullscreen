# TTML implementation

Version 1.0.0.3 introduces a bounded TTML sidecar parser and a timed-lyrics UI. Jellyfin 12.1 does not discover `.ttml` in its native lyric extension list, so the plugin exposes an authenticated read-only endpoint and falls back to Jellyfin's native lyric endpoint when no TTML sidecar exists.

## Pipeline

1. Resolve the audio item through Jellyfin's user-aware library lookup, then discover only same-directory `basename.ttml` or `basename.*.ttml` files.
2. Parse each title once into a normalized, sorted timeline. Each cue can carry line timing, word/syllable timing, translation and phonetic/romanized tracks, singer identity for duets, and background-vocal metadata.
3. Apply a user-configurable timing offset while preserving the source timestamps.
4. Use binary search after seeks and a monotonic cursor during normal playback. Never traverse or query the XML tree per frame.
5. Render main, translated, and phonetic tracks independently, with an accessibility-first plain-line fallback.
6. Normalize Jellyfin's native LRC-derived response into the same timeline shape when TTML is unavailable.
7. Treat malformed XML, missing timing, overlap, and unsupported styling as recoverable input and show no lyrics rather than interrupt playback.

XML DTDs and external resolvers are disabled, documents are capped at 2 MiB, malformed files fail softly, and file paths/raw XML are never returned. The parser supports clock/offset/frame/tick timing plus timed spans, translations, phonetics, agent IDs, and background-role hints. Full TTML styling and arbitrary animation are deliberately out of scope.
