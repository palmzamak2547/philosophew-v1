// The daily lamp. A clay oil lamp (the kind Diogenes carried) in a stone niche, with words carved and
// gilded around it: ΓΝΩΘΙ ΣΑΥΤΟΝ above, ปญฺญา โลกสฺมิ ปชฺโชโต ("wisdom is the light of the world") below.
// Hold to breathe in: the wick catches, the flame grows, two sparks climb the gold line round the arch.
// Let go: the camera walks into the flame and its light floods out into the page.
// Units are centimetres: three clamps light falloff under 0.1 unit, so metres would flatten the light.
import * as THREE from 'three';
import type { Stage } from './stage';
import { clamp, lerp, damp, ease } from './kit';
import { fillAt } from '../core/canvastext';

export interface Rect { left: number; top: number; right: number; bottom: number }

const HW = 10, NS = 14, ND = 14; // niche: half width, straight side height, depth
const TOP = NS + HW; // apex of the arch
const BOX = { x0: -11.9, x1: 11.9, y0: -4.2, y1: 28.8 }; // what the camera must keep in the free rectangle (y0 allows for the sill's near edge, which perspective drops below the wall plane)
const CAM = new THREE.Vector3(0, 30, 75);
const EXPOSURE = 1.1;
const BACK_TINT = '#c9c4bd'; // the back of the niche sits a little deeper in shadow
const WICK = new THREE.Vector3(6.8, 3.22, 0); // wick tip in lamp space
const LAMP_SCALE = 1.2, LAMP_TURN = 0.6; // nozzle turned 0.6 rad from the viewer toward the right
const LAMP = {
  ry: LAMP_TURN - Math.PI / 2,
  x: -Math.sin(LAMP_TURN) * WICK.x * LAMP_SCALE, // flame on the centre line
  z: 0.5 - Math.cos(LAMP_TURN) * WICK.x * LAMP_SCALE, // and just in front of the wall plane
};

// ---------------- tileable noise (period p in cells) ----------------
function phash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pnoise(x: number, y: number, p: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (i: number) => ((i % p) + p) % p;
  const a = phash(w(xi), w(yi)), b = phash(w(xi + 1), w(yi)), c = phash(w(xi), w(yi + 1)), d = phash(w(xi + 1), w(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x: number, y: number, p: number, oct: number) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * pnoise(x * f, y * f, p * f); f *= 2; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}

function tileTex(size: number, paint: (x: number, y: number, s: number) => [number, number, number]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = paint(x, y, size);
    const i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// limestone: warm grey, soft mottling, a little grit
const stoneTex = () => tileTex(256, (x, y, s) => {
  const P = 6, nx = (x / s) * P, ny = (y / s) * P;
  const n = pfbm(nx, ny, P, 5), m = pfbm(nx * 0.5 + 7.3, ny * 0.5 + 2.1, P / 2, 3);
  let l = 0.76 + 0.3 * n + 0.26 * (m - 0.5);
  const h = phash(x + 7919, y + 104729);
  if (h > 0.994) l *= 0.88; else if (h < 0.003) l *= 1.08;
  const warm = (m - 0.5) * 14;
  return [clamp(150 * l + warm, 0, 255), clamp(135 * l, 0, 255), clamp(114 * l - warm, 0, 255)];
});

// terracotta with a red slip, speckled
const clayTex = () => tileTex(256, (x, y, s) => {
  const P = 8, nx = (x / s) * P, ny = (y / s) * P;
  const n = pfbm(nx, ny, P, 4);
  const h = phash(x + 7919, y + 104729);
  let l = 0.84 + 0.26 * n;
  if (h > 0.972) l *= 0.8; else if (h < 0.012) l *= 1.12;
  return [clamp(168 * l, 0, 255), clamp(96 * l, 0, 255), clamp(64 * l, 0, 255)];
});

/** Soft round light for glows and sparks (white, tinted by the material colour). */
function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft vertical smoke stain: dense low, fading up and out. */
function plumeTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = (x - 31.5) / 32, v = 1 - y / 127; // v: 0 bottom, 1 top
    const w = 0.35 + 0.65 * v; // the plume widens as it rises
    const a = Math.exp(-(u * u) / (w * w * 0.32)) * Math.pow(v, 0.6) * (1 - Math.pow(v, 6)) * (0.8 + 0.2 * pfbm(x / 16, y / 16, 4, 3));
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = clamp(a * 255, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

const white = (g: THREE.BufferGeometry, f?: (x: number, y: number, z: number) => number) => {
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = f ? f(p.getX(i), p.getY(i), p.getZ(i)) : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

// ---------------- the lamp (built in lamp space: nozzle toward +x, base on y = 0) ----------------
function lampBody() {
  // profile [radius, y], bottom centre to the filling hole
  const P: [number, number][] = [
    [0, 0.05], [1.7, 0.05], [1.9, 0], [2.2, 0], [2.36, 0.25], [3.0, 0.62], [3.45, 1.2], [3.6, 1.75],
    [3.56, 2.06], [3.36, 2.36], [3.0, 2.56], [2.82, 2.62], [2.66, 2.69], [2.5, 2.63], [2.4, 2.5],
    [2.26, 2.55], [2.06, 2.49], [1.5, 2.36], [0.8, 2.28], [0.56, 2.28], [0.48, 2.2], [0.45, 2.0], [0.45, 1.3],
  ];
  return new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), 72);
}

/** The spout: a lofted superellipse tube, rounded at the tip, soot around the wick. */
/** Half width, half height and centre height of the spout at s (0 at the body, 1 at the tip). */
const spout = (s: number) => ({ a: lerp(1.46, 1.14, s), b: lerp(0.96, 0.8, s), yc: lerp(1.8, 1.78, s) });
const SPOUT_X0 = 2.0, SPOUT_X1 = 7.9;
const topAtWick = (() => { const q = spout((WICK.x - SPOUT_X0) / (SPOUT_X1 - SPOUT_X0)); return q.yc + q.b; })();

function lampNozzle() {
  const S = 30, J = 40, x0 = 2.0, x1 = 7.9, rt = 1.3;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const e = 2 / 2.3; // superellipse exponent: a little flatter than round, like pressed clay
  for (let i = 0; i <= S; i++) {
    const s = i / S, x = x0 + (x1 - x0) * s;
    let { a, b, yc } = spout(s);
    const d = x - (x1 - rt);
    if (d > 0) { const k = Math.sqrt(Math.max(0, 1 - (d / rt) ** 2)); a *= k; b *= Math.pow(k, 0.55); }
    for (let j = 0; j <= J; j++) {
      const th = (j / J) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const ey = sn > 0 ? 2 / 3.4 : e; // flat on top, rounder underneath
      pos.push(x, yc + b * Math.sign(sn) * Math.pow(Math.abs(sn), ey), a * Math.sign(c) * Math.pow(Math.abs(c), e));
      uv.push(j / J, s);
    }
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < J; j++) {
    const p = i * (J + 1) + j, q = p + J + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return white(g, (x, y, z) => {
    const d = Math.hypot(x - WICK.x, (y - topAtWick) * 1.6, z);
    return 1 - 0.78 * Math.exp(-(d * d) / 1.1) * (y > 2 ? 1 : 0.45);
  });
}

function buildLamp(clay: THREE.Texture) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ map: clay, bumpMap: clay, bumpScale: 0.03, roughness: 0.62, metalness: 0, vertexColors: true, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffc9a0') });
  const body = new THREE.Mesh(white(lampBody(), (_x, y) => 0.86 + 0.14 * clamp(y / 1.2)), mat);
  const nozzle = new THREE.Mesh(lampNozzle(), mat);
  const handle = new THREE.Mesh(white(new THREE.TorusGeometry(0.95, 0.36, 16, 36)), mat);
  handle.position.set(-3.85, 2.62, 0);
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), new THREE.MeshStandardMaterial({ color: '#140a04', roughness: 0.12 }));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = 1.75;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color: '#0d0704' }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(WICK.x, topAtWick + 0.012, 0);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.75, 10), new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.95 }));
  wick.position.set(WICK.x - 0.06, topAtWick + 0.3, 0);
  wick.rotation.z = -0.28;
  for (const m of [body, nozzle, handle, wick]) m.userData.caster = true;
  g.add(body, nozzle, handle, oil, hole, wick);
  return g;
}

