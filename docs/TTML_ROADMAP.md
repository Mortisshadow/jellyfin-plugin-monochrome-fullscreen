# TTML roadmap

TTML lyrics/subtitle support is planned, not part of the MVP; there is currently no TTML parser or timed-lyrics UI.

## Proposed pipeline

1. Discover `.ttml` sidecars through an authorized server adapter; do not depend on native Jellyfin TTML support.
2. Parse each title once into a normalized, sorted timeline. Each cue can carry line timing, word/syllable timing, translation and phonetic/romanized tracks, singer identity for duets, and background-vocal metadata.
3. Apply a user-configurable timing offset while preserving the source timestamps.
4. Use binary search after seeks and a monotonic cursor during normal playback. Never traverse or query the XML tree per frame.
5. Render main, translated, and phonetic tracks independently, with an accessibility-first plain-line fallback.
6. Add an LRC adapter that produces the same timeline shape when TTML is unavailable.
7. Treat malformed XML, missing timing, overlap, and unsupported styling as recoverable input and show no lyrics rather than interrupt playback.

Jellyfin server [PR #17011](https://github.com/jellyfin/jellyfin/pull/17011) remains open as of 2026-10-02 and is not part of Jellyfin 12.1. This plugin therefore needs its own adapter, capability detection, and fallback. Delivery slices: parser/fixture tests; adapter contract; timeline rendering and seek handling; manual tests for unavailable or malformed sources.
