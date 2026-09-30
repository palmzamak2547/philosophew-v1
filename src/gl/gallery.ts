import * as THREE from 'three';
import type { Stage } from './stage';
import { Machine, type MachineHost } from './machines/base';
import { SCHOOLS, type School } from '../content/schools';
import { radialTex, damp, clamp } from './kit';

// One continuous hall: five machines in a row. Browse = swipe along the row; room = walk up to one.
const GAP = 6.6;
const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));
type Loader = (s: School, stage: Stage) => Promise<Machine>;

export class Gallery {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  machines: (Machine | null)[] = SCHOOLS.map(() => null);
  private slots = SCHOOLS.map(() => new THREE.Group());
  private idx = 0; // current (float)
  private target = 0;
  private roomBlend = 0;
  private roomTarget = 0;
  private hemi: THREE.HemisphereLight;
  private rim: THREE.DirectionalLight;
  private fogColor = new THREE.Color();
  private dust: THREE.Points;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private drag: { x: number; y: number; t: number; start: number; moved: boolean; vx: number; lastX: number; lastT: number; machine: boolean } | null = null;
  private offTick: () => void;
  private active = true;
  onFocus: (i: number) => void = () => {};
  onSelect: (i: number) => void = () => {};

  constructor(private stage: Stage, private load: Loader) {
    const s = this.scene;
    // the reflections start building now, in parallel with the first machine's download; see ensure()
    void stage.environment().then((env) => { s.environment = env; });
    s.environmentIntensity = 0.7;
    // parts drawn as instanced copies follow their machine's animated anchors, read after every tick of the frame
    s.onBeforeRender = () => { for (const m of this.machines) if (m?.group.visible) m.beforeRender(); };
    s.fog = new THREE.Fog(0xffffff, 14, 30);
    this.hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a7c6c, 0.8);
    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(-4, 7, 6);
    this.rim = new THREE.DirectionalLight(0xffe2b0, 1.9);
    this.rim.position.set(3, 4, -6);
    s.add(this.hemi, key, this.rim, key.target);
    key.target.position.set(0, 1, 0);
    // The light count must never change after this: one new light makes three recompile every material
    // in the scene at once (a 1.5 s stall on a mid-range phone). The Existential neon's red light lives
    // here from the start, dark, and that machine only turns it up.
    const neon = new THREE.PointLight('#ff3040', 0, 5, 1.6);
    neon.name = 'existential-neon';
    neon.position.set(SCHOOLS.findIndex((x) => x.id === 'existential') * GAP, 3.2, 0.9);
    s.add(neon);

