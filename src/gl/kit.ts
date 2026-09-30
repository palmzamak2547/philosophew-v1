import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Finish } from '../core/store';
import { fillAt } from '../core/canvastext';

// ---------- noise (value noise + fbm), enough for marble, wood and paper ----------
// Integer lattice hash: a few multiplies instead of Math.sin, several times faster on phones.
function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, img: ImageData | null, s: number) => ImageData | void, opts: { repeat?: number; srgb?: boolean } = {}) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = paint(ctx, null, size);
  if (img) ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat); }
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const rgb = (hex: string) => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; };

export function marbleTex(base = '#EFEAE2', vein = '#8E8578', seed = 0) {
  return canvasTex(`marble${base}${vein}${seed}`, 384, (ctx, _i, s) => {
    const img = ctx.createImageData(s, s);
    const [br, bg, bb] = rgb(base), [vr, vg, vb] = rgb(vein);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const nx = x / s * 4 + seed, ny = y / s * 4;
      const n = fbm(nx, ny, 5);
      const v = Math.pow(Math.abs(Math.sin((nx + ny * 0.6 + n * 5.5) * 2.1)), 0.18); // thin dark veins where sin ~ 0
      const k = (1 - v) * 0.85 + (fbm(nx * 3, ny * 3, 3) - 0.5) * 0.08;
      const i = (y * s + x) * 4;
      img.data[i] = br + (vr - br) * k; img.data[i + 1] = bg + (vg - bg) * k; img.data[i + 2] = bb + (vb - bb) * k; img.data[i + 3] = 255;
    }
    return img;
  }, { repeat: 1 });
}

export function woodTex(base = '#7A4B2A', dark = '#4A2A16') {
  return canvasTex(`wood${base}${dark}`, 256, (ctx, _i, s) => {
    const img = ctx.createImageData(s, s);
    const [br, bg, bb] = rgb(base), [dr, dg, db] = rgb(dark);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const n = fbm(x / s * 3, y / s * 12, 4);
      const ring = Math.pow(0.5 + 0.5 * Math.sin((x / s) * 40 + n * 9), 3);
      const k = ring * 0.7 + (fbm(x / 9, y / 2, 2) - 0.5) * 0.2;
      const i = (y * s + x) * 4;
      img.data[i] = br + (dr - br) * k; img.data[i + 1] = bg + (dg - bg) * k; img.data[i + 2] = bb + (db - bb) * k; img.data[i + 3] = 255;
    }
    return img;
  }, { repeat: 1 });
}

export function bambooTex() {
  return canvasTex('bamboo', 256, (ctx, _i, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const fiber = fbm(x / s * 60, y / s * 2, 3);
      const node = Math.exp(-Math.pow(((y / s) * 3 % 1) - 0.5, 2) * 900);
      const i = (y * s + x) * 4;
      const l = 0.78 + fiber * 0.22 - node * 0.35;
      img.data[i] = 214 * l; img.data[i + 1] = 176 * l; img.data[i + 2] = 104 * l; img.data[i + 3] = 255;
    }
    return img;
  });
}

export function paperTex(tone = '#F4ECDC') {
  return canvasTex('paper' + tone, 256, (ctx, _i, s) => {
    const img = ctx.createImageData(s, s);
    const [r, g, b] = rgb(tone);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const n = fbm(x / 6, y / 6, 3) * 0.08 + fbm(x / 40, y / 40, 2) * 0.06;
      const i = (y * s + x) * 4;
      img.data[i] = r * (0.93 + n); img.data[i + 1] = g * (0.93 + n); img.data[i + 2] = b * (0.93 + n); img.data[i + 3] = 255;
    }
    return img;
  }, { repeat: 2 });
}

