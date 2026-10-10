// The "living photograph" (docs/design/identity.md §5.6, M5): hand-written WebGL, one full-screen
// triangle and one fragment shader over the hero <img>, which always stays underneath. Loaded as its
// own chunk by HeroGlIsland only after load, idle and the capability gate.
// Effects: depth parallax (pointer, sideways touch-drag), a depth-aware dolly and afternoon warmth on
// scroll, one warm light pass. Ambient motion ends by 4.8 s (WCAG 2.2.2); after 5 s the loop draws
// only in response to input. Ported from .runtime/design/messinian-light/hero-gl.js.
import { heroDepthSrc } from '@/lib/motion/heroCapability';

import { heroCover, parseObjectPosition } from './heroCover';

const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;
varying vec2 v;
uniform sampler2D uImg,uDepth;
uniform vec4 uCover;
uniform vec2 uPtr;
uniform float uT,uScroll,uAmb,uSweep;
void main(){
vec2 s=vec2(v.x,1.-v.y);
vec2 uv=s*uCover.xy+uCover.zw;
float d0=texture2D(uDepth,uv).r;
vec2 f=uCover.zw+uCover.xy*vec2(.5,.62);
uv=f+(uv-f)/(1.+uScroll*(.03+.15*d0));
float d=texture2D(uDepth,uv).r;
vec2 drift=vec2(sin(uT*.42),sin(uT*.31+1.3)*.6)*uAmb;
vec2 off=(uPtr+drift)*vec2(.018,.012)*(d-.42);
off.y+=uScroll*.035*(d-.3);
vec3 c=texture2D(uImg,clamp(uv+off,.001,.999)).rgb;
float x=s.x*.85+s.y*.55;
float band=exp(-pow((x-uSweep)*3.,2.));
c+=vec3(1.,.8,.52)*band*.17*(.25+.75*(1.-d));
float warm=clamp(uScroll*1.4,0.,1.)*.55;
c=mix(c,c*vec3(1.06,.98,.86)+vec3(.02,.008,0.),warm);
gl_FragColor=vec4(c,1.);
}`;

const UNIFORMS = ['uImg', 'uDepth', 'uCover', 'uPtr', 'uT', 'uScroll', 'uAmb', 'uSweep'] as const;
const FADE_MS = 700; // --dur-gl-fade
const MAX_DPR = 1.5;
const FRAME_MS = 1000 / 30;

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export type HeroGlHandle = { destroy(): void };

const smooth = (e0: number, e1: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.setAttribute('fetchpriority', 'low');
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * Mounts the canvas inside `.hero__media` (under the tint and scrim). Every failure tears it down and
 * records `data-gl="off:<reason>"` on the hero (including `crop-change` when <picture> selects another
 * crop after the upload); `destroy()` tears down without a reason (unmount).
 */
export function mountHeroGl({ hero, img, depthSrc }: { hero: HTMLElement; img: HTMLImageElement; depthSrc: string }): HeroGlHandle {
  const root = document.documentElement;
  const media = hero.querySelector('.hero__media') ?? hero;
  const canvas = document.createElement('canvas');
  canvas.className = 'hero__gl';
  canvas.setAttribute('aria-hidden', 'true');
  media.insertBefore(canvas, media.querySelector('.hero__tint'));

  let dead = false;
  let raf = 0;
  let readyTimer = 0;
  let io: IntersectionObserver | null = null;
  let gl: GL | null = null;
  const U: Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>> = {};
  const state = { ptr: [0, 0], tgt: [0, 0], scroll: 0, t0: 0, last: 0, frames: 0, slow: 0, visible: true, drag: null as null | [number, number], chained: false };
  // The size of the crop uploaded as the texture; img.naturalWidth/Height follow a later <picture> switch.
  let texW = 0;
  let texH = 0;

  const motionObserver = new MutationObserver(() => {
    if (root.dataset.motion !== 'full') fail('reduced-motion');
  });

  function teardown() {
    dead = true;
    cancelAnimationFrame(raf);
    clearTimeout(readyTimer);
    motionObserver.disconnect();
    io?.disconnect();
    removeEventListener('resize', resize);
    img.removeEventListener('load', resize);
    removeEventListener('scroll', kick);
    removeEventListener('pointermove', onMove);
    hero.removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    document.removeEventListener('visibilitychange', onVis);
    canvas.classList.remove('is-ready');
    setTimeout(() => {
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    }, FADE_MS);
  }

  function fail(reason: string) {
    if (dead) return;
    teardown();
    hero.dataset.gl = `off:${reason}`;
  }

  function destroy() {
    if (!dead) teardown();
  }

  const options: WebGLContextAttributes = {
    alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
  };
  gl = (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as GL | null;
  if (!gl) {
    fail('no-context');
    return { destroy };
  }
  const g = gl;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    fail('context-lost');
  });
  motionObserver.observe(root, { attributes: true, attributeFilter: ['data-motion'] });
  if (root.dataset.motion !== 'full') {
    fail('reduced-motion');
    return { destroy };
  }

  const shader = (type: number, source: string) => {
    const s = g.createShader(type) as WebGLShader;
    g.shaderSource(s, source);
    g.compileShader(s);
    return s;
  };
  const prog = g.createProgram() as WebGLProgram;
  g.attachShader(prog, shader(g.VERTEX_SHADER, VS));
  g.attachShader(prog, shader(g.FRAGMENT_SHADER, FS));
  g.bindAttribLocation(prog, 0, 'p');
  g.linkProgram(prog);
  const parallel = g.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;

  // Poll the parallel compile instead of blocking on LINK_STATUS (a synchronous driver stall).
  function whenLinked(done: () => void) {
    if (!parallel) return done();
    const poll = () => {
      if (dead) return;
      if (g.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) done();
      else requestAnimationFrame(poll);
    };
    poll();
  }

  function resize() {
    // A viewport crossing a <picture> breakpoint selects another crop: the uploaded texture and depth map
    // no longer match the photo, so hand the hero back to it.
    if (heroDepthSrc(img.currentSrc) !== depthSrc) return fail('crop-change');
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    g.viewport(0, 0, w, h);
    const [px, py] = parseObjectPosition(getComputedStyle(img).objectPosition);
    const c = heroCover(canvas.clientWidth, canvas.clientHeight, texW, texH, px, py);
    g.uniform4f(U.uCover ?? null, c[0], c[1], c[2], c[3]);
    kick();
  }

  function onMove(event: PointerEvent) {
    const r = hero.getBoundingClientRect();
    if (event.pointerType === 'mouse') {
      if (event.clientY < r.top || event.clientY > r.bottom) return;
      state.tgt[0] = ((event.clientX - r.left) / r.width - 0.5) * 2;
      state.tgt[1] = ((event.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    } else if (state.drag) {
      // Sideways touch-drag; vertical stays native scroll (touch-action: pan-y pinch-zoom on the hero, so pinch-zoom stays native too).
      state.tgt[0] = Math.max(-1.4, Math.min(1.4, state.drag[1] + (event.clientX - state.drag[0]) / (hero.clientWidth * 0.35)));
      kick();
    }
  }
  function onDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse') state.drag = [event.clientX, state.tgt[0]];
  }
  function onUp() {
    if (!state.drag) return;
    state.drag = null;
    state.tgt[0] = 0;
    kick();
  }
  function onVis() {
    if (document.visibilityState === 'visible') kick();
  }

  function frame(now: number) {
    raf = 0;
    if (dead || !state.visible || document.hidden) {
      state.chained = false;
      return;
    }
    if (!state.t0) state.t0 = now;
    const dt = state.last ? now - state.last : 1000;
    if (dt < FRAME_MS - 3) {
      raf = requestAnimationFrame(frame); // cap at about 30 fps
      return;
    }
    state.last = now;
    // Watchdog: after 6 frames, more than 18 frames above 80 ms. Only a frame that the previous frame
    // scheduled counts: one started by input, resize or visibility measures the pause before it, not the
    // GPU. A pause over 900 ms is not a slow frame either.
    if (++state.frames > 6 && state.chained && dt > 80 && dt < 900 && ++state.slow > 18) return fail('slow-frames');
    const t = (now - state.t0) / 1000;
    const amb = smooth(0.3, 1.3, t) * (1 - smooth(3.4, 4.8, t)); // ambient drift, gone by 4.8 s
    const sweep = -0.7 + 2.9 * smooth(0.6, 4.2, t); // one warm pass
    state.ptr[0] += (state.tgt[0] - state.ptr[0]) * 0.08;
    state.ptr[1] += (state.tgt[1] - state.ptr[1]) * 0.08;
    const r = hero.getBoundingClientRect();
    state.scroll = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
    g.uniform1f(U.uT ?? null, t);
    g.uniform1f(U.uAmb ?? null, amb);
    g.uniform1f(U.uSweep ?? null, sweep);
    g.uniform2f(U.uPtr ?? null, state.ptr[0], state.ptr[1]);
    g.uniform1f(U.uScroll ?? null, state.scroll);
    g.drawArrays(g.TRIANGLES, 0, 3);
    if (state.frames === 2) {
      canvas.classList.add('is-ready');
      readyTimer = window.setTimeout(() => {
        if (!dead) hero.dataset.gl = 'on';
      }, FADE_MS);
    }
    const settling = Math.abs(state.tgt[0] - state.ptr[0]) + Math.abs(state.tgt[1] - state.ptr[1]) > 0.002;
    state.chained = t < 5 || settling || state.frames < 3;
    if (state.chained) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!dead && !raf) raf = requestAnimationFrame(frame);
  }

  function start(images: readonly [HTMLImageElement, HTMLImageElement]) {
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) return fail('link');
    g.useProgram(prog);
    for (const name of UNIFORMS) U[name] = g.getUniformLocation(prog, name);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    texW = img.naturalWidth;
    texH = img.naturalHeight;
    try {
      images.forEach((source, unit) => {
        g.activeTexture(g.TEXTURE0 + unit);
        g.bindTexture(g.TEXTURE_2D, g.createTexture());
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
      });
    } catch {
      return fail('texture');
    }
    if (g.getError() !== g.NO_ERROR) return fail('texture');
    g.uniform1i(U.uImg ?? null, 0);
    g.uniform1i(U.uDepth ?? null, 1);
    resize();
    if (dead) return; // the first resize found another crop and tore down, so register nothing
    io = new IntersectionObserver((entries) => {
      state.visible = entries[0]?.isIntersecting ?? false;
      if (state.visible) kick();
    });
    io.observe(hero);
    addEventListener('resize', resize, { passive: true });
    img.addEventListener('load', resize); // the browser switched the <picture> source
    addEventListener('scroll', kick, { passive: true });
    addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerdown', onDown, { passive: true });
    addEventListener('pointerup', onUp, { passive: true });
    addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('visibilitychange', onVis);
  }

  Promise.all([img.decode().then(() => img), loadImage(depthSrc)]).then(
    (images) => {
      if (!dead) whenLinked(() => start(images));
    },
    () => fail('assets'),
  );

  return { destroy };
}
