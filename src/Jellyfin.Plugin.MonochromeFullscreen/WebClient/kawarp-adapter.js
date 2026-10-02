// Adapter for @kawarp/core 1.1.1, the default fullscreen background used by
// Monochrome. The library is bundled at build time and remains MIT licensed.
const KAWARP_OPTIONS = {
    warpIntensity: 1,
    blurPasses: 8,
    animationSpeed: 1,
    transitionDuration: 1000,
    saturation: 1.5,
    dithering: 0.008,
    scale: 1.25
};

export async function createKawarpRenderer(canvas) {
    const { Kawarp } = await import('./kawarp.js');
    const kawarp = new Kawarp(canvas, KAWARP_OPTIONS);

    return {
        resize() {
            kawarp.resize();
        },
        render(timestamp) {
            kawarp.renderFrame(timestamp / 1000);
        },
        loadCover(url) {
            return kawarp.loadImage(url);
        },
        destroy() {
            kawarp.dispose();
        }
    };
}

export { KAWARP_OPTIONS };