// ---------------- the stone: niche, wall, sill ----------------
function archShape(hw: number) {
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(-hw, NS);
  s.absarc(0, NS, hw, Math.PI, 0, true);
  s.lineTo(hw, 0);
  s.lineTo(-hw, 0);
  return s;
}

/** Arc-length parametrised path round the arch, bottom left to bottom right. */
class ArchCurve extends THREE.Curve<THREE.Vector3> {
  r: number; y0: number; z: number;
  constructor(r: number, y0: number, z: number) { super(); this.r = r; this.y0 = y0; this.z = z; }
  getPoint(t: number, out = new THREE.Vector3()) {
    const side = NS - this.y0, arc = Math.PI * this.r, L = side * 2 + arc;
    const s = t * L;
    if (s <= side) return out.set(-this.r, this.y0 + s, this.z);
    if (s <= side + arc) { const a = Math.PI - ((s - side) / arc) * Math.PI; return out.set(Math.cos(a) * this.r, NS + Math.sin(a) * this.r, this.z); }
    return out.set(this.r, NS - (s - side - arc), this.z);
  }
}

// ---------------- carved words ----------------
// A small monoline capital alphabet for the lapidary lines (unit box, y down). Greek and Latin inscriptions
// were cut as even strokes on a grid, so drawing them beats borrowing a book face.
const GLYPH: Record<string, [number, string]> = {
  A: [0.78, 'M0 1L0.39 0L0.78 1M0.15 0.63H0.63'],
  D: [0.7, 'M0 0V1H0.26C0.93 1 0.93 0 0.26 0Z'],
  E: [0.58, 'M0.58 0H0V1H0.58M0 0.5H0.48'],
  F: [0.56, 'M0.56 0H0V1M0 0.5H0.46'],
  I: [0, 'M0 0V1'],
  M: [0.86, 'M0 1V0L0.43 0.72L0.86 0V1'],
  N: [0.7, 'M0 1V0L0.7 1V0'],
  O: [0.84, 'M0.42 0C0.19 0 0 0.22 0 0.5C0 0.78 0.19 1 0.42 1C0.65 1 0.84 0.78 0.84 0.5C0.84 0.22 0.65 0 0.42 0Z'],
  P: [0.62, 'M0 1V0H0.32C0.74 0 0.74 0.52 0.32 0.52H0'],
  R: [0.66, 'M0 1V0H0.32C0.74 0 0.74 0.52 0.32 0.52H0M0.3 0.52L0.66 1'],
  S: [0.6, 'M0.57 0.13C0.48 0.03 0.38 0 0.29 0C0.13 0 0.03 0.1 0.03 0.25C0.03 0.56 0.58 0.43 0.58 0.74C0.58 0.9 0.45 1 0.28 1C0.18 1 0.07 0.96 0 0.87'],
  T: [0.7, 'M0 0H0.7M0.35 0V1'],
  U: [0.68, 'M0 0V0.64C0 0.87 0.15 1 0.34 1C0.53 1 0.68 0.87 0.68 0.64V0'],
  Γ: [0.56, 'M0 1V0H0.56'],
  Θ: [0.84, 'M0.42 0C0.19 0 0 0.22 0 0.5C0 0.78 0.19 1 0.42 1C0.65 1 0.84 0.78 0.84 0.5C0.84 0.22 0.65 0 0.42 0ZM0.24 0.5H0.6'],
  Σ: [0.62, 'M0.62 0H0L0.36 0.5L0 1H0.62'],
  Υ: [0.72, 'M0 0L0.36 0.5L0.72 0M0.36 0.5V1'],
  Ω: [0.88, 'M0.04 1H0.3C0.12 0.86 0.05 0.67 0.05 0.48C0.05 0.2 0.23 0 0.44 0C0.65 0 0.83 0.2 0.83 0.48C0.83 0.67 0.76 0.86 0.58 1H0.84'],
};
GLYPH['Α'] = GLYPH.A; GLYPH['Ε'] = GLYPH.E; GLYPH['Ι'] = GLYPH.I; GLYPH['Ν'] = GLYPH.N; GLYPH['Ο'] = GLYPH.O; GLYPH['Τ'] = GLYPH.T;
const PITCH = 0.98; // stoichedon: every letter gets the same square cell

export interface Carving { kind: 'caps' | 'thai' | 'cjk'; text: string; h: number; x: number; y: number; z?: number; tint?: string; gild: number; tilt?: number }

const THAI_FONT = '"Noto Serif Thai", "Trirong", serif';
const CJK_FONT = '"Noto Serif TC", "Noto Serif SC", "Songti TC", "STSong", "SimSun", "MS Mincho", serif';

function cutCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Height map for one inscription: white stone, letters cut in as soft V grooves. */
function carveTexture(spec: Carving, ppc: number) {
  const pad = 0.7;
  let wCm: number, hCm: number, fontPx = 0;
  const probe = cutCanvas(8, 8)[1];
  if (spec.kind === 'caps') {
    wCm = [...spec.text].length * spec.h * PITCH;
    hCm = spec.h;
  } else {
    fontPx = spec.h * ppc;
    probe.font = `600 ${fontPx}px ${spec.kind === 'thai' ? THAI_FONT : CJK_FONT}`;
    wCm = probe.measureText(spec.text).width / ppc;
    hCm = spec.h * (spec.kind === 'thai' ? 1.75 : 1.2);
  }
  const W = Math.ceil((wCm + pad * 2) * ppc), H = Math.ceil((hCm + pad * 2) * ppc);
  const [sharp, s] = cutCanvas(W, H);
  s.fillStyle = s.strokeStyle = '#000';
  let blur: number;
  if (spec.kind === 'caps') {
    const u = spec.h * ppc;
    blur = u * 0.05;
    s.lineCap = s.lineJoin = 'round';
    [...spec.text].forEach((ch, i) => {
      const gl = GLYPH[ch];
      if (!gl) return;
      const cx = pad * ppc + (i + 0.5) * u * PITCH;
      s.setTransform(u, 0, 0, u, cx - (gl[0] * u) / 2, pad * ppc);
      s.lineWidth = 0.1;
      s.stroke(new Path2D(gl[1]));
    });
    s.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    blur = fontPx * 0.028;
    s.font = `600 ${fontPx}px ${spec.kind === 'thai' ? THAI_FONT : CJK_FONT}`;
    s.textAlign = 'center';
    s.textBaseline = 'middle';
    fillAt(s, spec.text, W / 2, H / 2 + (spec.kind === 'thai' ? fontPx * 0.06 : 0));
  }
  // blur through a shadow: works in every browser, unlike ctx.filter
  const [cv, c] = cutCanvas(W, H);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);
  const off = W + 20;
  c.shadowColor = '#000';
  c.shadowOffsetX = off;
  c.shadowBlur = blur * 2.2;
  c.globalAlpha = 0.75;
  c.drawImage(sharp, -off, 0);
  c.shadowBlur = blur * 0.8;
  c.globalAlpha = 0.6;
  c.drawImage(sharp, -off, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.channel = 1;
  tex.anisotropy = 4;
  return { tex, w: W / ppc, h: H / ppc };
}

// ---------------- shaders ----------------
const NOISE = /* glsl */ `
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h1(i), h1(i + vec2(1., 0.)), u.x), mix(h1(i + vec2(0., 1.)), h1(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.03; a *= .5; } return s; }`;

const VS_UV = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const FLAME_FS = /* glsl */ `
uniform float uTime, uPower, uCalm, uWind;
varying vec2 vUv;
${NOISE}
void main(){
  float y = vUv.y, x = (vUv.x - .5) * 2.;
  float t = uTime;
  float turb = fbm(vec2(x * 1.6, y * 3.2 - t * 2.7));
  float sway = (n2(vec2(t * 1.3, 7.)) - .5) * mix(.55, .18, uCalm);
  x -= (uWind + sway) * y * y * 1.5 + (turb - .5) * mix(.7, .3, uCalm) * y;
  float yy = clamp(y / .94, 0., 1.);
  float w = pow(yy, .42) * pow(1. - yy, .8) * 1.95 + .2 * smoothstep(.22, 0., y);
  float d = abs(x) / max(w, 1e-3);
  float tip = .78 + .22 * turb;
  float shape = smoothstep(1., .5, d) * smoothstep(tip, tip - .38, y) * smoothstep(0., .07, y);
  float core = smoothstep(.72, 0., d) * smoothstep(.05, .22, y) * smoothstep(.66, .24, y);
  float dark = smoothstep(.4, 0., d) * smoothstep(.02, .09, y) * smoothstep(.2, .1, y); // the cooler zone over the wick
  float blue = smoothstep(.3, .02, y) * smoothstep(1., .25, d) * (1. - core);
  vec3 col = mix(vec3(1., .36, .07), vec3(1., .74, .33), smoothstep(.9, .28, y)) * shape;
  col = mix(col, vec3(1., .96, .84) * 1.5, core * shape * (1. - dark * .6));
  col += vec3(.18, .32, 1.) * blue * .9;
  float a = clamp(shape + blue * .5, 0., 1.) * clamp(uPower * 2.5, 0., 1.);
  gl_FragColor = vec4(col * (.7 + .5 * uPower), a);
}`;

const SMOKE_FS = /* glsl */ `
uniform float uTime, uAlpha;
varying vec2 vUv;
${NOISE}
void main(){
  float y = vUv.y, t = uTime;
  float cx = .5 + (n2(vec2(y * 2.6 - t * .5, 3.)) - .5) * .9 * y + sin(y * 8. - t * 1.6) * .07 * y;
  float wd = mix(.03, .16, y);
  float d = abs(vUv.x - cx) / wd;
  float a = exp(-d * d * 2.) * smoothstep(0., .06, y) * smoothstep(1., .35, y);
  a *= .75 + .25 * n2(vec2(vUv.x * 18., y * 9. - t * 2.));
  gl_FragColor = vec4(vec3(.62, .58, .56), a * uAlpha * .5);
}`;

const TRAIL_FS = /* glsl */ `
uniform float uP, uFull, uTime;
varying vec2 vUv;
void main(){
  float u = vUv.x, h = uP * .5;
  float fill = max(smoothstep(h, h - .008, u), smoothstep(1. - h, 1. - h + .008, u));
  float front = exp(-pow((u - h) / .012, 2.)) + exp(-pow((u - (1. - h)) / .012, 2.));
  float shimmer = .85 + .15 * sin(u * 90. - uTime * 4.);
  vec3 gold = vec3(1., .78, .4);
  float k = fill * (.55 + .45 * uFull) * shimmer + front * step(.001, uP) * (1. - uFull) * 1.4;
  gl_FragColor = vec4(gold * k, clamp(k, 0., 1.));
}`;

const POINTS_VS = /* glsl */ `
attribute float aSize; attribute float aGlow; attribute vec3 aTint;
uniform float uScale;
varying float vGlow; varying vec3 vTint;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, aSize * uScale / -mv.z);
  vGlow = aGlow; vTint = aTint;
}`;
const POINTS_FS = /* glsl */ `
varying float vGlow; varying vec3 vTint;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, 0., d); a *= a;
  if (a * vGlow < .004) discard;
  gl_FragColor = vec4(vTint * vGlow, a);
}`;

const FLOOD_FS = /* glsl */ `
uniform vec2 uC; uniform float uR, uOn; uniform vec3 uPaper;
void main(){
  float d = distance(gl_FragCoord.xy, uC);
  float soft = max(uR * .42, 2.);
  float inside = 1. - smoothstep(uR - soft, uR, d);
  float rim = exp(-pow((d - uR) / (soft * .8), 2.));
  vec3 col = mix(vec3(1., .84, .58), uPaper, inside);
  gl_FragColor = vec4(col, clamp(inside + rim * .85, 0., 1.) * uOn);
}`;

