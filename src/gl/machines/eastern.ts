import * as THREE from 'three';
import { Machine, hits } from './base';
import { M, roundBox, lathe, contactShadow, bambooTex, textTex, halo, FINISHES, radialTex, ease, mergeStatic } from '../kit';
import { sfx, haptic } from '../../core/audio';
import type { Finish } from '../../core/store';
import { t } from '../../core/i18n';
import { L } from '../../content/schools';

// เซียมซี: fortune sticks in a bamboo cup on a lacquer altar, under a moon gate. Shake, and wait.
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const thaiNum = (n: number) => String(n).replace(/\d/g, (d) => THAI_DIGITS[+d]);

export class EasternMachine extends Machine {
  readonly height = 3.85; // the whole garden wall, tile cap and ridge included: nothing dark behind the motto
  readonly width = 2.3;
  private cup = new THREE.Group();
  private sticks!: THREE.InstancedMesh;
  private tips!: THREE.InstancedMesh;
  private stickBase: { pos: THREE.Vector3; rot: THREE.Euler }[] = [];
  private smoke: THREE.Sprite[] = [];
  private holding = false;
  private charge = 0;
  private shakeT = 0;
  private lastRattle = 0;
  private fallen: THREE.Group | null = null;
  private halo: THREE.Sprite | null = null;
  private done = false;

