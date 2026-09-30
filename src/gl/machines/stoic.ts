import * as THREE from 'three';
import { Machine, hits } from './base';
import { M, roundBox, lathe, contactShadow, capsule, finishMaterial, capsuleWarm, halo, textTex, ease, clamp, mergeStatic } from '../kit';
import { sfx, haptic } from '../../core/audio';
import type { Finish } from '../../core/store';
import { L } from '../../content/schools';

// The Bronze Stoa: a marble column gashapon. You turn the crank; what falls out is not yours to choose.
export class StoicMachine extends Machine {
  readonly height = 3.5;
  readonly width = 1.75;
  private crank = new THREE.Group();
  private plate!: THREE.Mesh;
  private pile!: { tops: THREE.InstancedMesh; bots: THREE.InstancedMesh; base: THREE.Matrix4[] };
  private globe = new THREE.Group();
  private turned = 0;
  private lastAngle = 0;
  private dragging = false;
  private nextClick = 0;
  private jiggle = 0;
  private out: THREE.Group | null = null;
  private halo: THREE.Sprite | null = null;

  build() {
    const g = this.group;
    const marble = M.marble('#EEE8DE', '#9A8F80', 1.7);
    const bronze = M.metal('#B07A3B', 0.3);
    const darkBronze = M.metal('#6E4A24', 0.45);
    const patina = new THREE.MeshStandardMaterial({ color: '#3F8B77', roughness: 0.55, metalness: 0.35 });
    const R = 0.56;
    // stone and bronze that never move are drawn as one mesh each (mergeStatic, at the end)
    const marbleParts: THREE.Mesh[] = [], bronzeParts: THREE.Mesh[] = [];

    // plinth
    const p1 = new THREE.Mesh(roundBox(1.72, 0.22, 1.72, 0.04), marble);
    p1.position.y = 0.11;
    const p2 = new THREE.Mesh(roundBox(1.46, 0.18, 1.46, 0.04), marble);
    p2.position.y = 0.31;
    g.add(p1, p2);
    marbleParts.push(p1, p2);
    const ins = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.16), new THREE.MeshBasicMaterial({ map: textTex("ΤΑ ΕΦ' ΗΜΙΝ", { font: '600 70px "Times New Roman", Georgia, serif', color: '#5E5245', w: 1024, h: 128 }), transparent: true, depthWrite: false }));
    ins.position.set(0, 0.115, 0.862);
    g.add(ins);

    // fluted column body
    const col = new THREE.CylinderGeometry(R, R, 1.25, 96, 1, false);
    const pos = col.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r < 0.01) continue;
      const k = 1 - 0.045 * Math.pow(0.5 + 0.5 * Math.cos(a * 20), 3);
      pos.setXYZ(i, Math.cos(a) * r * k, pos.getY(i), Math.sin(a) * r * k);
    }
    col.computeVertexNormals();
    const body = new THREE.Mesh(col, marble);
    body.position.y = 0.4 + 0.625;
    g.add(body);
    marbleParts.push(body);

    // capital: echinus, abacus, volutes
    const ech = new THREE.Mesh(lathe([[R, 0], [R + 0.05, 0.05], [0.7, 0.12], [0.7, 0.14]]), marble);
    ech.position.y = 1.65;
    const aba = new THREE.Mesh(roundBox(1.52, 0.12, 1.34, 0.03), marble);
    aba.position.y = 1.85;
    g.add(ech, aba);
    marbleParts.push(ech, aba);
    for (const s of [-1, 1]) {
      const vol = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 12, 32), marble);
      vol.position.set(s * 0.74, 1.73, 0.46);
      const vol2 = vol.clone();
      vol2.position.z = -0.46;
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.92, 24), marble);
      roll.rotation.x = Math.PI / 2;
      roll.position.set(s * 0.74, 1.73, 0);
      g.add(vol, vol2, roll);
      marbleParts.push(vol, vol2, roll);
    }

    // globe seat and globe
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.1, 48), bronze);
    collar.position.y = 1.96;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 12, 64), bronze);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.02;
    g.add(collar, ring);
    bronzeParts.push(collar, ring);
    this.globe.position.y = 2.72;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.74, 48, 32), M.glass('#fffaf0', 0.13));
    glass.renderOrder = 2;
    this.globe.add(glass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.1, 24), bronze);
    neck.position.y = 0.78;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), bronze);
    finial.position.y = 0.88;
    this.globe.add(neck, finial);
    bronzeParts.push(neck, finial);
    this.buildPile();
    g.add(this.globe);

    // coin slot
    const coin = new THREE.Mesh(roundBox(0.3, 0.13, 0.05, 0.02), bronze);
    coin.position.set(0, 1.46, R - 0.005);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.02), M.basic('#140d06'));
    slot.position.set(0, 1.46, R + 0.02);
    g.add(coin, slot);
    bronzeParts.push(coin);

    // crank plate, laurel, crank
    this.plate = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 48), darkBronze);
    this.plate.rotation.x = Math.PI / 2;
    this.plate.position.set(0, 1.08, R + 0.01);
    g.add(this.plate);
    const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), patina, 28);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.055, 0.02, 0.018);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      q.setFromEuler(new THREE.Euler(0, 0, a + Math.PI / 2 + side * 0.5));
      m.compose(new THREE.Vector3(Math.cos(a) * 0.31, 1.08 + Math.sin(a) * 0.31, R + 0.03), q, s);
      leaves.setMatrixAt(i, m);
    }
    g.add(leaves);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 24), bronze);
    hub.rotation.x = Math.PI / 2;
    const bar = new THREE.Mesh(roundBox(0.44, 0.08, 0.06, 0.03), bronze);
    bar.position.x = 0.12;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 20), M.phys('#5B2A5C', { roughness: 0.3 }));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0.3, 0, 0.08);
    this.crank.add(hub, bar, knob);
    this.crank.position.set(0, 1.08, R + 0.07);
    g.add(this.crank);

    // chute and tray
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), M.basic('#0d0906'));
    mouth.position.set(0, 0.64, R + 0.004);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 12, 40), bronze);
    rim.position.set(0, 0.64, R + 0.01);
    const tray = new THREE.Mesh(lathe([[0.001, 0], [0.2, 0], [0.25, 0.03], [0.27, 0.085], [0.25, 0.09], [0.22, 0.04], [0.001, 0.035]]), bronze);
    tray.position.set(0, 0.4, 0.86);
    g.add(mouth, rim, tray);
    bronzeParts.push(rim, tray);

    g.add(contactShadow(2.8, 2.8, 0.45));
    mergeStatic(g, marbleParts);
    mergeStatic(g, bronzeParts);
  }

  warm() { return capsuleWarm(0.13, '#A8702F'); }

  private buildPile() {
    const n = 44, r = 0.118, inner = 0.74 - r - 0.015;
    const tops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }), n);
    const bots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#F6F1E6', roughness: 0.25, clearcoat: 1 }), n);
    const colors = ['#A8702F', '#2F7D6C', '#5B2A5C', '#EDE6D8', '#D6A13C', '#8B3A2E'].map((c) => new THREE.Color(c));
    // drop capsules one by one into the bowl and let each settle: gravity, then pushed out of the glass and out of
    // the capsules already resting along the contact normal. One landing on another's crown slides off it, so
    // they heap like real ones instead of stacking into a tower (a stepwise search could not roll off a curve).
    const pts: THREE.Vector3[] = [];
    const dt = 1 / 120, d = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.3;
      const p = new THREE.Vector3(Math.cos(a) * rr, 0.3, Math.sin(a) * rr), v = new THREE.Vector3();
      for (let k = 0; k < 480; k++) {
        v.y -= 4.9 * dt;
        p.addScaledVector(v, dt);
        const len = p.length();
        if (len > inner) { d.copy(p).divideScalar(len); p.copy(d).multiplyScalar(inner); v.addScaledVector(d, -Math.max(0, v.dot(d)) * 1.3); }
        for (const o of pts) {
          d.copy(p).sub(o);
          const dl = d.length();
          if (dl < 2 * r * 0.96 && dl > 1e-6) { d.divideScalar(dl); p.copy(o).addScaledVector(d, 2 * r * 0.96); v.addScaledVector(d, -Math.min(0, v.dot(d)) * 1.3); }
        }
        v.multiplyScalar(0.97); // friction: they come to rest
      }
      if (p.length() <= inner + 1e-3) pts.push(p);
    }
    const base: THREE.Matrix4[] = [];
    pts.forEach((p, i) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      const mm = new THREE.Matrix4().compose(p, q, new THREE.Vector3(r, r, r));
      base.push(mm);
      tops.setMatrixAt(i, mm);
      bots.setMatrixAt(i, mm);
      tops.setColorAt(i, colors[i % colors.length]);
    });
    tops.count = bots.count = pts.length;
    this.globe.add(tops, bots);
    this.pile = { tops, bots, base };
  }

  update(dt: number, t: number) {
    this.jiggle = Math.max(0, this.jiggle - dt * 1.8);
    if (this.jiggle > 0.001) {
      const m = new THREE.Matrix4(), off = new THREE.Matrix4();
      this.pile.base.forEach((b, i) => {
        const j = this.jiggle * 0.03;
        off.makeTranslation(Math.sin(t * 31 + i) * j, Math.abs(Math.sin(t * 23 + i * 1.7)) * j * 1.5, Math.cos(t * 27 + i) * j);
        m.multiplyMatrices(off, b);
        this.pile.tops.setMatrixAt(i, m);
        this.pile.bots.setMatrixAt(i, m);
      });
      this.pile.tops.instanceMatrix.needsUpdate = this.pile.bots.instanceMatrix.needsUpdate = true;
    }
    if (this.halo) this.halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  }

  // ---- gesture: drag the crank clockwise one full turn ----
  private screenCenter() {
    const w = new THREE.Vector3();
    this.crank.getWorldPosition(w);
    return this.stage.project(w, this.host!.camera);
  }

  pointerDown(ray: THREE.Raycaster, e: PointerEvent) {
    if (this.busy || !this.host) return false;
    if (!hits(ray, this.crank) && !hits(ray, this.plate)) return false;
    const c = this.screenCenter();
    this.lastAngle = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    this.dragging = true;
    sfx.tick();
    return true;
  }

  pointerMove(_ray: THREE.Raycaster, e: PointerEvent) {
    if (!this.dragging) return;
    const c = this.screenCenter();
    const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    let d = a - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.lastAngle = a;
    if (d <= 0) return; // the ratchet only lets it go clockwise
    this.advance(Math.min(d, 0.6));
  }

  pointerUp() { this.dragging = false; }

  private advance(d: number) {
    this.turned += d;
    this.crank.rotation.z -= d;
    this.jiggle = Math.min(1, this.jiggle + d * 0.9);
    while (this.turned >= this.nextClick) {
      sfx.ratchet(Math.round(this.nextClick * 10));
      haptic(6);
      this.nextClick += Math.PI / 6;
    }
    this.host?.progress(clamp(this.turned / (Math.PI * 2)));
    if (this.turned >= Math.PI * 2 - 1e-3 && !this.busy) { this.dragging = false; void this.complete(); }
  }

  async auto() {
    if (this.busy || !this.host) return;
    const start = this.turned;
    const need = Math.PI * 2 - start;
    let done = 0;
    await this.tween(1.25, (k) => {
      const target = need * k;
      const d = target - done;
      done = target;
      if (d > 0 && !this.busy) this.advance(d);
    }, ease.inOutCubic);
  }

  private async complete() {
    this.busy = true;
    this.host?.say(L(this.school.machine.busy));
    await this.finishGesture((f) => this.dispense(f), () => this.refuse());
  }

  private async refuse() {
    // the crank snaps back: the universe said no today
    const z = this.crank.rotation.z;
    sfx.stamp();
    await this.tween(0.5, (k) => { this.crank.rotation.z = z + Math.sin(k * Math.PI * 5) * 0.12 * (1 - k); });
    this.turned = 0; this.nextClick = 0;
    this.host?.progress(0);
  }

  private async dispense(finish: Finish): Promise<THREE.Vector3> {
    const cap = capsule(0.13, finishMaterial(finish, '#A8702F'));
    cap.position.set(0, 0.64, 0.4);
    cap.rotation.set(0.4, 0.3, 0.2);
    this.group.add(cap);
    this.out = cap;
    sfx.drop();
    await this.tween(0.28, (k) => { cap.position.z = 0.4 + k * 0.32; }, ease.outCubic);
    const y0 = 0.64, y1 = 0.54, z0 = 0.72, z1 = 0.86;
    let bounced = 0;
    await this.tween(0.75, (k) => {
      cap.position.y = y0 + (y1 - y0) * ease.outBounce(k);
      cap.position.z = z0 + (z1 - z0) * ease.outCubic(k);
      cap.rotation.x += 0.08;
      const b = k > 0.36 ? (k > 0.72 ? (k > 0.9 ? 3 : 2) : 1) : 0;
      if (b > bounced) { bounced = b; sfx.bounce(1 / b); haptic(8); }
    }, (x) => x);
    if (finish !== 'paper') {
      this.halo = halo(finish, 0.9);
      this.halo.position.copy(cap.position);
      this.group.add(this.halo);
      finish === 'gold' ? sfx.gold() : sfx.foil();
      await this.wait(0.45);
    }
    // crack the capsule: the top half lifts away as the card leaves
    const top = cap.userData.top as THREE.Mesh;
    sfx.pop();
    void this.tween(0.5, (k) => { top.position.y = k * 1.2; top.rotation.z = k * 0.9; top.visible = k < 0.95; }, ease.outCubic);
    const w = new THREE.Vector3();
    cap.getWorldPosition(w);
    return w;
  }

  reset() {
    if (this.out) this.group.remove(this.out);
    if (this.halo) this.group.remove(this.halo);
    this.out = null; this.halo = null;
    this.turned = 0; this.nextClick = 0; this.busy = false; this.dragging = false;
    this.host?.progress(0);
  }
}
