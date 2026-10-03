// Adapter for @kawarp/core 1.3.1. Monochrome uses the same Kawarp renderer;
// this later release preserves its public API and is distributed under MIT.
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
        render(activeTime) {
            kawarp.renderFrame(activeTime / 1000);
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
