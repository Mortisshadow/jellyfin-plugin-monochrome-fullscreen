import { createKawarpRenderer } from './kawarp-adapter.js';
import { ActiveAnimationClock } from './animation-clock.js';

const CONTEXT_OPTIONS = {
    powerPreference: 'low-power',
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    alpha: true
};

const PROFILES = {
    high: { fps: 60, scale: 1, particles: 24, dpr: 1.5 },
    balanced: { fps: 30, scale: 0.75, particles: 18, dpr: 1.5 },
    low: { fps: 24, scale: 0.5, particles: 12, dpr: 1 },
    static: { fps: 0, scale: 0.5, particles: 0, dpr: 1 }
};

function shaderSources(webgl2) {
    if (webgl2) {
        return {
            vertex: `#version 300 es
                in vec2 a_seed;
                uniform float u_time;
                uniform float u_aspect;
                uniform float u_size;
                void main() {
                    float phase = a_seed.x * 23.17 + u_time * (.08 + a_seed.y * .12);
                    vec2 p = vec2(sin(phase * 1.3), cos(phase * .9));
                    p += vec2(sin(phase * .31), cos(phase * .27)) * .35;
                    p.x /= max(u_aspect, .6);
                    gl_Position = vec4(p * .78, 0.0, 1.0);
                    gl_PointSize = u_size * (.45 + a_seed.y * .75);
                }`,
            fragment: `#version 300 es
                precision mediump float;
                out vec4 outColor;
                void main() {
                    vec2 p = gl_PointCoord - .5;
                    float glow = smoothstep(.5, 0.0, length(p));
                    outColor = vec4(vec3(.92, .94, .98), glow * .075);
                }`
        };
    }

    return {
        vertex: `attribute vec2 a_seed;
            uniform float u_time;
            uniform float u_aspect;
            uniform float u_size;
            void main() {
                float phase = a_seed.x * 23.17 + u_time * (.08 + a_seed.y * .12);
                vec2 p = vec2(sin(phase * 1.3), cos(phase * .9));
                p += vec2(sin(phase * .31), cos(phase * .27)) * .35;
                p.x /= max(u_aspect, .6);
                gl_Position = vec4(p * .78, 0.0, 1.0);
                gl_PointSize = u_size * (.45 + a_seed.y * .75);
            }`,
        fragment: `precision mediump float;
            void main() {
                vec2 p = gl_PointCoord - .5;
                float glow = smoothstep(.5, 0.0, length(p));
                gl_FragColor = vec4(vec3(.92, .94, .98), glow * .075);
            }`
    };
}

function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
        gl.deleteShader(shader);
        throw new Error(message);
    }
    return shader;
}

function initializeRenderer(gl, profile, webgl2) {
    const sources = shaderSources(webgl2);
    const program = gl.createProgram();
    let vertex;
    let fragment;
    let buffer;
    try {
        vertex = compile(gl, gl.VERTEX_SHADER, sources.vertex);
        fragment = compile(gl, gl.FRAGMENT_SHADER, sources.fragment);
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program) || 'Unknown program link error');
        }

        const seeds = new Float32Array(PROFILES.high.particles * 2);
        for (let index = 0; index < PROFILES.high.particles; index += 1) {
            seeds[index * 2] = ((index * 47) % 97) / 97;
            seeds[(index * 2) + 1] = ((index * 71) % 89) / 89;
        }
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    } catch (error) {
        if (buffer) gl.deleteBuffer(buffer);
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        gl.deleteProgram(program);
        throw error;
    }

    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    const seedLocation = gl.getAttribLocation(program, 'a_seed');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const aspectLocation = gl.getUniformLocation(program, 'u_aspect');
    const sizeLocation = gl.getUniformLocation(program, 'u_size');
    gl.useProgram(program);
    gl.enableVertexAttribArray(seedLocation);
    gl.vertexAttribPointer(seedLocation, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    return {
        resize(width, height) {
            gl.viewport(0, 0, width, height);
        },
        render(time, width, height, particles = profile.particles) {
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(program);
            gl.uniform1f(timeLocation, time / 1000);
            gl.uniform1f(aspectLocation, width / Math.max(1, height));
            gl.uniform1f(sizeLocation, Math.max(48, Math.min(width, height) * .18));
            gl.drawArrays(gl.POINTS, 0, particles);
        },
        destroy() {
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        }
    };
}

