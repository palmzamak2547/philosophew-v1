import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// One renderer for the whole app. Scenes register a tick; the loop sleeps when nothing is visible.
export type Tick = (dt: number, t: number) => void;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** The room reflections every machine shows. Built on first request, its shaders compiled off the main thread. */
  environment(): Promise<THREE.Texture | null>;
  size: { w: number; h: number; dpr: number };
  mobile: boolean;
  lowPower: boolean;
  /** 1 = full resolution; drops when frames keep missing their slot, climbs back when they don't. */
  quality: number;
  setView(scene: THREE.Scene | null, camera: THREE.PerspectiveCamera | null): void;
  /** What is on screen now, so an overlay scene can hand the view back when it closes. */
  view(): { scene: THREE.Scene | null; camera: THREE.PerspectiveCamera | null };
  onTick(fn: Tick): () => void;
  onResize(fn: (w: number, h: number) => void): () => void;
  ndc(e: { clientX: number; clientY: number }, out?: THREE.Vector2): THREE.Vector2;
  project(v: THREE.Vector3, camera: THREE.Camera): { x: number; y: number };
  wake(): void;
}

let stage: Stage | null = null;

/**
 * Smoothness first: while frames keep running long, render fewer pixels; earn them back slowly. A step down that does
 * not make frames shorter was not about pixels (an iPhone in Low Power Mode draws at 30 Hz whatever we do): it is undone
 * and the stage stops stepping down. Before this, such iPhones fell to a third of their resolution ("an 8-bit game").
 * ponytail: a frame-time heuristic, not a GPU timer query; enough to keep weak phones at a steady rate.
 * Checked by scripts/check-stage.mjs.
 */
export function governor(changed: () => void) {
  let quality = 1, slowMs = 0, fastMs = 0, avg = 16.7, capped = false;
  let trial: { was: number; before: number; frames: number } | null = null;
  const set = (q: number) => { quality = q; slowMs = 0; fastMs = 0; changed(); };
  return {
    get quality() { return quality; },
    adapt(ms: number) {
      if (ms > 250) return; // a tab switch or a stall, not a trend
      avg += (ms - avg) * 0.08;
      if (trial) {
        if (++trial.frames < 60) return; // about a second at the new size
        const { was, before } = trial;
        trial = null;
        if (avg > before * 0.88) { capped = true; set(was); } // no faster: the pixels were not the cost
        return;
      }
      if (ms > 24) { slowMs += ms; fastMs = 0; } else { slowMs = Math.max(0, slowMs - ms * 0.5); if (ms < 18) fastMs += ms; }
      if (slowMs > 1200 && quality > 0.55 && !capped) { trial = { was: quality, before: avg, frames: 0 }; set(Math.max(0.55, quality - 0.15)); }
      else if (fastMs > 12000 && quality < 1) set(Math.min(1, quality + 0.15));
    },
  };
}

/** The stage if something already built it, never building one: a flat page must not pay for 3D it never shows. */
export function peekStage(): Stage | null {
  return stage;
}

/**
 * three's RoomEnvironment, prefiltered for reflections: the same scene, filter and size as always, so the same
 * pixels. Built in one go it froze a cold load for 0.5 s (1.1 s on a mid-range phone), almost all of it waiting
 * on shader links. So every shader it needs is compiled first with compileAsync, which the browser does off the
 * main thread (KHR_parallel_shader_compile), and only then is the environment drawn. Where the browser cannot
 * compile in parallel (Firefox) this costs what it always did, just later.
 */
function roomEnvironment(renderer: THREE.WebGLRenderer, size: { w: number; h: number }): Promise<THREE.Texture | null> {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const warm: Promise<unknown>[] = [];
  // three keeps the filter shaders private; if a later three renames these, the environment is simply built at once
  const p = pmrem as unknown as { _setSize?: (n: number) => void; _allocateTargets?: () => THREE.WebGLRenderTarget; _pingPongRenderTarget?: THREE.WebGLRenderTarget | null; _blurMaterial?: THREE.Material | null; _ggxMaterial?: THREE.Material | null };
  try {
    if (p._setSize && p._allocateTargets) {
      p._setSize(256); // fromScene's default size
      p._allocateTargets().dispose(); // creates the filter shaders and the scratch target fromScene reuses
      const into = p._pingPongRenderTarget;
      if (into) {
        // A shader drawn into a render target is a different program (no tone mapping, linear output), and one
        // for a mesh without normals differs from one with: match what fromScene draws, or it compiles its own.
        const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        const filters = new THREE.Scene();
        for (const m of [p._blurMaterial, p._ggxMaterial]) if (m) filters.add(new THREE.Mesh(tri, m));
        const backdrop = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false }));
        const was = renderer.getRenderTarget();
        renderer.setRenderTarget(into);
        warm.push(renderer.compileAsync(room, cam), renderer.compileAsync(filters, new THREE.OrthographicCamera()), renderer.compileAsync(backdrop, cam));
        renderer.setRenderTarget(was);
        void Promise.all(warm).finally(() => { backdrop.geometry.dispose(); backdrop.material.dispose(); tri.dispose(); });
      }
    }
  } catch {
    warm.length = 0; // build it the plain way below
  }
  return Promise.all(warm).catch(() => {}).then(() => {
    performance.mark('pw:env-start');
    const env = pmrem.fromScene(room, 0.04).texture;
    performance.measure('pw:env', 'pw:env-start');
    pmrem.dispose();
    room.dispose();
    // fromScene hands the canvas back with its viewport floored, where setSize rounds it (a pixel apart when
    // height x ratio is fractional): put back the one every frame used when this ran before the first resize
    renderer.setViewport(0, 0, size.w, size.h);
    return env;
  }).catch((e) => { console.error(e); return null; });
}