    // floor: a soft pool of light under each machine that fades into the page colour
    const floorMat = new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false });
    this.slots.forEach((g, i) => {
      g.position.x = i * GAP;
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), floorMat);
      pool.rotation.x = -Math.PI / 2;
      pool.renderOrder = -2;
      g.add(pool);
      s.add(g);
    });

    // drifting dust in the light, for air
    const n = stage.lowPower ? 140 : 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * GAP * 5 - GAP;
      pos[i * 3 + 1] = Math.random() * 5;
      pos[i * 3 + 2] = Math.random() * 6 - 3;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.035, map: radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }));
    s.add(this.dust);
    // the floor and the dust compile off the main thread before the first frame draws them (drawn cold, they compiled
    // inside that frame: 100 to 230 ms, just as the lamp's words slid in)
    this.ready = stage.renderer.compileAsync(s, this.camera).then(() => {}, () => {});

    this.offTick = stage.onTick((dt, t) => this.tick(dt, t));
    this.bindInput();
  }

  /** The hall's own floor and dust are compiled: it may be drawn. */
  readonly ready: Promise<void>;
  get isActive() { return this.active; }

  /** Build a machine the first time it is needed; neighbours are prefetched. */
  private pending: (Promise<Machine | null> | undefined)[] = [];

  /**
   * Load, build and show machine i once. Its shaders compile in parallel off the main thread
   * (KHR_parallel_shader_compile via compileAsync) before it can be drawn: compiling on first use
   * blocked a mid-range phone for seconds. The room reflections come first: a material compiled without
   * them would have to compile again once they arrive. What a pull adds later (Machine.warm: the capsule in
   * every finish, the halo) compiles now too, in this scene's light and fog, so it draws with the same programs.
   */
  ensure(i: number): Promise<Machine | null> {
    if (i < 0 || i >= SCHOOLS.length) return Promise.resolve(null);
    if (this.machines[i]) return Promise.resolve(this.machines[i]);
    return (this.pending[i] ??= (async () => {
      // Each step is a task of its own: chained, the reflections' render, the build and the programs' setup made one
      // task of 150 to 300 ms. The build runs while the reflections compile off the main thread.
      const env = this.stage.environment();
      const m = await this.load(SCHOOLS[i], this.stage);
      await nextTask();
      m.build();
      this.scene.environment = await env;
      await nextTask();
      const r = this.stage.renderer;
      const shown = r.compileAsync(m.group, this.camera, this.scene);
      await nextTask();
      const later = new THREE.Group();
      for (const o of m.warm()) later.add(o); // never shown, never disposed: disposing would release the programs
      await Promise.all([shown, r.compileAsync(later, this.camera, this.scene)]).catch(() => {});
      this.machines[i] = m;
      this.slots[i].add(m.group);
      this.stage.wake();
      return m;
    })().catch((err) => {
      this.pending[i] = undefined; // offline and not saved yet: the next visit to this machine tries again
      throw err;
    }));
  }

  /** Neighbours load quietly: a machine that cannot load yet simply is not there. */
  private prefetch(i: number) { this.ensure(i).catch(() => {}); }

  focus(i: number, instant = false) {
    this.target = clamp(i, 0, SCHOOLS.length - 1);
    if (instant) this.idx = this.target;
    this.ensure(i).then(() => { this.prefetch(i + 1); this.prefetch(i - 1); }, () => {});
  }
  get focused() { return Math.round(this.target); }
  get machine() { return this.machines[this.focused]; }

  setRoom(on: boolean, instant = false) {
    this.roomTarget = on ? 1 : 0;
    if (instant) this.roomBlend = this.roomTarget;
  }

  setActive(on: boolean) { this.active = on; }

  setTone(school: School) {
    this.fogColor.set(school.palette.bg);
    (this.scene.fog as THREE.Fog).color.copy(this.fogColor);
    this.hemi.groundColor.set(school.palette.bg2);
    this.rim.color.set(school.palette.glow);
    (this.dust.material as THREE.PointsMaterial).color.set(school.dark ? '#fff4d6' : '#ffffff');
    (this.dust.material as THREE.PointsMaterial).opacity = school.dark ? 0.7 : 0.45;
  }

  /** Free screen rectangles (CSS px) the machine must fit inside, measured by the UI layer. */
  private safe = { browse: { top: 120, bottom: 500, left: 12, right: 378 }, room: { top: 150, bottom: 600, left: 12, right: 378 } };
  setSafe(mode: 'browse' | 'room', r: { top: number; bottom: number; left: number; right: number }) {
    this.safe[mode] = r;
  }

  /** Fit the machine into the free rectangle between the UI's text blocks, on any screen. */
  private pose(i: number, room: number) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const aspect = this.camera.aspect || 1;
    const W = this.stage.size.w, H = this.stage.size.h;
    const m = this.machines[Math.round(i)];
    const h = m?.height ?? 3.4, w = m?.width ?? 2;
    const b = this.safe.browse, r = this.safe.room;
    const mix = (a: number, c: number) => a + (c - a) * room;
    const top = mix(b.top, r.top), bottom = mix(b.bottom, r.bottom), left = mix(b.left, r.left), right = mix(b.right, r.right);
    const bandH = Math.max(90, bottom - top), bandW = Math.max(90, right - left);
    const fill = mix(0.86, 0.84); // leave air, and room for the base coming toward the camera
    const dH = (h * H) / (fill * bandH * 2 * tan);
    const dW = (w * W) / (fill * bandW * 2 * tan * aspect);
    const d = Math.max(dH, dW);
    const unit = (2 * d * tan) / H; // world units per CSS pixel at the machine's depth
    const x = i * GAP;
    const cy = h * 0.5 + (m?.focusY ?? 0) * room;
    const target = new THREE.Vector3(x - ((left + right) / 2 - W / 2) * unit, cy - (H / 2 - (top + bottom) / 2) * unit, 0);
    const pos = new THREE.Vector3(target.x, target.y + d * 0.07, d);
    return { pos, target };
  }

  private tick(dt: number, t: number) {
    if (!this.active) return;
    if (!this.drag) this.idx = damp(this.idx, this.target, 7, dt);
    this.roomBlend = damp(this.roomBlend, this.roomTarget, 3.6, dt);
    const { pos, target } = this.pose(this.idx, this.roomBlend);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    // the fog starts just behind the machine and fades what lies beyond, however far the camera stands: a small
    // phone pulls the camera back to fit the machine, and a fixed fog (14 to 30) had swallowed it whole
    const fog = this.scene.fog as THREE.Fog, d = pos.distanceTo(target);
    fog.near = d + 3; fog.far = d + 19;
    this.machines.forEach((m, i) => {
      if (!m) return;
      const near = Math.abs(i - this.idx) < 1.2;
      m.group.visible = Math.abs(i - this.idx) < (this.roomBlend > 0.35 ? 0.5 : 1.6); // in a room, only that machine
      if (!m.group.visible) return;
      const face = i === this.focused ? this.roomBlend : 0;
      m.group.rotation.y = Math.sin(t * 0.35 + i * 1.7) * 0.28 * (1 - face) + (i - this.idx) * -0.12 * (1 - face);
      m.update(dt, t, near);
    });
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k += 7) p.setY(k, (p.getY(k) + dt * 0.05) % 5);
    p.needsUpdate = true;
    this.dust.rotation.y = Math.sin(t * 0.05) * 0.02;
  }

  // ---------- input ----------
  private bindInput() {
    const el = this.stage.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const inRoom = this.roomTarget === 1;
      let taken = false;
      if (inRoom) {
        const m = this.machine;
        if (m?.armed) { this.aim(e); taken = m.pointerDown(this.ray, e); }
      }
      this.drag = { x: e.clientX, y: e.clientY, t: performance.now(), start: this.idx, moved: false, vx: 0, lastX: e.clientX, lastT: performance.now(), machine: taken };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const d = this.drag;
      const inRoom = this.roomTarget === 1;
      if (d?.machine) { this.aim(e); this.machine?.pointerMove(this.ray, e); return; }
      if (!d) { this.hover(e); return; }
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - d.y)) d.moved = true;
      if (d.moved && !inRoom) {
        const per = Math.min(this.stage.size.w * 0.75, 520);
        this.idx = clamp(d.start - dx / per, -0.35, SCHOOLS.length - 0.65);
        const now = performance.now();
        d.vx = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
        d.lastX = e.clientX; d.lastT = now;
      }
    });
    const up = (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d || !this.active) return;
      if (d.machine) { this.aim(e); this.machine?.pointerUp(this.ray, e); return; }
      if (this.roomTarget === 1) return;
      if (d.moved) {
        const next = Math.round(clamp(this.idx - d.vx * 0.35, 0, SCHOOLS.length - 1));
        this.target = next;
        this.onFocus(next);
        this.prefetch(next + 1); this.prefetch(next - 1);
        return;
      }
      // a tap: pick the machine under the finger
      this.aim(e);
      const hit = this.pick();
      if (hit === null) return;
      if (hit === this.focused) this.onSelect(hit);
      else { this.focus(hit); this.onFocus(hit); }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (!this.active || this.roomTarget === 1) return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      this.wheelAcc += dx;
      if (Math.abs(this.wheelAcc) > 60) {
        const next = clamp(this.focused + Math.sign(this.wheelAcc), 0, SCHOOLS.length - 1);
        this.wheelAcc = 0;
        if (next !== this.focused) { this.focus(next); this.onFocus(next); }
      }
    }, { passive: false });
  }
  private wheelAcc = 0;

  private aim(e: PointerEvent) {
    this.stage.ndc(e, this.ndc);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  private pick(): number | null {
    let best: number | null = null, bestD = Infinity;
    this.machines.forEach((m, i) => {
      if (!m || !m.group.visible) return;
      const h = this.ray.intersectObject(m.group, true)[0];
      if (h && h.distance < bestD) { bestD = h.distance; best = i; }
    });
    return best;
  }

  private hover(e: PointerEvent) {
    if (this.stage.mobile) return;
    this.aim(e);
    const over = this.roomTarget === 1 ? !!(this.machine && this.ray.intersectObject(this.machine.group, true)[0]) : this.pick() !== null;
    this.stage.canvas.style.cursor = over ? (this.roomTarget === 1 ? 'grab' : 'pointer') : '';
  }

  host(h: Omit<MachineHost, 'stage' | 'camera'>): MachineHost {
    return { ...h, stage: this.stage, camera: this.camera };
  }

  dispose() { this.offTick(); }
}