export function createWebGLRenderer(canvas, profile) {
    for (const [contextName, webgl2] of [['webgl2', true], ['webgl', false]]) {
        let gl;
        try {
            gl = canvas.getContext(contextName, CONTEXT_OPTIONS);
            if (gl) return initializeRenderer(gl, profile, webgl2);
        } catch {
            gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        }
    }

    return null;
}

async function createDefaultRenderer(canvas, profile) {
    try {
        return await createKawarpRenderer(canvas);
    } catch (error) {
        console.warn('[MonochromeFullscreen] Kawarp initialization failed; using lightweight fallback', error);
        return createWebGLRenderer(canvas, profile);
    }
}

/**
 * Single-canvas visualizer with visibility, pause, context-loss, and adaptive-quality handling.
 */
export class AmbientVisualizer {
    constructor(canvas, settings, dependencies = {}) {
        this.canvas = canvas;
        this.settings = settings;
        this.window = dependencies.windowObject || window;
        this.document = dependencies.documentObject || document;
        this.rendererFactory = dependencies.rendererFactory || createDefaultRenderer;
        this.requestFrame = dependencies.requestAnimationFrame || (callback => this.window.requestAnimationFrame(callback));
        this.cancelFrame = dependencies.cancelAnimationFrame || (handle => this.window.cancelAnimationFrame(handle));
        this.profile = this.selectProfile();
        this.currentFps = Math.min(this.profile.fps, settings.fpsLimit || 30);
        this.scale = this.profile.scale;
        this.particles = this.profile.particles;
        this.renderer = null;
        this.rendererLoading = null;
        this.coverUrl = null;
        this.frameHandle = null;
        this.isOverlayOpen = false;
        this.isPlaybackPaused = false;
        this.contextLost = false;
        this.animationClock = new ActiveAnimationClock();
        this.lastFrame = 0;
        this.slowSince = 0;
        this.sampleStart = 0;
        this.sampleFrames = 0;
        this.destroyed = false;
        this.onFrame = this.onFrame.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
        this.onResize = this.onResize.bind(this);
        this.onContextLost = this.onContextLost.bind(this);
        this.onContextRestored = this.onContextRestored.bind(this);
        this.document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.window.addEventListener('resize', this.onResize);
        this.window.addEventListener('orientationchange', this.onResize);
        this.canvas.addEventListener('webglcontextlost', this.onContextLost);
        this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    }

