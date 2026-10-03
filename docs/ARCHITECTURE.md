# Architecture

The plugin targets Jellyfin ABI `12.1.0.0` on `net10.0`. Its service registrator adds an ASP.NET startup filter before Jellyfin’s static-file middleware. `WebClientMiddleware` serves embedded assets at `/MonochromeFullscreen/client/` and transiently augments eligible Web index/config responses in memory. No `jellyfin-web` file is written or replaced.

## Client loading strategy

There is no documented Jellyfin server-plugin API for globally registering JavaScript and CSS in Jellyfin Web. The MVP therefore uses a reversible response adapter:

1. Requests for `/web/` or `/web/index.html` are served from Jellyfin’s existing Web path with one marked stylesheet link and one marked bootstrap script added in memory.
2. Requests for `/web/config.json` receive the existing JSON plus the idempotently added `MonochromeFullscreenPlugin` entry.
3. The bootstrap defines that plugin for Jellyfin Web’s built-in plugin manager. The manager then supplies the playback and connection dependencies.
4. All client modules, CSS, and the non-sensitive normalized settings JSON are served from embedded DLL resources.

The markers are `monochrome-fullscreen:start` and `monochrome-fullscreen:end`. They never persist to disk. Disabled configuration bypasses the adapter. Disabling or uninstalling the Jellyfin plugin and restarting the server removes the middleware, so there is no cleanup write and Jellyfin updates cannot leave a patched `index.html` behind. A missing or unreadable Web installation is logged with the `[MonochromeFullscreen]` prefix and Jellyfin’s normal pipeline is allowed to handle the request.

This ASP.NET startup filter and the Web plugin manager are pragmatic extension points, not a promised Jellyfin server-plugin API. The approach must be revalidated for every Jellyfin release.

## Module boundaries

- `Plugin` and `PluginConfiguration` own server identity, persistence, defaults, and validation.
- `WebClientMiddleware` owns response augmentation and embedded-asset delivery.
- `bootstrap.js` performs only Web plugin registration.
- `playback-adapter.js` is the sole boundary around Jellyfin playback objects, events, image URLs, and controls.
- `plugin.js` coordinates lifecycle and policy without manipulating Jellyfin internals.
- `overlay.js` builds the safe DOM using `textContent`; it does not know about Jellyfin.
- `input-adapter.js` owns focus, keyboard, D-pad, and browser-back behavior.
- `visualizer.js` owns the single canvas and renderer lifecycle.
- `lyrics-adapter.js`, `lyrics-model.js`, and `lyrics-timeline.js` own lyric transport, normalization, and the native-lyrics fallback timeline.
- `lyrics-view.js` gives valid TTML to the pinned `am-lyrics` web component, interpolates Jellyfin playback state with a visible-only animation clock, and forwards line seeks through the playback adapter. Native lyrics remain on the safe text-only fallback.
- `TtmlLyricsController` authorizes audio-item access and exposes both normalized timing data and the bounded original TTML needed by `am-lyrics`.

The bootstrap registers through Jellyfin Web’s built-in Web plugin manager and receives `playbackManager`, `events`, and `ServerConnections`. That manager is part of the official Jellyfin Web source, but it is not a documented compatibility contract for third-party server plugins. A playback adapter subscribes to playback start/stop/player-change plus player time, pause, and volume events, and uses the existing player for controls. The overlay owns focus trapping, browser-back history, Escape/Backspace/BrowserBack, D-pad/arrow navigation, ten-second seeking, and focus restoration.

The existing Jellyfin player remains the only playback source. The adapter calls its play/pause, previous/next, seek, volume, and mute methods and never creates an audio element or media graph. Metadata is converted into a plain view model before reaching the UI.

## Rendering and performance

`visualizer.js` uses one canvas and loads the same `@kawarp/core` cover-driven domain-warp renderer selected by Monochrome's default fullscreen configuration. It falls back to the earlier lightweight WebGL2/WebGL1 renderer, then to the static cover gradient when context creation fails. Profiles use enabled/background-effect, reduced-motion, low-power, and FPS settings. The MVP does not inspect PCM data, FFT bins, or microphone input; motion is not beat-reactive.

High uses up to 60 FPS at scale 1.0; Balanced uses 30 FPS at scale 0.75; Low Power/TV uses 24 FPS at scale 0.5; Static schedules no frames. Effective device pixel ratio is capped at 1.5, or 1.0 in Low Power. Kawarp blurs the cover into small render targets only when artwork changes, then performs the domain warp through the plugin's bounded frame scheduler. There is no `readPixels`, `getImageData`, microphone access, or per-frame cover analysis.

The animation loop stops when the overlay closes, playback pauses, the document is hidden, motion is reduced, the visualizer is disabled, or the WebGL context is lost. A monotonic active-time clock excludes every suspended interval, so resuming cannot jump to a different visual state. Resize and orientation changes update the bounded internal resolution and immediately redraw the last frame because changing a canvas backing size clears it. Sustained missed frame budgets reduce particles, then render scale, then FPS; quality is not automatically raised again, avoiding oscillation.

## Client boundary

Only a client executing this server’s Web bundle can receive the response adapter. Desktop and mobile browsers are the supported MVP. Android TV browsers and a sideloaded normal Android app are experimental. Native Android TV, Tizen, Roku, Swiftfin, and other native clients require separate client implementations. Jellyfin Media Player is a manual test target rather than a compatibility claim because packaged versions may ship their own Web client.

Jellyfin 12 defaults to the Modern React/MUI layout while retaining Legacy layouts. The overlay does not select either layout’s component classes: it attaches one uniquely identified root to `document.body`, and every plugin selector is scoped below `#monochromeFullscreen`. This keeps the same client module usable in Modern and Legacy views. Abyss is optional; `--abyss-accent` and `--abyss-radius` are consumed with local fallback values, and no Abyss stylesheet is changed.

## Failure and security model

Client assets contain no runtime-fetched executable code, accounts, telemetry, or secrets. CI builds the vanilla `am-lyrics` module from an exact source commit and embeds it beside the other client modules. The public settings response contains only feature flags and render limits. Metadata and native lyrics use DOM text properties; raw TTML is passed only to `am-lyrics`'s XML parser. TTML access is authenticated, validates the Jellyfin user's access to the audio item, remains inside the media directory, rejects DTD/external-entity XML during server validation, and enforces a 2 MiB document cap. Initialization and subscriptions are idempotent, and close/destroy paths stop animation and remove listeners. Web client incompatibility is fail-soft: the lightweight lyrics renderer remains available if `am-lyrics` cannot be loaded.

## Catalog packaging

The CI archive follows Jellyfin's catalog convention: `meta.json`, the plugin DLL, project/Monochrome/Kawarp/am-lyrics licenses, and `THIRD_PARTY_NOTICES.md` are at the ZIP root. CI emits MD5 for Jellyfin's repository manifest and SHA-256 for independent verification. `manifest.json` points to the immutable GitHub Release asset; it never points to an expiring Actions artifact.

## Compatibility risk

Compatibility depends on Jellyfin Web’s internal/unsupported front-end plugin mechanism and playback object/event shapes. A Web update may change those contracts or response shapes. Test after every Jellyfin upgrade and disable/remove the plugin if the Web UI fails to load.
