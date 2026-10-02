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

## Rendering and clients

1. Test WebGL2, WebGL1-only, and WebGL-disabled browsers; confirm static-gradient fallback in the last case.
2. Test 24/30/60 FPS, reduced-motion, low-power, and background-effect-off settings, including persistence after reload.
3. Resize/rotate desktop and mobile windows; confirm usable controls and no scroll trap after close.
4. Test desktop/mobile browsers first. Treat Android TV browsers and a sideloaded normal Android app as experimental. Test Jellyfin Media Player separately and record whether that version loads the server-hosted or packaged Web client. Native Android TV, Tizen, Roku, and Swiftfin are out of scope.