    selectProfile() {
        const systemReduced = this.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!this.settings.backgroundEffect || this.settings.reducedMotion || systemReduced) return PROFILES.static;
        if (this.settings.lowPowerMode || this.settings.fpsLimit === 24) return PROFILES.low;
        if (this.settings.fpsLimit === 60) return PROFILES.high;
        return PROFILES.balanced;
    }

    setOverlayOpen(value) {
        this.isOverlayOpen = Boolean(value);
        this.updateLoop();
    }

    setPlaybackPaused(value) {
        this.isPlaybackPaused = Boolean(value);
        this.updateLoop();
    }

    setCoverUrl(value) {
        const nextUrl = value || null;
        if (nextUrl === this.coverUrl) return;
        this.coverUrl = nextUrl;
        if (nextUrl && this.renderer?.loadCover) {
            Promise.resolve(this.renderer.loadCover(nextUrl)).catch(error => {
                console.warn('[MonochromeFullscreen] Unable to load artwork into Kawarp', error);
            });
        }
    }

    updateLoop() {
        const shouldRun = !this.destroyed
            && this.isOverlayOpen
            && !this.isPlaybackPaused
            && !this.document.hidden
            && !this.contextLost
            && this.currentFps > 0;
        if (shouldRun) this.start();
        else this.stop();
    }

    start() {
        if (this.frameHandle !== null || this.rendererLoading) return;
        if (!this.renderer) {
            let created;
            try {
                created = this.rendererFactory(this.canvas, this.profile);
            } catch (error) {
                console.warn('[MonochromeFullscreen] WebGL initialization failed; using static background', error);
                this.canvas.hidden = true;
                return;
            }
            if (created?.then) {
                this.rendererLoading = Promise.resolve(created)
                    .then(renderer => {
                        this.rendererLoading = null;
                        if (this.destroyed) {
                            renderer?.destroy?.();
                            return;
                        }
                        this.renderer = renderer;
                        this.finishRendererInitialization();
                        this.updateLoop();
                    })
                    .catch(error => {
                        this.rendererLoading = null;
                        this.canvas.hidden = true;
                        console.warn('[MonochromeFullscreen] WebGL initialization failed; using static background', error);
                    });
                return;
            }
            this.renderer = created;
            this.finishRendererInitialization();
        }
        if (!this.renderer) return;
        this.animationClock.resume();
        this.lastFrame = 0;
        this.sampleStart = 0;
        this.sampleFrames = 0;
        this.frameHandle = this.requestFrame(this.onFrame);
    }

    finishRendererInitialization() {
        this.canvas.hidden = !this.renderer;
        if (this.renderer) this.canvas.classList?.add?.('mfs-visualizer-active');
        else this.canvas.classList?.remove?.('mfs-visualizer-active');
        if (!this.renderer) return;
        this.resize();
        if (this.coverUrl && this.renderer.loadCover) {
            Promise.resolve(this.renderer.loadCover(this.coverUrl)).catch(error => {
                console.warn('[MonochromeFullscreen] Unable to load artwork into Kawarp', error);
            });
        }
    }

    stop() {
        this.animationClock.pause();
        if (this.frameHandle !== null) {
            this.cancelFrame(this.frameHandle);
            this.frameHandle = null;
        }
    }

    onFrame(timestamp) {
        this.frameHandle = null;
        if (!this.isOverlayOpen || this.isPlaybackPaused || this.document.hidden || this.contextLost) {
            this.animationClock.pause();
            return;
        }
        const activeTime = this.animationClock.advance(timestamp);
        const interval = 1000 / this.currentFps;
        if (!this.lastFrame || timestamp - this.lastFrame >= interval) {
            this.renderer?.render(activeTime, this.canvas.width, this.canvas.height, this.particles);
            this.lastFrame = timestamp;
            this.measurePerformance(timestamp);
        }
        this.frameHandle = this.requestFrame(this.onFrame);
    }

    measurePerformance(timestamp) {
        if (!this.sampleStart) this.sampleStart = timestamp;
        this.sampleFrames += 1;
        const elapsed = timestamp - this.sampleStart;
        if (elapsed < 3000) return;
        const average = elapsed / Math.max(1, this.sampleFrames);
        const budget = 1000 / this.currentFps;
        if (average > budget * 1.35) {
            if (!this.slowSince) this.slowSince = timestamp;
            if (timestamp - this.slowSince >= 3000) {
                this.degrade();
                this.slowSince = timestamp;
            }
        } else {
            this.slowSince = 0;
        }
        this.sampleStart = timestamp;
        this.sampleFrames = 0;
    }

    degrade() {
        if (this.particles > 30) {
            this.particles = Math.max(30, Math.floor(this.particles * 0.75));
        } else if (this.scale > 0.5) {
            this.scale = Math.max(0.5, this.scale * 0.8);
            this.resize();
        } else if (this.currentFps > 30) {
            this.currentFps = 30;
        } else if (this.currentFps > 24) {
            this.currentFps = 24;
        }
    }

    resize() {
        if (!this.renderer) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(this.window.devicePixelRatio || 1, this.profile.dpr);
        const width = Math.max(1, Math.floor(rect.width * dpr * this.scale));
        const height = Math.max(1, Math.floor(rect.height * dpr * this.scale));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.renderer.resize(width, height);
        }
    }

    onResize() {
        this.resize();
    }

    onVisibilityChange() {
        this.updateLoop();
    }

    onContextLost(event) {
        event.preventDefault();
        this.contextLost = true;
        this.stop();
        this.canvas.hidden = true;
    }

    onContextRestored() {
        this.contextLost = false;
        this.renderer?.destroy();
        this.renderer = null;
        this.rendererLoading = null;
        this.updateLoop();
    }

    destroy() {
        this.destroyed = true;
        this.stop();
        this.renderer?.destroy();
        this.renderer = null;
        this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.window.removeEventListener('resize', this.onResize);
        this.window.removeEventListener('orientationchange', this.onResize);
        this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
        this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    }
}

export { CONTEXT_OPTIONS, PROFILES, createDefaultRenderer };
