# Monochrome Fullscreen

Monochrome Fullscreen is an optional, resource-conscious now-playing overlay for the **server-hosted Jellyfin Web client**. It targets Jellyfin **12.1** and **.NET 10** only.

## What it does

- Opens a fullscreen audio view automatically with title, artist, artwork, progress, transport, volume, and keyboard/D-pad navigation.
- Uses one canvas, trying WebGL2 and then WebGL1; if neither is available it keeps a static gradient background.
- Does not perform audio analysis in the MVP. Motion is time-based and bounded by a 24/30/60 FPS setting.
- Injects the client at request time. It serves embedded assets and transiently augments index/config responses in memory; it never edits files in `jellyfin-web`.

## Supported clients

Supported: desktop and mobile browsers pointed at the server-hosted Jellyfin Web UI. Android TV browser use and a sideloaded normal Jellyfin Android app are experimental. Jellyfin Media Player must be tested separately because packaged client versions may use their own Web assets. Native Android TV, Tizen, Roku, Swiftfin, and other non-Web clients are out of scope.

## Install

Download the `MonochromeFullscreen-1.0.0.0` artifact from a successful GitHub Actions run and extract its ZIP. Copy the contained `MonochromeFullscreen` folder into Jellyfin’s plugins directory, then restart Jellyfin. The folder contains `Jellyfin.Plugin.MonochromeFullscreen.dll`, `LICENSE`, and `THIRD_PARTY_NOTICES.md`; Web assets are embedded in the DLL. Do not copy files into the `jellyfin-web` installation.

Common plugin roots include `/var/lib/jellyfin/plugins` on Linux, `/config/plugins` in the official container when `/config` is mounted, and `%ProgramData%\Jellyfin\Server\plugins` for the Windows tray installation. Use the plugin path appropriate to the actual Jellyfin installation.

After restart, open Dashboard → Plugins → Monochrome Fullscreen and choose settings. Refresh the browser after changing settings if needed.

## Settings

- **Enabled**: master switch.
- **Open automatically when audio starts**: automatic overlay opening.
- **Background effect**, **reduced motion**, and **low-power mode**: select the visual profile.
- **Frame-rate limit**: 24, 30, or 60 FPS.

## Uninstall / recovery

Disable the plugin, stop Jellyfin, remove its plugin folder/artifact, and restart Jellyfin. Because the Web client is never modified, removing the plugin restores normal Web responses after restart. If the overlay is absent, inspect the server log and browser console and confirm Jellyfin 12.1 and the server-hosted Web UI.

## Known limitations

- The MVP supports Jellyfin 12.1 only; Jellyfin 10.11 requires a separate .NET 9 build.
- The Web plugin manager and playback object shapes are present in the official Jellyfin Web source but are not a documented third-party compatibility contract.
- Browser caches and service workers can require a hard refresh after installation or configuration changes.
- There is no manual launcher when automatic opening is disabled.
- Audio-reactive rendering, lyrics, TTML, native TV clients, queue editing, DSP, and release automation are not included.
- Jellyfin Media Player compatibility depends on whether the installed version loads the server-hosted Web client.

## Roadmap

The next milestones are conservative audio reactivity, only if the existing media element can be accessed without reconnecting or disrupting it, followed by the parse-once TTML adapter described in [docs/TTML_ROADMAP.md](docs/TTML_ROADMAP.md).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/MANUAL_TESTS.md](docs/MANUAL_TESTS.md), and [docs/TTML_ROADMAP.md](docs/TTML_ROADMAP.md).

## Official references

- [Jellyfin plugin documentation](https://jellyfin.org/docs/general/server/plugins/)
- [Jellyfin Web repository](https://github.com/jellyfin/jellyfin-web)
- [Jellyfin plugin template](https://github.com/jellyfin/jellyfin-plugin-template)