export function getStage(): Stage | null {
  if (stage) return stage;
  const host = document.getElementById('gl')!;
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null; // no WebGL: the app draws flat
  }
  // iOS reports 4 cores whatever the phone, so a core count put every iPhone among the weak ones (half resolution at
  // most); an Apple GPU is never weak here. GL_RENDERER reads "Apple GPU" on iPhone and iPad.
  const apple = /apple/i.test(String(renderer.getContext().getParameter(0x1f01)));
  const lowPower = mobile && cores <= 4 && !apple;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  // Reading shader logs on first use can force the driver to finish compiling right there (seconds on a
  // mid-range phone). Checked while developing, skipped in production, as three.js recommends.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  host.appendChild(renderer.domElement);

  let env: Promise<THREE.Texture | null> | null = null;
  const size = { w: 1, h: 1, dpr: 1 };
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  const ticks = new Set<Tick>();
  const resizers = new Set<(w: number, h: number) => void>();

  const gov = governor(() => resize());

  function resize() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    const dpr = Math.max(devicePixelRatio >= 2 ? 1 : 0.75, Math.min(devicePixelRatio || 1, lowPower ? 1.5 : apple ? 2 : mobile ? 1.75 : 2) * gov.quality);
    size.w = w; size.h = h; size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    resizers.forEach((f) => f(w, h));
    wake();
  }
  new ResizeObserver(resize).observe(host);
  addEventListener('orientationchange', () => setTimeout(resize, 200));

  // A card over the room hides it under a dark, blurred scrim. Once the card has landed (its entrance and the
  // capsule opening behind it take 1.15 s), the room stops drawing: it cost a whole frame of draw calls for a
  // blur. It draws again the moment the card goes. Counted in stage time, so a filmed run stays deterministic.
  const REST_AFTER = 1.3;
  const root = document.documentElement;
  let covered = false, coveredFor = 0;
  const cover = () => {
    const c = root.classList.contains('has-reveal');
    if (c === covered) return;
    covered = c;
    coveredFor = 0;
    if (!c) wake();
  };
  new MutationObserver(cover).observe(root, { attributes: true, attributeFilter: ['class'] });
  cover();

  let prev = performance.now();
  let raf = 0;
  let t = 0;
  function frame() {
    raf = 0;
    if (document.hidden || !scene || !camera) return;
    const now = performance.now();
    gov.adapt(now - prev);
    const dt = Math.min((now - prev) / 1000, 0.1); // real time on slow devices; clamp only true stalls
    prev = now;
    t += dt;
    ticks.forEach((f) => f(dt, t));
    renderer.render(scene, camera);
    if (covered && (coveredFor += dt) >= REST_AFTER) return; // at rest: the last frame stays on screen
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (!raf && !document.hidden && scene && camera) { prev = performance.now(); raf = requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', wake);

  stage = {
    renderer,
    canvas: renderer.domElement,
    environment: () => (env ??= roomEnvironment(renderer, size)),
    size,
    mobile,
    lowPower,
    get quality() { return gov.quality; },
    view() { return { scene, camera }; },
    setView(s, c) {
      scene = s; camera = c;
      if (c) { c.aspect = size.w / size.h; c.updateProjectionMatrix(); }
      host.style.visibility = s ? 'visible' : 'hidden';
      if (!s) renderer.clear();
      wake();
    },
    onTick(fn) { ticks.add(fn); wake(); return () => ticks.delete(fn); },
    onResize(fn) { resizers.add(fn); return () => resizers.delete(fn); },
    ndc(e, out = new THREE.Vector2()) {
      const r = renderer.domElement.getBoundingClientRect();
      return out.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    },
    project(v, cam) {
      const p = v.clone().project(cam);
      return { x: (p.x * 0.5 + 0.5) * size.w, y: (-p.y * 0.5 + 0.5) * size.h };
    },
    wake,
  };
  resize();
  if (import.meta.env.DEV) (window as unknown as { __stage: Stage }).__stage = stage;
  return stage;
}
