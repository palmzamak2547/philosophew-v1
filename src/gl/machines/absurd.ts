import * as THREE from 'three';
import { Machine, hits } from './base';
import { M, contactShadow, textTex, glow, halo, ease, fbm, mergeStatic } from '../kit';
import { sfx, haptic } from '../../core/audio';
import { addPush } from '../../core/game';
import { store } from '../../core/store';
import type { Finish } from '../../core/store';
import { t } from '../../core/i18n';

// Sisyphus' Hill: push the boulder up; it always rolls back. The boulder is secretly a capsule.
const BASE = 0.18, R = 0.38, X0 = -1.2, X1 = 0.55;
const slopeY = (x: number) => 2.0 * Math.pow(Math.max(0, (x + 1.6) / 2.2), 1.5);
const slopeD = (x: number) => (2.0 * 1.5 * Math.pow(Math.max(0, (x + 1.6) / 2.2), 0.5)) / 2.2;

function rockHalf(top: boolean, mat: THREE.Material) {
  const geo = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (fbm(v.x * 2.1 + 5, v.y * 2.1 + v.z * 1.7, 3) - 0.5) * 0.22;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

export class AbsurdMachine extends Machine {
  readonly height = 3.6;
  readonly width = 3.7;
  private boulder = new THREE.Group();
  private top!: THREE.Mesh;
  private man = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private sun = new THREE.Group();
  private sunEyes: THREE.Mesh[] = [];
  private clouds: THREE.Group[] = [];
  private sign!: THREE.Mesh;
  private s = 0;
  private roll = 0;
  private holding = false;
  private phase: 'idle' | 'peak' | 'down' = 'idle';
  private halo: THREE.Sprite | null = null;
  private gust = 0;

  build() {
    const g = this.group;
    const cream = M.std('#FFF4DF', { roughness: 0.7 });
    // platform
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.95, BASE, 64), cream);
    plat.position.y = BASE / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.955, 1.955, 0.05, 64, 1, true), M.std('#EE6A3E', { roughness: 0.6 }));
    band.position.y = 0.09;
    g.add(plat, band);

    // the hill: gets steeper exactly where you are most tired
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, 0);
    for (let i = 0; i <= 24; i++) { const x = -1.6 + (i / 24) * 2.2; shape.lineTo(x, slopeY(x)); }
    shape.quadraticCurveTo(0.78, 2.12, 0.92, 1.9);
    shape.quadraticCurveTo(1.25, 1.1, 1.38, 0);
    shape.lineTo(-1.6, 0);
    const hill = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 16 }), M.std('#EE6A3E', { roughness: 0.75 }));
    hill.geometry.translate(0, 0, -0.5);
    hill.position.y = BASE;
    g.add(hill);
    // a path worn by a million pushes
    const path = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-1.6, 0); for (let i = 0; i <= 24; i++) { const x = -1.6 + (i / 24) * 2.2; s.lineTo(x, slopeY(x) + 0.012); } s.lineTo(0.6, slopeY(0.6) - 0.02); for (let i = 24; i >= 0; i--) { const x = -1.6 + (i / 24) * 2.2; s.lineTo(x, slopeY(x) - 0.02); } return s; })(), { depth: 0.46, bevelEnabled: false }), M.std('#D9562F', { roughness: 0.8 }));
    path.geometry.translate(0, 0, -0.23);
    path.position.set(0, BASE, 0);
    path.scale.z = 1.01;
    g.add(path);

    // the boulder (two halves, a seam: it was a capsule all along)
    const rock = M.std('#E8E1D2', { roughness: 0.9, flatShading: true });
    this.top = rockHalf(true, rock);
    const bot = rockHalf(false, rock);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 28), M.std('#3a3530'));
    seam.rotation.x = Math.PI / 2;
    const inner = new THREE.Group();
    inner.add(this.top, bot, seam);
    inner.scale.setScalar(R);
    this.boulder.add(inner);
    g.add(this.boulder);

    // Sisyphus, happy (as we must imagine him)
    const skin = M.std('#F2C9A0', { roughness: 0.6 });
    const tunic = M.std('#FFF8EC', { roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.14, 6, 12), tunic);
    torso.position.y = 0.32;
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.014, 6, 16), M.std('#EE6A3E'));
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), skin);
    head.position.set(0.02, 0.5, 0);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), M.std('#3b2a1e'));
    hair.position.copy(head.position);
    hair.rotation.z = 0.3;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), M.basic('#1b1b3a'));
    eye.position.set(0.085, 0.51, 0.03);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12, Math.PI), M.basic('#7a2d1d'));
    smile.position.set(0.08, 0.485, 0.028);
    smile.rotation.set(0, Math.PI / 2, Math.PI);
    this.man.add(torso, sash, head, hair, eye, smile);
    for (const z of [-0.035, 0.035]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.16, 4, 8), skin);
      leg.geometry.translate(0, -0.1, 0);
      leg.position.set(0, 0.24, z);
      this.legs.push(leg);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.15, 4, 8), skin);
      arm.geometry.translate(0, -0.09, 0);
      arm.position.set(0.02, 0.4, z * 2.2);
      arm.rotation.z = Math.PI / 2 + 0.3;
      this.arms.push(arm);
      this.man.add(leg, arm);
    }
    this.man.scale.setScalar(1.55);
    g.add(this.man);

    // the sun, who has seen this before
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 48), M.basic('#FFC53A'));
    this.sun.add(disc);
    const rayMat = M.basic('#FFD76A'), rays: THREE.Mesh[] = [];
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 3), rayMat);
      const a = (i / 12) * Math.PI * 2;
      ray.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.01);
      ray.rotation.z = a - Math.PI / 2;
      this.sun.add(ray);
      rays.push(ray);
    }
    mergeStatic(this.sun, rays); // the sun turns as one: one draw for all twelve rays
    for (const x of [-0.14, 0.14]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), M.basic('#1B1B3A'));
      e.position.set(x, 0.08, 0.01);
      this.sunEyes.push(e);
      this.sun.add(e);
    }
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24, Math.PI), M.basic('#1B1B3A'));
    grin.rotation.z = Math.PI;
    grin.position.set(0, -0.02, 0.01);
    this.sun.add(grin);
    this.sun.position.set(-1.05, 3.05, -0.9);
    g.add(this.sun);
    this.sun.add(glow('rgba(255,210,90,0.8)', 2.2, 0.5));

    // clouds
    const cloudMat = M.std('#FFFFFF', { roughness: 1 });
    for (let c = 0; c < 3; c++) {
      const cl = new THREE.Group();
      const puffs: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 14, 10), cloudMat);
        puff.position.set(i * 0.18 - 0.27, Math.sin(i * 1.7) * 0.06, 0);
        cl.add(puff);
        puffs.push(puff);
      }
      mergeStatic(cl, puffs); // each cloud drifts as one
      cl.position.set(-1.8 + c * 1.6, 2.4 + c * 0.35, -1.2 + c * 0.3);
      cl.userData.speed = 0.05 + c * 0.02;
      this.clouds.push(cl);
      g.add(cl);
    }

    // the tally sign
    // the post stands behind the board (along its turned normal) and ends at its middle: it used to pass through
    // the board and cut the painted words in two
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8), M.std('#7A4B2A'));
    post.position.set(1.55 + Math.sin(0.35) * 0.05, 0.55, 0.95 - Math.cos(0.35) * 0.05);
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), new THREE.MeshBasicMaterial({ transparent: true }));
    this.sign.position.set(1.55, 0.92, 0.975);
    this.sign.rotation.y = -0.35;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.34, 0.03), M.std('#C99A62', { roughness: 0.8 }));
    board.position.set(1.55, 0.92, 0.95);
    board.rotation.y = -0.35;
    g.add(post, board, this.sign);
    this.paintSign();
    g.add(contactShadow(3.6, 3.2, 0.35));
    this.place(0);
  }

  warm() { return [halo('foil', 1.2, 0.95)]; } // the boulder is the capsule: only the halo is new to the scene

  private paintSign() {
    const n = store.s.pushes, mat = this.sign.material as THREE.MeshBasicMaterial, old = mat.map;
    // a new count after every push: not cached, and the last one is let go (it was kept forever)
    mat.map = textTex(n ? t(`ครั้งที่ ${n.toLocaleString('en-US')}`, `Push no. ${n.toLocaleString('en-US')}`) : t('ครั้งแรก', 'First push'), { font: '700 64px Anuphan, "Noto Sans Thai", sans-serif', color: '#3a2412', w: 512, h: 160, cache: false });
    mat.needsUpdate = true;
    old?.dispose();
  }

  /** Put boulder and man on the slope at progress s (0 bottom, 1 top). */
  private place(s: number, dRoll = 0) {
    const x = X0 + (X1 - X0) * s;
    const y = slopeY(x) + BASE;
    const d = slopeD(x);
    const n = new THREE.Vector2(-d, 1).normalize();
    this.boulder.position.set(x + n.x * R, y + n.y * R, 0);
    this.roll += dRoll;
    this.boulder.rotation.z = -this.roll;
    const tan = new THREE.Vector2(1, d).normalize();
    const mx = x - tan.x * (R + 0.3);
    this.man.position.set(mx, slopeY(mx) + BASE, 0);
    this.man.rotation.z = Math.atan(d) * 0.55;
  }

  update(dt: number, t: number) {
    this.sun.rotation.z = Math.sin(t * 0.3) * 0.05;
    const blink = (t % 4.2) < 0.12 ? 0.15 : 1;
    this.sunEyes.forEach((e) => (e.scale.y = this.phase === 'down' ? 0.3 : blink));
    this.clouds.forEach((c) => { c.position.x += dt * (c.userData.speed as number); if (c.position.x > 2.4) c.position.x = -2.4; });
    if (this.halo) this.halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
    if (this.phase !== 'idle') return;
    const before = this.s;
    if (this.holding) this.s = Math.min(1, this.s + dt * 0.36 * (1 - 0.55 * this.s));
    else if (!this.busy) this.s = Math.max(0, this.s - dt * 0.14);
    const ds = this.s - before;
    if (ds !== 0) {
      const x0 = X0 + (X1 - X0) * before, x1 = X0 + (X1 - X0) * this.s;
      const dist = Math.hypot(x1 - x0, slopeY(x1) - slopeY(x0)) * Math.sign(ds);
      this.place(this.s, dist / R);
      const stride = this.holding ? Math.sin(t * 9) * 0.5 : 0;
      this.legs[0].rotation.z = stride; this.legs[1].rotation.z = -stride;
      this.gust += dt;
      if (this.holding && this.gust > 0.35) { this.gust = 0; sfx.rumble(0.5); haptic(4); }
      this.host?.progress(this.s);
    }
    if (this.s >= 1 && !this.busy) void this.atTop();
  }

  pointerDown(ray: THREE.Raycaster) {
    if (this.busy || !this.host || !hits(ray, this.group)) return false;
    this.pushes++; // a hand on the boulder owns it: an earlier button push lets go
    this.holding = true;
    return true;
  }
  pointerUp() { this.holding = false; }

  private pushes = 0;
  async auto() {
    if (this.busy || !this.host) return;
    const push = ++this.pushes;
    this.holding = true;
    // push until the summit, never for a fixed time: the climb slows near the top and takes about 4 s from the
    // bottom (a fixed 3.4 s stopped at 88 percent and the boulder rolled back every time)
    await this.tween(6, () => { if (push === this.pushes && this.busy) this.holding = false; });
    if (push === this.pushes) this.holding = false; // a newer push owns the boulder now; leave it be
  }

  private async atTop() {
    this.busy = true;
    this.holding = false;
    this.phase = 'peak';
    this.host?.say(t('ถึงยอดแล้ว', 'The summit!'));
    // arms up for one glorious second
    this.arms.forEach((a) => (a.rotation.z = Math.PI - 0.3));
    await this.tween(0.6, (k) => { this.boulder.position.x += Math.sin(k * Math.PI * 4) * 0.004; });
    await this.finishGesture((f) => this.rollDown(f), () => this.rollDown(null).then(() => undefined));
  }

  private async rollDown(finish: Finish | null): Promise<THREE.Vector3> {
    this.phase = 'down';
    sfx.rumble(1);
    if (finish) { addPush(); this.paintSign(); }
    this.arms.forEach((a) => (a.rotation.z = Math.PI / 2 + 0.3));
    // it rolls back down, bouncing, past the poor man
    let prevS = 1;
    let bumps = 0;
    await this.tween(1.3, (k) => {
      const s = 1 - ease.inOutCubic(k);
      const x0 = X0 + (X1 - X0) * prevS, x1 = X0 + (X1 - X0) * s;
      const dist = -Math.hypot(x1 - x0, slopeY(x1) - slopeY(x0));
      prevS = s;
      const x = X0 + (X1 - X0) * s;
      const d = slopeD(x);
      const n = new THREE.Vector2(-d, 1).normalize();
      this.roll += dist / R;
      this.boulder.rotation.z = -this.roll;
      const hop = Math.abs(Math.sin(k * Math.PI * 3)) * 0.12 * (1 - k);
      this.boulder.position.set(x + n.x * R, slopeY(x) + BASE + n.y * R + hop, 0);
      const nb = Math.floor(k * 3);
      if (nb > bumps) { bumps = nb; sfx.rumble(0.8); haptic(10); }
    }, (x) => x);
    if (!finish) {
      this.host?.say(t('ไฟวันนี้หมดแล้ว หินเลยกลิ้งลงมาเฉยๆ', 'No flames today, so the boulder just rolls back down.'));
      this.s = 0; this.phase = 'idle'; this.place(0); this.host?.progress(0);
      return this.boulder.position.clone();
    }
    // roll off the hill onto the front of the platform
    const from = this.boulder.position.clone();
    const to = new THREE.Vector3(-0.35, BASE + R, 0.95);
    await this.tween(0.7, (k) => {
      this.boulder.position.lerpVectors(from, to, ease.outCubic(k));
      this.boulder.position.y = from.y + (to.y - from.y) * ease.outBounce(k);
      this.roll += 0.12;
      this.boulder.rotation.z = -this.roll;
    }, (x) => x);
    this.boulder.rotation.set(0, 0, 0);
    this.host?.say(t('หินแตกออก ข้างในมีบางอย่าง', 'The boulder cracks open. Something is inside.'));
    if (finish !== 'paper') {
      this.halo = halo(finish, 1.2, 0.95);
      this.halo.position.copy(this.boulder.position);
      this.group.add(this.halo);
      finish === 'gold' ? sfx.gold() : sfx.foil();
    }
    sfx.pop();
    await this.tween(0.45, (k) => { this.top.position.y = k * 1.4; this.top.rotation.z = k * 1.2; }, ease.outCubic);
    const w = new THREE.Vector3();
    this.boulder.getWorldPosition(w);
    return w;
  }

  reset() {
    if (this.halo) this.group.remove(this.halo);
    this.halo = null;
    this.top.position.set(0, 0, 0);
    this.top.rotation.set(0, 0, 0);
    this.top.visible = true;
    this.s = 0;
    this.roll = 0;
    this.phase = 'idle';
    this.busy = false;
    this.holding = false;
    this.place(0);
    this.host?.progress(0);
  }
}