// ---------------- the scene ----------------
interface Mote { p: THREE.Vector3; v: THREE.Vector3; size: number; tw: number }
interface Spark { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number }

export class Lamp {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  private stage: Stage;
  private reduced: boolean;
  private off: (() => void)[] = [];
  private disposables: { dispose(): void }[] = [];

  private stone!: THREE.Texture;
  private wall: THREE.Mesh | null = null;
  private wallMat!: THREE.MeshStandardMaterial;
  private sideCarvings: THREE.Object3D[] = [];
  private light!: THREE.PointLight;
  private bounce!: THREE.AmbientLight;
  private flame!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private smoke!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private ember!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private halo!: THREE.Sprite;
  private core!: THREE.Sprite;
  private keystone!: THREE.Sprite;
  private runners: THREE.Sprite[] = [];
  private trail!: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
  private path = new ArchCurve(HW + 1.05, 0.35, 0.05);
  private points!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private motes: Mote[] = [];
  private sparks: Spark[] = [];
  private flood!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly wick = new THREE.Vector3();

  // state the ritual drives
  private hold = 0;
  private lit = false;
  private isFull = false;
  private fullFlash = 0;
  private power = 0;
  private flare = 0;
  private wind = 0;
  private windTarget = 0;
  private look = new THREE.Vector2();
  private lookTarget = new THREE.Vector2();
  private out = -1; // exhale progress, -1 before
  private outResolve: (() => void) | null = null;
  private carved = false;
  private shadows: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];

  // framing
  private k = 10; // px per cm on the wall plane
  private focal = 750;
  private anchor = new THREE.Vector3();
  private target = new THREE.Vector2();
  private anchor0 = new THREE.Vector3();
  private target0 = new THREE.Vector2();
  private outFrom = { cam: new THREE.Vector3(), target: new THREE.Vector2() };
  private time = 0;

  constructor(stage: Stage, reduced: boolean) {
    this.stage = stage;
    this.reduced = reduced;
    this.build();
    this.off.push(stage.onTick((dt) => this.tick(dt)));
  }

  private keep<T extends { dispose(): void }>(x: T) { this.disposables.push(x); return x; }

  private build() {
    const S = this.scene;
    S.background = new THREE.Color('#090706');
    this.stone = this.keep(stoneTex());
    this.stone.repeat.set(1 / 26, 1 / 26);
    const clay = this.keep(clayTex());
    const glow = this.keep(glowTex());

    // lamp
    const lamp = buildLamp(clay);
    lamp.position.set(LAMP.x, 0, LAMP.z);
    lamp.rotation.y = LAMP.ry;
    lamp.scale.setScalar(LAMP_SCALE);
    S.add(lamp);
    lamp.updateMatrixWorld(true);
    this.wick.copy(WICK).applyMatrix4(lamp.matrixWorld);
    const fx = this.wick.x, fz = this.wick.z;
    this.bakeShadows(lamp, this.wick.clone().add(new THREE.Vector3(0, 1.6, 0)));

    // niche: extruded arch, seen from inside
    const arch = archShape(HW);
    const niche = new THREE.ExtrudeGeometry(arch, { depth: ND, bevelEnabled: false, curveSegments: 48, steps: 6 });
    niche.translate(0, 0, -ND);
    white(niche, (x, y, z) => {
      const soot = Math.exp(-((x - fx) ** 2 + (y - TOP) ** 2 * 0.8 + (z - fz) ** 2) / 34) * 0.72;
      return (1 - soot) * (1 - 0.2 * clamp(-z / ND));
    });
    const stoneV = new THREE.MeshStandardMaterial({ map: this.stone, roughness: 0.94, vertexColors: true });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const nicheMesh = new THREE.Mesh(niche, [hidden, stoneV]);
    stoneV.side = THREE.BackSide;
    const back = new THREE.PlaneGeometry(HW * 2, TOP, 1, 1);
    back.translate(0, TOP / 2, -ND);
    this.worldUV(back);
    const backMesh = new THREE.Mesh(back, new THREE.MeshStandardMaterial({ map: this.stone, color: BACK_TINT, roughness: 0.94 }));
    // centuries of lamp smoke: a plume up the back wall and a smudge under the arch
    const plume = new THREE.Mesh(new THREE.PlaneGeometry(12, 20), new THREE.MeshBasicMaterial({ map: this.keep(plumeTex()), color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }));
    plume.position.set(fx, 13.5, -ND + 0.03);
    const sill = new THREE.Mesh(this.worldUV(new THREE.BoxGeometry(23, 1.25, 3.6, 1, 1, 1)), new THREE.MeshStandardMaterial({ map: this.stone, roughness: 0.9 }));
    sill.position.set(0, -0.67, 1.8);
    S.add(nicheMesh, backMesh, sill, plume);
    this.wallMat = new THREE.MeshStandardMaterial({ map: this.stone, roughness: 0.94 });

    // soot that escaped the niche and stained the wall over the arch
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(15, 11), new THREE.MeshBasicMaterial({ map: glow, color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }));
    stain.position.set(fx * 0.6, TOP + 0.8, 0.03);
    S.add(stain);

    // the gold line round the arch: a dark bronze groove, and the light that climbs it
    const groove = new THREE.Mesh(new THREE.TubeGeometry(this.path, 180, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#5a4125', metalness: 0.7, roughness: 0.4 }));
    this.trail = new THREE.Mesh(new THREE.TubeGeometry(this.path, 180, 0.17, 6), new THREE.ShaderMaterial({
      uniforms: { uP: { value: 0 }, uFull: { value: 0 }, uTime: { value: 0 } },
      vertexShader: VS_UV, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    S.add(groove, this.trail);
    const spriteMat = (color: string, opacity: number) => new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Sprite(spriteMat('#ffd48a', 0));
      r.scale.setScalar(1.6);
      this.runners.push(r);
      S.add(r);
    }
    this.keystone = new THREE.Sprite(spriteMat('#ffe2a8', 0));
    this.keystone.position.set(0, TOP + 1.05, 0.2);
    S.add(this.keystone);

    // light
    this.light = new THREE.PointLight('#ff9a48', 0, 0, 2);
    this.bounce = new THREE.AmbientLight('#ff9d5c', 0);
    const moon = new THREE.DirectionalLight('#a9bde6', 0.55);
    moon.position.set(-35, 90, 26);
    S.add(this.light, this.bounce, moon, new THREE.HemisphereLight('#3b4c6e', '#0b0908', 0.36));

    // flame, ember, smoke, glows
    const quad = () => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g; };
    this.flame = new THREE.Mesh(quad(), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uCalm: { value: 0 }, uWind: { value: 0 } },
      vertexShader: VS_UV, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.flame.position.copy(this.wick);
    this.flame.renderOrder = 5;
    this.smoke = new THREE.Mesh(quad(), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: VS_UV, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false,
    }));
    this.smoke.position.copy(this.wick).add(new THREE.Vector3(0, 0.15, 0));
    this.smoke.scale.set(2.2, 11, 1);
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshBasicMaterial({ color: '#ff5a1a' }));
    this.ember.position.copy(this.wick);
    this.halo = new THREE.Sprite(spriteMat('#ffab5e', 0));
    this.core = new THREE.Sprite(spriteMat('#fff0cc', 0));
    this.halo.renderOrder = this.core.renderOrder = 6;
    S.add(this.flame, this.smoke, this.ember, this.halo, this.core);

    // dust in the air, sparks from the wick
    const nMotes = this.reduced ? 26 : this.stage.lowPower ? 44 : 84, nSparks = 40, N = nMotes + nSparks;
    for (let i = 0; i < nMotes; i++) {
      this.motes.push({
        p: new THREE.Vector3(lerp(-15, 15, Math.random()), lerp(-3, 30, Math.random()), lerp(-11, 22, Math.random())),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.25, (Math.random() - 0.5) * 0.3),
        size: lerp(0.06, 0.2, Math.random() ** 2), tw: Math.random() * 10,
      });
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1));
    pg.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(N), 1));
    pg.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.points = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 100 } }, vertexShader: POINTS_VS, fragmentShader: POINTS_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    S.add(this.points);

    // the flood of light, drawn straight in screen space over everything
    const fq = new THREE.PlaneGeometry(2, 2);
    this.flood = new THREE.Mesh(fq, new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Vector2() }, uR: { value: 0 }, uOn: { value: 0 }, uPaper: { value: new THREE.Vector3(1, 1, 1) } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: FLOOD_FS,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.flood.frustumCulled = false;
    this.flood.renderOrder = 99;
    this.flood.visible = false;
    S.add(this.flood);

    this.camera.position.copy(CAM);
  }

  /** Know thyself over the arch, the Pali line under the sill. Cut once the scale is known. */
  private carveFixed() {
    if (this.carved) return;
    this.carved = true;
    this.addCarving({ kind: 'caps', text: 'ΓΝΩΘΙ ΣΑΥΤΟΝ', h: 1.75, x: 0, y: TOP + 3.25, gild: 0.85 });
    // the Pali line sits on the back wall above the flame, where its light reads it
    const pali = () => { if (this.disposables.length) this.addCarving({ kind: 'thai', text: 'ปญฺญา โลกสฺมิ ปชฺโชโต', h: 1.2, x: 0, y: 16.4, z: -ND, tint: BACK_TINT, gild: 0.8 }); };
    const fonts = document.fonts;
    if (!fonts) return pali();
    Promise.race([fonts.load(`600 40px ${THAI_FONT}`, 'ปญฺญา'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {}).then(pali);
  }

  /**
   * The lamp's shadow, baked once: its triangles are projected from the flame onto the floor and the three
   * walls of the niche, softened, and laid on as decals whose darkness follows the flame. The lamp never
   * moves and the flame only trembles by a fraction of a millimetre, so a live shadow map would cost six
   * extra renders a frame for nothing (and three r186 cube shadows draw seams where their faces meet).
   */
  private bakeShadows(lamp: THREE.Object3D, L: THREE.Vector3) {
    const tris: number[] = [];
    const v = new THREE.Vector3();
    lamp.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.userData.caster) return;
      const pos = m.geometry.attributes.position, idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
        tris.push(v.x, v.y, v.z);
      }
    });
    const planes: { O: THREE.Vector3; U: THREE.Vector3; V: THREE.Vector3; su: number; sv: number; axis: 'x' | 'y' | 'z'; at: number; fade: number }[] = [
      { O: new THREE.Vector3(-HW, 0.03, 0), U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 0, -1), su: HW * 2, sv: ND, axis: 'y', at: 0, fade: 0.72 },
      { O: new THREE.Vector3(-HW, 0, -ND + 0.03), U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 1, 0), su: HW * 2, sv: TOP, axis: 'z', at: -ND, fade: 0.5 },
      { O: new THREE.Vector3(-HW + 0.03, 0, -ND), U: new THREE.Vector3(0, 0, 1), V: new THREE.Vector3(0, 1, 0), su: ND, sv: TOP, axis: 'x', at: -HW, fade: 0.5 },
      { O: new THREE.Vector3(HW - 0.03, 0, 0), U: new THREE.Vector3(0, 0, -1), V: new THREE.Vector3(0, 1, 0), su: ND, sv: TOP, axis: 'x', at: HW, fade: 0.5 },
    ];
    const PPC = 22, BLUR = 0.32; // pixels per cm in the bake; penumbra in cm
    const P = new THREE.Vector3(), Q = new THREE.Vector3();
    for (const pl of planes) {
      const W = Math.ceil(pl.su * PPC), H = Math.ceil(pl.sv * PPC);
      const [sharp, sc] = cutCanvas(W, H);
      sc.fillStyle = '#000';
      // The triangles go in as one SVG path string, parsed once: the same outline as moveTo and lineTo per
      // triangle, which cost about 25 times more (thousands of calls per wall, 2 s on a mid-range phone).
      let path = '';
      const la = L[pl.axis] - pl.at;
      for (let i = 0; i < tris.length; i += 9) {
        const pts: [number, number][] = [];
        for (let k = 0; k < 3; k++) {
          P.set(tris[i + k * 3], tris[i + k * 3 + 1], tris[i + k * 3 + 2]);
          const d = L[pl.axis] - P[pl.axis];
          if (Math.sign(d) !== Math.sign(la) || Math.abs(d) < 1e-3) break; // this vertex is not between the flame and the plane
          Q.copy(P).sub(L).multiplyScalar(la / d).add(L).sub(pl.O);
          pts.push([Q.dot(pl.U) * PPC, (pl.sv - Q.dot(pl.V)) * PPC]);
        }
        if (pts.length < 3) continue;
        // a closed mesh projects front and back faces with opposite windings, which cancel under the
        // nonzero rule; wind every triangle the same way so the fill is their union
        const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
        const [p0, p1, p2] = area < 0 ? [pts[0], pts[2], pts[1]] : pts;
        path += `M${p0[0]} ${p0[1]}L${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}Z`;
      }
      if (!path) continue;
      sc.fill(new Path2D(path), 'nonzero');
      const [cv, c] = cutCanvas(W, H);
      const off = W + 40;
      c.shadowColor = '#000';
      c.shadowOffsetX = off;
      c.shadowBlur = BLUR * PPC * 2;
      c.drawImage(sharp, -off, 0);
      const tex = this.keep(new THREE.CanvasTexture(cv));
      const g = new THREE.BufferGeometry();
      const a = pl.O, b = pl.O.clone().addScaledVector(pl.U, pl.su), cc = b.clone().addScaledVector(pl.V, pl.sv), d = pl.O.clone().addScaledVector(pl.V, pl.sv);
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...cc.toArray(), ...d.toArray()], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: '#000000', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      m.userData.fade = pl.fade;
      if (import.meta.env.DEV) m.userData.debug = { sharp, L: L.toArray(), tris: tris.length / 9 };
      m.renderOrder = 1;
      this.shadows.push(m);
      this.scene.add(m);
    }
    // where the clay meets the stone: a soft contact shadow that holds the lamp down even before it is lit
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 8.5), new THREE.MeshBasicMaterial({ map: this.keep(glowTex()), color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    contact.rotation.x = -Math.PI / 2;
    contact.rotation.z = -LAMP.ry;
    contact.position.set(LAMP.x, 0.04, LAMP.z);
    this.scene.add(contact);
  }

  /** UVs in world centimetres, so every stone surface shares one grain and no seam shows. */
  private worldUV<G extends THREE.BufferGeometry>(g: G, mesh?: { x: number; y: number; z?: number }) {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) + (mesh?.x || 0); uv[i * 2 + 1] = p.getY(i) + (mesh?.y || 0) + (p.getZ(i) + (mesh?.z || 0)) * 0.7; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  private addCarving(spec: Carving, bucket?: THREE.Object3D[]) {
    const ppc = clamp(this.k * Math.min(devicePixelRatio || 1, 2) * 1.3, 30, 72);
    const { tex, w, h } = carveTexture(spec, ppc);
    this.keep(tex);
    const g = new THREE.PlaneGeometry(w, h);
    g.setAttribute('uv1', g.attributes.uv.clone());
    this.worldUV(g, { x: spec.x, y: spec.y, z: spec.z || 0 });
    const m = new THREE.MeshStandardMaterial({ map: this.stone, color: spec.tint || '#ffffff', bumpMap: tex, bumpScale: 0.16, roughness: 0.94, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGild = { value: spec.gild };
      sh.fragmentShader = 'uniform float uGild;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          float carveG = 1.0 - texture2D( bumpMap, vBumpMapUv ).r;
          diffuseColor.rgb *= mix( 1.0, 0.5, carveG * ( 1.0 - uGild ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.62, 0.27 ), carveG * uGild );`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, carveG * uGild );')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.55, carveG * uGild );');
    };
    m.customProgramCacheKey = () => 'carved';
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(spec.x, spec.y, (spec.z || 0) + 0.01);
    if (spec.tilt) mesh.rotation.z = spec.tilt;
    this.scene.add(mesh);
    bucket?.push(mesh);
    return mesh;
  }

  /** Fit the niche and both inscriptions into the free rectangle the UI left, then size the wall. */
  layout(free: Rect) {
    const { w: W, h: H } = this.stage.size;
    const bw = BOX.x1 - BOX.x0, bh = BOX.y1 - BOX.y0;
    const fw = Math.max(120, free.right - free.left), fh = Math.max(120, free.bottom - free.top);
    this.k = Math.min((fw * 0.92) / bw, (fh * 0.93) / bh);
    this.focal = this.k * CAM.z;
    this.anchor0.set((BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2, 0);
    this.target0.set((free.left + free.right) / 2, (free.top + free.bottom) / 2);
    if (this.out < 0) { this.anchor.copy(this.anchor0); this.target.copy(this.target0); }

    // the wall: a slab with the arch cut out, covering the whole screen with room to spare
    const toWorld = (sx: number, sy: number) => new THREE.Vector2(this.anchor0.x + (sx - this.target0.x) / this.k, this.anchor0.y - (sy - this.target0.y) / this.k);
    const a = toWorld(-60, -60), b = toWorld(W + 60, H + 60);
    const shape = new THREE.Shape();
    shape.moveTo(a.x, b.y); shape.lineTo(b.x, b.y); shape.lineTo(b.x, a.y); shape.lineTo(a.x, a.y); shape.lineTo(a.x, b.y);
    shape.holes.push(archShape(HW));
    const g = new THREE.ShapeGeometry(shape, 48);
    if (this.wall) { this.wall.geometry.dispose(); this.wall.geometry = g; }
    else {
      this.wall = new THREE.Mesh(g, this.wallMat);
      this.scene.add(this.wall);
    }

    // wide screens get more carved words on the dark wall to either side
    for (const m of this.sideCarvings) { this.scene.remove(m); ((m as THREE.Mesh).material as THREE.Material).dispose(); (m as THREE.Mesh).geometry.dispose(); }
    this.sideCarvings = [];
    const boxL = this.target0.x + (BOX.x0 - this.anchor0.x) * this.k, boxR = this.target0.x + (BOX.x1 - this.anchor0.x) * this.k;
    const room = Math.min(boxL - 56 - 40, W - 40 - (boxR + 56));
    if (room >= 150) {
      const words: { kind: Carving['kind']; text: string; gild: number; px: number }[] = [
        { kind: 'cjk', text: '道', gild: 0, px: 74 }, { kind: 'caps', text: 'MEMENTO MORI', gild: 0, px: 17 },
        { kind: 'thai', text: 'อนิจจัง', gild: 0, px: 30 }, { kind: 'caps', text: 'AMOR FATI', gild: 0, px: 17 },
        { kind: 'cjk', text: '空', gild: 0, px: 60 }, { kind: 'caps', text: 'SAPERE AUDE', gild: 0, px: 15 },
        { kind: 'thai', text: 'สติ', gild: 0, px: 36 }, { kind: 'caps', text: 'DASEIN', gild: 0, px: 16 },
      ];
      const rows = Math.max(2, Math.min(4, Math.floor((free.bottom - free.top) / 150)));
      words.slice(0, rows * 2).forEach((wd, i) => {
        const left = i % 2 === 0, row = i >> 1;
        const cx = left ? lerp(40, boxL - 56, 0.35 + ((row * 37) % 30) / 100) : lerp(boxR + 56, W - 40, 0.65 - ((row * 23) % 30) / 100);
        const cy = lerp(free.top + 40, free.bottom - 40, rows === 1 ? 0.5 : row / (rows - 1));
        const p = toWorld(cx, cy);
        this.addCarving({ kind: wd.kind, text: wd.text, gild: 0, h: wd.px / this.k, x: p.x, y: p.y, tilt: ((i * 0.37) % 0.08) - 0.04 }, this.sideCarvings);
      });
    }
    this.carveFixed();
    this.applyCamera();
  }

  private applyCamera() {
    const { w: W, h: H } = this.stage.size, cam = this.camera;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(H / (2 * this.focal)));
    const P = this.anchor, C = cam.position, dz = Math.max(1, C.z - P.z);
    const ox = W / 2 + (this.focal * (P.x - C.x)) / dz - this.target.x;
    const oy = H / 2 - (this.focal * (P.y - C.y)) / dz - this.target.y;
    cam.aspect = W / H;
    cam.setViewOffset(W, H, ox, oy, W, H);
  }

  /** Breath progress, 0 to 1. */
  set(hold: number) { this.hold = hold; }
  ignite() {
    if (this.lit) return;
    this.lit = true;
    this.burst(10, 0.9);
  }
  full(on: boolean) {
    if (on && !this.isFull) this.fullFlash = 1;
    this.isFull = on;
  }
  /** Pointer in CSS px; horizontal speed makes the flame lean. */
  pointer(x: number, y: number, vx: number) {
    if (this.reduced) return;
    const { w: W, h: H } = this.stage.size;
    this.lookTarget.set((x / W - 0.5) * 2, (y / H - 0.5) * 2);
    this.windTarget = clamp(vx / 1800, -0.6, 0.6);
  }
  /** Where the flame sits on screen, in CSS px. */
  flameScreen() { return this.stage.project(this.wick.clone().add(new THREE.Vector3(0, 1.6, 0)), this.camera); }

  /** The page colour (CSS) the light turns into; written to the canvas as is, so it matches the DOM. */
  exhale(paper: string) {
    const c = new THREE.Color(paper).getRGB({ r: 1, g: 1, b: 1 }, THREE.SRGBColorSpace);
    this.flood.material.uniforms.uPaper.value.set(c.r, c.g, c.b);
    this.out = 0;
    this.flare = 1;
    this.burst(18, 1.4);
    this.outFrom.cam.copy(this.camera.position);
    const s = this.flameScreen();
    this.outFrom.target.set(s.x, s.y);
    return new Promise<void>((r) => { this.outResolve = r; });
  }

  private burst(n: number, speed: number) {
    for (let i = 0; i < n && this.sparks.length < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.35;
      this.sparks.push({
        p: this.wick.clone().add(new THREE.Vector3(Math.cos(a) * r, 1 + Math.random() * 1.5, Math.sin(a) * r)),
        v: new THREE.Vector3(Math.cos(a) * speed * 1.4, (2 + Math.random() * 4) * speed, Math.sin(a) * speed * 1.2),
        life: 0, max: 0.5 + Math.random() * 0.9,
      });
    }
  }

  private tick(dt: number) {
    this.time += dt;
    const t = this.time, R = this.reduced;
    const hold = this.hold;

    // flame power: an ember until the first breath, then it follows the breath and never quite dies
    const target = this.lit ? 0.2 + 0.8 * ease.inOutCubic(hold) : 0;
    this.flare = Math.max(0, this.flare - dt * 1.4);
    this.power = damp(this.power, target + this.flare * 0.4, this.lit ? 5 : 3, dt);
    const p = this.power;
    const calm = clamp(hold * 1.1);
    const amp = (R ? 0.25 : 1) * lerp(1, 0.35, calm);
    const flick = 1 + amp * (0.06 * Math.sin(t * 11.3) + 0.045 * Math.sin(t * 17.9 + 1.3) + 0.05 * Math.sin(t * 5.1 + 0.7) * Math.sin(t * 2.3));
    this.wind = damp(this.wind, this.windTarget, 3, dt);
    this.windTarget = damp(this.windTarget, 0, 2, dt);

    // flame and glows
    const fh = 1.4 + 4.9 * p, fw = 0.6 + 1.45 * p;
    this.flame.visible = p > 0.01;
    this.flame.scale.set(fw * (1 + (flick - 1) * 0.5), fh * flick, 1);
    const fu = this.flame.material.uniforms;
    fu.uTime.value = R ? t * 0.35 : t;
    fu.uPower.value = p;
    fu.uCalm.value = calm;
    fu.uWind.value = this.wind;
    const camXZ = Math.atan2(this.camera.position.x - this.wick.x, this.camera.position.z - this.wick.z);
    this.flame.rotation.y = this.smoke.rotation.y = camXZ;
    const breatheIdle = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.2));
    const ember = this.lit ? 0 : breatheIdle;
    this.ember.visible = !this.lit || p < 0.35;
    this.ember.material.color.setRGB(1, 0.3 + 0.25 * ember, 0.08).multiplyScalar(0.6 + 0.9 * ember);
    this.smoke.material.uniforms.uTime.value = t;
    this.smoke.material.uniforms.uAlpha.value = damp(this.smoke.material.uniforms.uAlpha.value, this.lit ? 0 : 1, 2.5, dt);
    this.smoke.visible = this.smoke.material.uniforms.uAlpha.value > 0.01;
    const mid = this.wick.clone().add(new THREE.Vector3(this.wind * p * 0.8, fh * 0.36, 0));
    this.core.position.copy(mid);
    this.core.scale.setScalar(1.1 + 2.4 * p + ember * 0.8);
    this.core.material.opacity = clamp(0.3 * ember + 0.42 * p) * flick;
    this.halo.position.copy(mid);
    this.halo.scale.setScalar(9 + 22 * p + ember * 5);
    this.halo.material.opacity = (0.12 * ember + 0.34 * p) * flick;

    // light: warm, flickering, a little bounce from the stone around it
    this.light.position.copy(mid).add(new THREE.Vector3(Math.sin(t * 9.1) * 0.04 * amp, 0, Math.cos(t * 7.3) * 0.04 * amp));
    this.light.intensity = (ember * 5 + Math.pow(p, 1.25) * 240) * flick;
    this.light.color.setRGB(1, lerp(0.5, 0.66, clamp(p)), lerp(0.2, 0.34, clamp(p)));
    this.bounce.intensity = 0.02 + 0.09 * clamp(p) * flick;
    for (const sh of this.shadows) sh.material.opacity = sh.userData.fade * clamp(0.25 + 0.9 * p) * (0.94 + 0.06 * flick);

    // the gold trail climbs with the breath
    const tu = this.trail.material.uniforms;
    tu.uP.value = damp(tu.uP.value, this.lit ? hold : 0, 14, dt);
    tu.uFull.value = damp(tu.uFull.value, this.isFull ? 1 : 0, 6, dt);
    tu.uTime.value = t;
    const pp = tu.uP.value;
    this.runners.forEach((r, i) => {
      r.position.copy(this.path.getPointAt(i ? 1 - pp * 0.5 : pp * 0.5)).setZ(0.3);
      r.material.opacity = pp > 0.005 && !this.isFull ? 0.9 : damp(r.material.opacity, 0, 8, dt);
      r.scale.setScalar(1.3 + 0.25 * Math.sin(t * 13 + i));
    });
    this.fullFlash = Math.max(0, this.fullFlash - dt * 0.9);
    this.keystone.material.opacity = this.fullFlash * 0.95 + (this.isFull ? 0.25 : 0);
    this.keystone.scale.setScalar(2.5 + (1 - this.fullFlash) * 5);

    this.updatePoints(dt, p);

    // camera: breathing drift, pointer parallax, and the walk into the light
    this.stage.renderer.toneMappingExposure = EXPOSURE;
    if (this.out >= 0) this.exhaleStep(dt);
    else {
      this.look.x = damp(this.look.x, this.lookTarget.x, 2.5, dt);
      this.look.y = damp(this.look.y, this.lookTarget.y, 2.5, dt);
      const drift = R ? 0 : 1;
      const cx = (this.look.x * 1.6 + Math.sin(t * 0.21) * 0.5) * drift;
      const cy = (-this.look.y * 1.1 + Math.sin(t * 0.17 + 1) * 0.35) * drift;
      const push = R ? 0 : ease.inOutCubic(hold) * 3;
      this.camera.position.set(CAM.x + cx, CAM.y + cy, CAM.z - push);
      this.applyCamera();
    }
    this.points.material.uniforms.uScale.value = this.camera.projectionMatrix.elements[5] * this.stage.size.h * this.stage.size.dpr * 0.5;
  }

  private updatePoints(dt: number, p: number) {
    const g = this.points.geometry;
    const pos = g.attributes.position.array as Float32Array, size = g.attributes.aSize.array as Float32Array;
    const glow = g.attributes.aGlow.array as Float32Array, tint = g.attributes.aTint.array as Float32Array;
    const W = this.wick, R = this.reduced, inhale = this.lit && this.out < 0 ? this.hold : 0;
    const tmp = new THREE.Vector3();
    let i = 0;
    for (const m of this.motes) {
      if (!R) {
        tmp.copy(W).sub(m.p);
        const d = tmp.length() + 0.5;
        // the breath draws the air toward the flame; the exhale pushes it away
        const pull = this.out >= 0 ? -30 * ease.inCubic(Math.min(1, this.out * 1.3)) : inhale * 0.9;
        m.v.addScaledVector(tmp.normalize(), (pull * dt * 6) / Math.max(1, d * 0.25));
        m.v.x += (Math.random() - 0.5) * 0.4 * dt;
        m.v.y += (Math.random() - 0.45) * 0.4 * dt + p * 0.08 * dt;
        m.v.z += (Math.random() - 0.5) * 0.4 * dt;
        m.v.multiplyScalar(1 - 0.6 * dt);
        m.p.addScaledVector(m.v, dt);
        if (m.p.y > 32 || m.p.y < -5 || Math.abs(m.p.x) > 17 || m.p.z > 24 || m.p.z < -12) m.p.set(lerp(-15, 15, Math.random()), lerp(-3, 6, Math.random()), lerp(-10, 20, Math.random()));
      }
      const d2 = m.p.distanceToSquared(W) + 4;
      const lightAt = (this.light.intensity + 3) / d2;
      m.tw += dt * 3;
      glow[i] = clamp(lightAt * 0.14 * (0.6 + 0.4 * Math.sin(m.tw)), 0, 0.9) + 0.03;
      size[i] = m.size;
      pos[i * 3] = m.p.x; pos[i * 3 + 1] = m.p.y; pos[i * 3 + 2] = m.p.z;
      tint[i * 3] = 1; tint[i * 3 + 1] = 0.82; tint[i * 3 + 2] = 0.62;
      i++;
    }
    this.sparks = this.sparks.filter((s) => (s.life += dt) < s.max);
    for (const s of this.sparks) {
      s.v.y += 3 * dt;
      s.v.x += (Math.random() - 0.5) * 6 * dt;
      s.v.multiplyScalar(1 - 1.2 * dt);
      s.p.addScaledVector(s.v, dt);
      const k = 1 - s.life / s.max;
      glow[i] = k * 1.6;
      size[i] = 0.16 * (0.5 + k);
      pos[i * 3] = s.p.x; pos[i * 3 + 1] = s.p.y; pos[i * 3 + 2] = s.p.z;
      tint[i * 3] = 1; tint[i * 3 + 1] = 0.55 + 0.35 * k; tint[i * 3 + 2] = 0.18 + 0.3 * k;
      i++;
    }
    for (let j = i; j < size.length; j++) glow[j] = 0;
    g.setDrawRange(0, i);
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aGlow.needsUpdate = g.attributes.aTint.needsUpdate = true;
  }

  private exhaleStep(dt: number) {
    const DUR = this.reduced ? 0.6 : 1.45;
    this.out = Math.min(1, this.out + dt / DUR);
    const e = this.out;
    const { w: W, h: H, dpr } = this.stage.size;
    const flameAt = this.wick.clone().add(new THREE.Vector3(0, 1.6, 0));
    if (!this.reduced) {
      // hold the flame where it was on screen, glide it to the centre, and walk the camera into it
      const s = ease.inOutCubic(clamp(e / 0.85));
      this.anchor.copy(flameAt);
      this.target.set(lerp(this.outFrom.target.x, W / 2, s), lerp(this.outFrom.target.y, H / 2, s));
      this.camera.position.lerpVectors(this.outFrom.cam, flameAt.clone().add(new THREE.Vector3(0, 1.2, 9)), ease.inCubic(e));
      this.light.intensity *= 1 + 10 * e * e;
    }
    this.applyCamera();
    this.camera.updateMatrixWorld();
    this.stage.renderer.toneMappingExposure = EXPOSURE + 1.6 * e * e;
    const f = this.flood, u = f.material.uniforms;
    f.visible = true;
    const fs = this.stage.project(flameAt, this.camera);
    u.uC.value.set(fs.x * dpr, (H - fs.y) * dpr);
    const far = Math.hypot(Math.max(fs.x, W - fs.x), Math.max(fs.y, H - fs.y)) * dpr * 1.5;
    const k = this.reduced ? 1 : clamp((e - 0.16) / 0.84);
    u.uR.value = far * ease.inCubic(k);
    u.uOn.value = this.reduced ? ease.inOutCubic(e) : clamp(k * 6);
    if (e >= 1 && this.outResolve) { const r = this.outResolve; this.outResolve = null; r(); }
  }

  dispose() {
    this.off.forEach((f) => f());
    this.stage.renderer.toneMappingExposure = 1.05;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.light.dispose();
  }
}
