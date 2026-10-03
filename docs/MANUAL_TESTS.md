# Manual test plan

Run against Jellyfin 12.1 after installing the release-folder artifact and restarting. Record browser, OS, and client version.

## Installation and isolation

1. Install/restart; confirm the plugin and settings page appear.
2. With the plugin enabled, inspect the server-hosted Web index/config response and confirm the bootstrap is present.
3. Confirm no `jellyfin-web` file changed.
4. Disable/restart, then remove the plugin folder and restart; confirm normal Web UI behavior each time.

## Playback and controls

1. Start audio with auto-open enabled; confirm one overlay, then metadata/artwork/progress updates for another item.
2. Test play/pause, previous/next, seek, volume, close, Escape, Browser Back, and Backspace. Confirm focus restoration.
3. Test Tab/Shift+Tab and arrow/D-pad focus trapping; progress arrows seek by 10 seconds.
4. Stop, switch players, pause/resume, seek, and change volume; confirm no stale or duplicate behavior.
5. Exercise the top row in order: close, lyrics, visualizer, UI visibility. Confirm the buttons remain reachable with the UI hidden and accurately announce their state.

## TTML and lyric motion

1. Play an item with a valid word-timed TTML sidecar; open lyrics and confirm they continue through the whole track.
2. Compare line transitions and word wipes with Monochrome: scrolling should begin before the next active line and should not jump once per Jellyfin time event.
3. Pause for at least 10 seconds, resume, and confirm lyrics and background resume from the paused visual position rather than the elapsed wall-clock position.
4. Click early, middle, and late lyric lines; confirm each seeks to that line instead of zero.
5. Play an item with only native Jellyfin lyrics and confirm the lightweight fallback remains readable and seekable.

## Rendering and clients

1. Test WebGL2, WebGL1-only, and WebGL-disabled browsers; confirm static-gradient fallback in the last case.
2. Test 24/30/60 FPS, reduced-motion, low-power, and background-effect-off settings, including persistence after reload.
3. Leave the visualizer running long enough for adaptive quality to step down; confirm there is no black frame when its internal canvas resolution changes.
4. Resize/rotate desktop and mobile windows; confirm usable controls and no scroll trap after close.
5. Test 1080p and 4K landscape layouts with and without lyrics; player and lyric columns must remain symmetric and the volume slider must stay centered below transport controls.
6. Test desktop/mobile browsers first. Treat Android TV browsers and a sideloaded normal Android app as experimental. Test Jellyfin Media Player separately and record whether that version loads the server-hosted or packaged Web client. Native Android TV, Tizen, Roku, and Swiftfin are out of scope.