/** Soft radial alpha used for contact shadows and glows. */
export function radialTex(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  return canvasTex('radial' + inner + outer, 128, (ctx, _i, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

type TextOpts = { font?: string; color?: string; w?: number; h?: number; glow?: string; stroke?: string; cache?: boolean };
function paintText(ctx: CanvasRenderingContext2D, text: string, opts: TextOpts, x: number, y: number) {
  ctx.font = opts.font || '700 72px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = 24; }
  if (opts.stroke) { ctx.lineWidth = 4; ctx.strokeStyle = opts.stroke; fillAt(ctx, text, x, y, 'center', true); }
  ctx.fillStyle = opts.color || '#000';
  fillAt(ctx, text, x, y);
  if (opts.glow) fillAt(ctx, text, x, y);
}

/** Text painted onto a transparent canvas (inscriptions, numbers, neon). */
export function textTex(text: string, opts: TextOpts = {}) {
  const key = 'txt' + text + JSON.stringify(opts);
  const hit = opts.cache !== false && texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = opts.w || 512;
  c.height = opts.h || 128;
  paintText(c.getContext('2d')!, text, opts, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.cache !== false) texCache.set(key, t);
  return t;
}

/**
 * Several labels in one texture, each painted exactly as textTex paints it into its own w x h cell, so a row of
 * labels can share one material and one draw call. cell(i) is label i's uv rectangle [u0, v0, u1, v1].
 */
export function textAtlas(texts: string[], opts: TextOpts, cols: number) {
  const w = opts.w || 512, h = opts.h || 128, rows = Math.ceil(texts.length / cols);
  const c = document.createElement('canvas');
  c.width = w * cols;
  c.height = h * rows;
  const ctx = c.getContext('2d')!;
  texts.forEach((s, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    paintText(ctx, s, opts, x + w / 2, y + h / 2);
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // textures are flipped: v runs up from the canvas bottom
  const cell = (i: number) => [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, (i % cols + 1) / cols, 1 - Math.floor(i / cols) / rows] as const;
  return { tex, cell };
}

/** Point a geometry's uvs (0..1) at one cell of an atlas. */
export function uvInto(g: THREE.BufferGeometry, [u0, v0, u1, v1]: readonly number[]) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

// ---------- fewer draw calls, same pixels ----------
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();

/**
 * Parts that never move on their own, baked into one mesh per material in root's space: one draw call where there
 * were many, the same triangles in the same places. Each part must sit under root (at any depth) and never move
 * relative to it. Parts leave the scene graph; the merged meshes are added to root and returned.
 */
export function mergeStatic(root: THREE.Object3D, parts: THREE.Mesh[]) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; order: number; geos: THREE.BufferGeometry[] }>();
  for (const p of parts) {
    const mat = p.material as THREE.Material;
    const key = `${mat.uuid} ${p.renderOrder}`;
    if (!groups.has(key)) groups.set(key, { mat, order: p.renderOrder, geos: [] });
    _m.multiplyMatrices(_inv, p.matrixWorld);
    const g = p.geometry.clone().applyMatrix4(_m);
    if (_m.determinant() < 0) flipWinding(g); // a mirrored part would otherwise turn inside out
    groups.get(key)!.geos.push(g);
    p.removeFromParent();
  }
  return [...groups.values()].map(({ mat, order, geos }) => {
    const mesh = new THREE.Mesh(mergeAll(geos), mat);
    mesh.renderOrder = order;
    root.add(mesh);
    return mesh;
  });
}

/** One geometry from several already placed ones. mergeGeometries wants the same attributes everywhere and every
 *  geometry indexed or none (RoundedBoxGeometry and ExtrudeGeometry come without an index). */
export function mergeAll(geos: THREE.BufferGeometry[]) {
  if (geos.length === 1) return geos[0];
  const names = Object.keys(geos[0].attributes).filter((n) => geos.every((g) => n in g.attributes));
  const indexed = geos.every((g) => g.index);
  return mergeGeometries(geos.map((g) => {
    const x = indexed || !g.index ? g : g.toNonIndexed();
    for (const n of Object.keys(x.attributes)) if (!names.includes(n)) x.deleteAttribute(n);
    return x;
  }));
}

function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    return;
  }
  for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    const a = attr.array, s = attr.itemSize;
    for (let i = 0; i < attr.count; i += 3) for (let k = 0; k < s; k++) { const t = a[(i + 1) * s + k]; a[(i + 1) * s + k] = a[(i + 2) * s + k]; a[(i + 2) * s + k] = t; }
  }
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Copies of one part drawn in a single call. Copy i follows anchors[i], a plain Object3D under root that the
 * machine keeps animating (moving, turning, hiding) exactly as it animated the part itself; sync() copies the
 * anchors' transforms, `local` places the part relative to its anchor, and a hidden anchor hides its copy.
 */
export class Copies extends THREE.InstancedMesh {
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, readonly anchors: THREE.Object3D[], private root: THREE.Object3D, private local?: THREE.Matrix4) {
    super(geometry, material, anchors.length);
  }

  /** World matrices must be current (build() calls root.updateMatrixWorld; a frame has already updated them). */
  sync() {
    _inv.copy(this.root.matrixWorld).invert();
    this.anchors.forEach((a, i) => {
      let shown = true;
      for (let o: THREE.Object3D | null = a; o && o !== this.root; o = o.parent) if (!o.visible) { shown = false; break; }
      if (!shown) return this.setMatrixAt(i, HIDDEN);
      _m.multiplyMatrices(_inv, a.matrixWorld);
      if (this.local) _m.multiply(this.local);
      this.setMatrixAt(i, _m);
    });
    this.instanceMatrix.needsUpdate = true;
    if (!this.boundingSphere) {
      // measured once, every copy at rest; with room to swing (an open door, a shake) so a copy is never culled early
      this.computeBoundingSphere();
      this.boundingSphere!.radius += 0.5;
    }
  }
}

