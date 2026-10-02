# Third-party notices

This plugin integrates with [Jellyfin](https://github.com/jellyfin/jellyfin) and [Jellyfin Web](https://github.com/jellyfin/jellyfin-web); consult their repositories for complete license notices. Official plugin guidance is at [jellyfin.org/docs/general/server/plugins](https://jellyfin.org/docs/general/server/plugins/).

The fullscreen layout and control styling in `WebClient/styles.css`, together with the SVG control treatment in `WebClient/overlay.js`, are adapted from **Monochrome** at commit `5b1e6ef9b2531e3c9c9a83a1c7690b5a833567a7`. The source selectors, markup, and player bindings were changed for the Jellyfin plugin architecture. Monochrome is Copyright 2026 Monochrome Team and licensed under Apache License 2.0. A complete copy is included in `MONOCHROME_LICENSE.txt`.

The animated background bundles **@kawarp/core 1.1.1**, the default fullscreen visualizer selected by Monochrome at that commit. Kawarp is Copyright 2026 Better Lyrics and licensed under the MIT License. A complete copy is included in `KAWARP_LICENSE.txt`. The plugin drives Kawarp from Jellyfin playback state without connecting Jellyfin audio to a Web Audio graph.

The visual treatment also references **Abyss** as an optional design direction. No Abyss code or assets are copied or bundled. Abyss is referenced under the [MIT License](https://opensource.org/license/mit).

No Monochrome fonts, cover art, logos, or application JavaScript are bundled.
