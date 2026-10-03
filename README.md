# Monochrome Fullscreen

Monochrome Fullscreen is an optional, resource-conscious now-playing overlay for the **server-hosted Jellyfin Web client**. It targets Jellyfin **12.1** and **.NET 10** only.

## What it does

- Opens a fullscreen audio view automatically with title, artist, artwork, progress, transport, volume, and keyboard/D-pad navigation.
- Uses a responsive circular player that moves into a balanced two-column layout when lyrics are opened.
- Loads Jellyfin's native line lyrics and direct `.ttml` sidecars. TTML uses the same `am-lyrics` web-component renderer as Monochrome, including interpolated word timing, predictive scrolling, translations, duet agents, and background vocals where present.
- Uses one canvas, trying Kawarp/WebGL2 and then WebGL1; if neither is available it keeps a static gradient background. Motion is time-based, pause-aware, and bounded by a 24/30/60 FPS setting.
- Injects the client at request time. It serves embedded assets and transiently augments index/config responses in memory; it never edits files in `jellyfin-web`.

## Supported clients

Supported: desktop and mobile browsers pointed at the server-hosted Jellyfin Web UI. Android TV browser use and a sideloaded normal Jellyfin Android app are experimental. Jellyfin Media Player must be tested separately because packaged client versions may use their own Web assets. Native Android TV, Tizen, Roku, Swiftfin, and other non-Web clients are out of scope.

## Install

### Plugin repository

After the first release is published, add this URL under Dashboard → Plugins → Repositories:

```text
https://raw.githubusercontent.com/Mortisshadow/jellyfin-plugin-monochrome-fullscreen/main/manifest.json
```

The plugin then appears in the Jellyfin catalog and can be installed and updated normally.

### Manual artifact

Download the latest `MonochromeFullscreen` artifact from a successful GitHub Actions run. Create a `MonochromeFullscreen` folder in Jellyfin’s plugins directory and extract the versioned ZIP into that folder, then restart Jellyfin. The folder contains `Jellyfin.Plugin.MonochromeFullscreen.dll`, `meta.json`, `LICENSE`, `MONOCHROME_LICENSE.txt`, `KAWARP_LICENSE.txt`, `AM_LYRICS_LICENSE.txt`, and `THIRD_PARTY_NOTICES.md`; Web assets are embedded in the DLL. Do not copy files into the `jellyfin-web` installation.

Common plugin roots include `/var/lib/jellyfin/plugins` on Linux, `/config/plugins` in the official container when `/config` is mounted, and `%ProgramData%\Jellyfin\Server\plugins` for the Windows tray installation. Use the plugin path appropriate to the actual Jellyfin installation.

After restart, open Dashboard → Plugins → Monochrome Fullscreen and choose settings. Refresh the browser after changing settings if needed.

## Settings

- **Enabled**: master switch.
- **Open automatically when audio starts**: automatic overlay opening.
- **Background effect**, **reduced motion**, and **low-power mode**: select the visual profile.
- **Frame-rate limit**: 24, 30, or 60 FPS.

## Lyrics and TTML

The lyrics button in the Monochrome-style top action row becomes available when the current audio item has lyrics. Native Jellyfin lyrics are used automatically. For TTML, place a sidecar beside the audio file using either `Track name.ttml` or a language-qualified name such as `Track name.en.ttml`. The endpoint only reads same-directory TTML files for an audio item the signed-in Jellyfin user is allowed to access, rejects DTD/external-entity XML, and caps input at 2 MiB.

Timed lyric lines can be clicked to seek. TTML `begin`, `end`, and `dur` values support clock, offset, frame, and tick timing. The component receives playback time in milliseconds on every animation frame while lyrics are visible, while pause/resume and seeks are anchored to Jellyfin's authoritative state so the animation does not drift or jump ahead during pauses.

## Uninstall / recovery

Disable the plugin, stop Jellyfin, remove its plugin folder/artifact, and restart Jellyfin. Because the Web client is never modified, removing the plugin restores normal Web responses after restart. If the overlay is absent, inspect the server log and browser console and confirm Jellyfin 12.1 and the server-hosted Web UI.

## Known limitations

- The MVP supports Jellyfin 12.1 only; Jellyfin 10.11 requires a separate .NET 9 build.
- The Web plugin manager and playback object shapes are present in the official Jellyfin Web source but are not a documented third-party compatibility contract.
- Browser caches and service workers can require a hard refresh after installation or configuration changes.
- There is no manual launcher when automatic opening is disabled.
- The background is cover-driven and time-animated; it does not inspect PCM/FFT data and is therefore not truly beat-reactive.
- Native Jellyfin lyrics use the lightweight fallback renderer; the full Monochrome-style word motion requires a valid TTML sidecar.
- Native TV clients, queue editing, DSP, and automatic release publishing are not included.
- Jellyfin Media Player compatibility depends on whether the installed version loads the server-hosted Web client.

## Roadmap

The next milestones are real-device geometry tuning from the supplied 1080p/4K references, broader TTML fixture coverage, and conservative audio reactivity only if the existing media element can be accessed without reconnecting or disrupting it.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/MANUAL_TESTS.md](docs/MANUAL_TESTS.md), and [docs/TTML_ROADMAP.md](docs/TTML_ROADMAP.md).

## Official references

- [Jellyfin plugin documentation](https://jellyfin.org/docs/general/server/plugins/)
- [Jellyfin Web repository](https://github.com/jellyfin/jellyfin-web)
- [Jellyfin plugin template](https://github.com/jellyfin/jellyfin-plugin-template)