// ---------- materials ----------
export const M = {
  std(color: THREE.ColorRepresentation, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  },
  phys(color: THREE.ColorRepresentation, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
    return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, ...o });
  },
  metal(color: THREE.ColorRepresentation, roughness = 0.32) {
    return new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.25 });
  },
  marble(base?: string, vein?: string, seed = 0) {
    return new THREE.MeshPhysicalMaterial({ map: marbleTex(base, vein, seed), roughness: 0.28, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  },
  glass(tint = '#ffffff', opacity = 0.16) {
    return new THREE.MeshPhysicalMaterial({ color: tint, transparent: true, opacity, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  },
  basic(color: THREE.ColorRepresentation, o: Partial<THREE.MeshBasicMaterialParameters> = {}) {
    return new THREE.MeshBasicMaterial({ color, ...o });
  },
};

export const roundBox = (w: number, h: number, d: number, r = 0.06, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, r);

/** Lathe from a list of [radius, y] points (profile drawn bottom to top). */
export function lathe(points: [number, number][], seg = 48) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

export function contactShadow(w: number, d: number, opacity = 0.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: radialTex(`rgba(0,0,0,${opacity})`), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = -1;
  return m;
}

export function glow(color: string, size = 1, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex(color, 'rgba(0,0,0,0)'), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

// ---------- the gacha capsule (shared by every machine) ----------
const CAP_TOP = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const CAP_BOT = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const CAP_BAND = new THREE.TorusGeometry(1, 0.045, 8, 48);

export function finishMaterial(finish: Finish, accent: string) {
  if (finish === 'gold') return new THREE.MeshPhysicalMaterial({ color: '#E7B54A', metalness: 1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6, emissive: '#5A3A00', emissiveIntensity: 0.25 });
  if (finish === 'foil') return new THREE.MeshPhysicalMaterial({ color: '#E8E4F2', metalness: 0.6, roughness: 0.15, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [120, 820], clearcoat: 1, envMapIntensity: 1.5 });
  return new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
}

export const FINISHES: readonly Finish[] = ['paper', 'foil', 'gold'];

/** The halo a rare card's capsule wears in the tray. */
export const halo = (finish: Finish, size: number, strength = 0.9) => glow(finish === 'gold' ? `rgba(255,200,80,${strength})` : `rgba(200,170,255,${strength})`, size);

/** For Machine.warm(): a capsule of every finish and a halo, made as a pull makes them (same materials, same geometry). */
export const capsuleWarm = (radius: number, accent: string) => [...FINISHES.map((f) => capsule(radius, finishMaterial(f, accent))), halo('foil', 1)];

export function capsule(radius: number, top: THREE.Material, bottom?: THREE.Material) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(CAP_TOP, top);
  const b = new THREE.Mesh(CAP_BOT, bottom || new THREE.MeshPhysicalMaterial({ color: '#F7F3EA', roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92 }));
  const band = new THREE.Mesh(CAP_BAND, new THREE.MeshStandardMaterial({ color: '#2A2522', roughness: 0.5 }));
  band.rotation.x = Math.PI / 2;
  g.add(t, b, band);
  g.scale.setScalar(radius);
  g.userData.top = t;
  g.userData.bottom = b;
  return g;
}

/** capsule()'s three parts as Copies: each anchor stands where a capsule group would (scale = radius). */
export function capsuleCopies(root: THREE.Object3D, anchors: THREE.Object3D[], top: THREE.Material) {
  return [
    new Copies(CAP_TOP, top, anchors, root),
    new Copies(CAP_BOT, new THREE.MeshPhysicalMaterial({ color: '#F7F3EA', roughness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92 }), anchors, root),
    new Copies(CAP_BAND, new THREE.MeshStandardMaterial({ color: '#2A2522', roughness: 0.5 }), anchors, root, new THREE.Matrix4().makeRotationX(Math.PI / 2)),
  ];
}

// ---------- easing ----------
export const ease = {
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outBounce: (t: number) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Promise-based tween driven by the stage clock (so it pauses with the tab). */
export function tween(onTick: (fn: (dt: number) => void) => () => void, dur: number, fn: (k: number) => void, e: (t: number) => number = ease.inOutCubic) {
  return new Promise<void>((resolve) => {
    let t = 0;
    const off = onTick((dt) => {
      t = Math.min(dur, t + dt);
      fn(e(t / dur));
      if (t >= dur) { off(); resolve(); }
    });
  });
}
