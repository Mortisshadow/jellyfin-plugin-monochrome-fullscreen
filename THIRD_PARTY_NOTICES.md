# Third-party notices

This plugin integrates with [Jellyfin](https://github.com/jellyfin/jellyfin) and [Jellyfin Web](https://github.com/jellyfin/jellyfin-web); consult their repositories for complete license notices. Official plugin guidance is at [jellyfin.org/docs/general/server/plugins](https://jellyfin.org/docs/general/server/plugins/).

The fullscreen layout and control styling in `WebClient/styles.css`, together with the SVG control treatment in `WebClient/overlay.js`, are adapted from **Monochrome** at commit `5b1e6ef9b2531e3c9c9a83a1c7690b5a833567a7`. The source selectors, markup, and player bindings were changed for the Jellyfin plugin architecture. Monochrome is Copyright 2026 Monochrome Team and licensed under Apache License 2.0. A complete copy is included in `MONOCHROME_LICENSE.txt`.

The animated background bundles **@kawarp/core 1.3.1**, the same Kawarp renderer used by Monochrome's default fullscreen visualizer. Monochrome's referenced lockfile resolves the older 1.1.1 release; this plugin deliberately uses the API-compatible 1.3.1 release published after Kawarp was relicensed to MIT. Kawarp is Copyright 2026 Better Lyrics and licensed under the MIT License. A complete copy is included in `KAWARP_LICENSE.txt`. The plugin drives Kawarp from Jellyfin playback state without connecting Jellyfin audio to a Web Audio graph.

The visual treatment also references **Abyss** as an optional design direction. No Abyss code or assets are copied or bundled. Abyss is referenced under the [MIT License](https://opensource.org/license/mit).

No Monochrome fonts, cover art, logos, or application JavaScript are bundled.