  build() {
    const g = this.group;
    const lacquer = M.phys('#6A1C14', { roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.18 });
    const gold = M.metal('#D9A33A', 0.3);
    const bronze = M.metal('#8A6A3A', 0.45);

    // moon gate: a round opening in a whitewashed garden wall, grey tile cap, bamboo beyond
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-2.5, 0); wallShape.lineTo(2.5, 0); wallShape.lineTo(2.5, 3.55); wallShape.lineTo(-2.5, 3.55); wallShape.lineTo(-2.5, 0);
    const hole = new THREE.Path();
    hole.absarc(0, 1.95, 1.36, 0, Math.PI * 2, true);
    wallShape.holes.push(hole);
    const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: 0.24, bevelEnabled: false, curveSegments: 72 }), M.std('#EFE8DA', { roughness: 0.96 }));
    wall.position.set(0, 0, -1.02);
    const plinthW = new THREE.Mesh(roundBox(5.02, 0.34, 0.3, 0.02), M.std('#9A958C', { roughness: 0.9 }));
    plinthW.position.set(0, 0.17, -0.9);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.055, 12, 120), M.std('#7F7A72', { roughness: 0.85 }));
    frame.position.set(0, 1.95, -0.77);
    const cap = new THREE.Mesh(roundBox(5.3, 0.14, 0.56, 0.05), M.std('#3F4245', { roughness: 0.65 }));
    cap.position.set(0, 3.62, -0.9);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.3, 12), M.std('#2F3134', { roughness: 0.6 }));
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, 3.72, -0.9);
    const sky = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,236,196,0.9)', 'rgba(240,226,200,0.2)'), transparent: true, depthWrite: false }));
    sky.position.set(0, 1.95, -1.9);
    g.add(wall, plinthW, frame, cap, ridge, sky);
    // parts that never move are drawn as one mesh per material (mergeStatic, at the end)
    const still: THREE.Mesh[] = [];
    const culmMat = M.std('#5E8A4E', { roughness: 0.6 });
    for (let k = 0; k < 7; k++) {
      const x = -1.1 + k * 0.36 + Math.sin(k * 7.3) * 0.08;
      const culm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 3.4, 10), culmMat);
      culm.position.set(x, 1.7, -1.55 - (k % 3) * 0.12);
      culm.rotation.z = Math.sin(k * 3.1) * 0.06;
      g.add(culm);
      still.push(culm);
      for (let n2 = 0; n2 < 4; n2++) {
        const node = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16), culmMat);
        node.rotation.x = Math.PI / 2;
        node.position.set(x, 0.6 + n2 * 0.75, culm.position.z);
        g.add(node);
        still.push(node);
      }
    }

    // altar table
    const top = new THREE.Mesh(roundBox(2.0, 0.1, 0.95, 0.03), lacquer);
    top.position.y = 0.97;
    const apron = new THREE.Mesh(roundBox(1.84, 0.16, 0.8, 0.02), lacquer);
    apron.position.y = 0.84;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.02, 0.02), gold);
    trim.position.set(0, 0.84, 0.405);
    g.add(top, apron, trim);
    still.push(top, apron, trim);
    for (const x of [-0.86, 0.86]) for (const z of [-0.36, 0.36]) {
      const leg = new THREE.Mesh(roundBox(0.1, 0.8, 0.1, 0.03), lacquer);
      leg.position.set(x, 0.4, z);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), gold);
      foot.position.set(x + Math.sign(x) * 0.02, 0.05, z + Math.sign(z) * 0.02);
      g.add(leg, foot);
      still.push(leg, foot);
    }

    // the cup: bamboo, a red band, the character 籤
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.62, 40, 1, true), new THREE.MeshStandardMaterial({ map: bambooTex(), roughness: 0.55, side: THREE.DoubleSide }));
    tube.position.y = 0.31;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), M.std('#6b4a22'));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.02;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.14, 40, 1, true), lacquer);
    band.position.y = 0.34;
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: textTex('籤', { font: '700 200px "Noto Serif TC", "Noto Serif SC", serif', color: '#F2C66D', w: 256, h: 256 }), transparent: true }));
    ch.position.set(0, 0.34, 0.207);
    const rimTop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), gold);
    rimTop.rotation.x = Math.PI / 2;
    rimTop.position.y = 0.62;
    this.cup.add(tube, bottom, band, ch, rimTop);
    // sticks, instanced: body + red tip
    const n = 30;
    this.sticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.024, 0.78, 0.008), M.std('#D8B77A', { roughness: 0.7 }), n);
    this.tips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.026, 0.1, 0.01), M.std('#C8412B', { roughness: 0.5 }), n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.12;
      this.stickBase.push({ pos: new THREE.Vector3(Math.cos(a) * r, 0.42 + Math.random() * 0.06, Math.sin(a) * r), rot: new THREE.Euler((Math.random() - 0.5) * 0.28, Math.random() * 3, (Math.random() - 0.5) * 0.28) });
    }
    this.layoutSticks(0);
    this.cup.add(this.sticks, this.tips);
    this.cup.position.set(0, 1.02, 0.05);
    g.add(this.cup);

    // incense burner (ding) with three sticks and smoke
    const ding = new THREE.Mesh(lathe([[0.001, 0], [0.16, 0.02], [0.2, 0.12], [0.19, 0.2], [0.21, 0.22], [0.001, 0.2]]), bronze);
    ding.position.set(0.66, 1.02, 0.12);
    g.add(ding);
    const incMat = M.std('#7a2d1d'), emberMat = M.basic('#ff7a2a');
    for (let i = 0; i < 3; i++) {
      const x = 0.66 + (i - 1) * 0.05;
      const inc = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 6), incMat);
      inc.position.set(x, 1.43, 0.12);
      inc.rotation.z = (i - 1) * 0.08;
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), emberMat);
      ember.position.set(x + (i - 1) * 0.017, 1.645, 0.12);
      g.add(inc, ember);
      still.push(inc, ember);
    }
    const smokeMat = new THREE.SpriteMaterial({ map: radialTex('rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'), transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData.life = Math.random();
      this.smoke.push(s);
      g.add(s);
    }
    // lotus
    const lotus = new THREE.Group();
    const petals = [M.phys('#F3B6C2', { roughness: 0.5, clearcoat: 0.3 }), M.phys('#F8D4DA', { roughness: 0.5, clearcoat: 0.3 })];
    for (let i = 0; i < 10; i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), petals[i < 5 ? 0 : 1]);
      const a = (i / 5) * Math.PI * 2 + (i < 5 ? 0 : 0.6);
      const r = i < 5 ? 0.09 : 0.05;
      petal.scale.set(0.035, 0.075, 0.018);
      petal.position.set(Math.cos(a) * r, 0.06 + (i < 5 ? 0 : 0.02), Math.sin(a) * r);
      petal.rotation.set(0, -a, i < 5 ? 0.9 : 0.5);
      lotus.add(petal);
      still.push(petal);
    }
    const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 32), M.std('#3E7A57', { roughness: 0.6 }));
    leaf.position.y = 0.01;
    lotus.add(leaf);
    lotus.position.set(-0.64, 1.02, 0.14);
    g.add(lotus);
    g.add(contactShadow(3, 2, 0.4));
    mergeStatic(g, still);
  }

  private layoutSticks(shake: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tipOff = new THREE.Vector3();
    this.stickBase.forEach((b, i) => {
      const e = new THREE.Euler(b.rot.x + Math.sin(this.shakeT * 40 + i) * 0.08 * shake, b.rot.y, b.rot.z + Math.cos(this.shakeT * 37 + i * 1.3) * 0.08 * shake);
      q.setFromEuler(e);
      const p = b.pos.clone();
      p.y += Math.abs(Math.sin(this.shakeT * 50 + i * 2.1)) * 0.035 * shake;
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      this.sticks.setMatrixAt(i, m);
      tipOff.set(0, 0.36, 0).applyQuaternion(q).add(p);
      m.compose(tipOff, q, new THREE.Vector3(1, 1, 1));
      this.tips.setMatrixAt(i, m);
    });
    this.sticks.instanceMatrix.needsUpdate = this.tips.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, t: number, near: boolean) {
    // incense smoke drifts up and curls
    if (near) this.smoke.forEach((s, i) => {
      let life = (s.userData.life as number) + dt * 0.18;
      if (life > 1) life = 0;
      s.userData.life = life;
      s.position.set(0.66 + Math.sin(t * 0.7 + i) * 0.06 * life + life * 0.08, 1.66 + life * 1.1, 0.12 + Math.cos(t * 0.5 + i) * 0.04);
      s.scale.setScalar(0.08 + life * 0.35);
      s.material.opacity = Math.sin(life * Math.PI) * 0.22;
    });
    if (this.done) return;
    // shaking: holding (or a phone shake) charges; letting go settles
    if (this.holding) this.charge = Math.min(1, this.charge + dt / 1.7);
    else this.charge = Math.max(0, this.charge - dt * 0.35);
    const active = this.holding || this.charge > 0.02;
    if (active) {
      this.shakeT += dt;
      const s = this.holding ? 1 : this.charge;
      this.cup.rotation.x = -0.45 * Math.min(1, s * 1.4) + Math.sin(this.shakeT * 28) * 0.06 * s;
      this.cup.rotation.z = Math.sin(this.shakeT * 21) * 0.05 * s;
      this.layoutSticks(s);
      if (t - this.lastRattle > 0.09 && this.holding) { this.lastRattle = t; sfx.rattle(); haptic(5); }
      this.host?.progress(this.charge);
      if (this.charge >= 1 && !this.busy) { this.holding = false; void this.complete(); }
    } else if (!this.busy) {
      this.cup.rotation.x *= 0.9;
      this.cup.rotation.z *= 0.9;
    }
    if (this.halo) this.halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  }

  pointerDown(ray: THREE.Raycaster) {
    if (this.busy || !this.host) return false;
    if (!hits(ray, this.group)) return false;
    this.holding = true;
    return true;
  }
  pointerUp() { this.holding = false; }

  shake(strength: number) {
    if (this.busy || !this.host || this.done) return;
    this.charge = Math.min(1, this.charge + 0.12 + strength * 0.2);
    this.shakeT += 0.05;
    sfx.rattle();
    if (this.charge >= 1) void this.complete();
  }

  async auto() {
    if (this.busy || !this.host) return;
    this.holding = true;
    await this.tween(1.8, () => { if (this.busy) this.holding = false; });
    this.holding = false;
  }

  private async complete() {
    if (this.busy) return;
    this.busy = true;
    this.holding = false;
    this.host?.say(L(this.school.machine.busy));
    await this.finishGesture((f) => this.dispense(f), () => this.refuse());
  }

  private async refuse() {
    sfx.stamp();
    await this.tween(0.6, (k) => { this.cup.rotation.x = -0.3 * (1 - k); this.layoutSticks(1 - k); });
    this.charge = 0;
    this.host?.progress(0);
  }

  /** One fortune stick as a pull draws it: the body in the card's finish, the red tip, its number. */
  private stick(finish: Finish, n: number, keep = true) {
    const stick = new THREE.Group();
    const bodyMat = finish === 'gold' ? M.metal('#E7B54A', 0.2) : finish === 'foil' ? new THREE.MeshPhysicalMaterial({ color: '#EDE8F7', metalness: 0.5, roughness: 0.15, iridescence: 1, iridescenceIOR: 1.35 }) : M.std('#E2C58D', { roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.016), bodyMat);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.12, 0.018), M.std('#C8412B'));
    tip.position.y = 0.37;
    // a stick made only to be compiled keeps no number texture (painted before its font has loaded, a kept one would stay wrong)
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.14), new THREE.MeshBasicMaterial({ map: textTex(thaiNum(n), { font: '700 150px "Noto Serif Thai", serif', color: '#8a1d10', w: 128, h: 384, ...(keep ? {} : { cache: false }) }), transparent: true }));
    label.position.set(0, 0.05, 0.0095);
    stick.add(body, tip, label);
    return stick;
  }

  warm() { return [...FINISHES.map((f) => this.stick(f, 1, false)), halo('foil', 1)]; }

  private async dispense(finish: Finish): Promise<THREE.Vector3> {
    this.done = true;
    const n = 1 + ((Math.random() * 28) | 0);
    // one stick slides out of the tilted cup and drops on the table
    const stick = this.stick(finish, n);
    const start = new THREE.Vector3(0, 1.62, 0.25);
    stick.position.copy(start);
    stick.rotation.set(-0.45, 0, 0);
    this.group.add(stick);
    this.fallen = stick;
    sfx.wood(0.8);
    await this.tween(0.35, (k) => { stick.position.y = start.y + k * 0.18; stick.position.z = start.z + k * 0.15; }, ease.outCubic);
    const end = new THREE.Vector3(0.12, 1.035, 0.42);
    let b = 0;
    await this.tween(0.7, (k) => {
      stick.position.x = start.x + (end.x - start.x) * k;
      stick.position.y = start.y + 0.18 + (end.y - start.y - 0.18) * ease.outBounce(k);
      stick.position.z = start.z + 0.15 + (end.z - start.z - 0.15) * k;
      stick.rotation.x = -0.45 + (-Math.PI / 2 + 0.45) * ease.outCubic(k);
      stick.rotation.z = k * 0.9;
      const nb = k > 0.36 ? (k > 0.72 ? 2 : 1) : 0;
      if (nb > b) { b = nb; sfx.wood(1 / nb); haptic(8); }
    }, (x) => x);
    await this.tween(0.4, (k) => { this.cup.rotation.x = -0.45 * (1 - k); this.layoutSticks(0); });
    if (finish !== 'paper') {
      this.halo = halo(finish, 1.1);
      this.halo.position.copy(stick.position);
      this.group.add(this.halo);
      finish === 'gold' ? sfx.gold() : sfx.foil();
    }
    this.host?.say(t(`ไม้เลขที่ ${thaiNum(n)}`, `Stick number ${n}`));
    await this.wait(0.55);
    const w = new THREE.Vector3();
    stick.getWorldPosition(w);
    return w;
  }

  reset() {
    if (this.fallen) this.group.remove(this.fallen);
    if (this.halo) this.group.remove(this.halo);
    this.fallen = this.halo = null;
    this.busy = false;
    this.done = false;
    this.charge = 0;
    this.holding = false;
    this.host?.progress(0);
  }
}

