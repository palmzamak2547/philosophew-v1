import * as THREE from 'three';
import { Machine, hits } from './base';
import { M, roundBox, lathe, contactShadow, textTex, textAtlas, uvInto, halo, FINISHES, ease, mergeStatic, Copies } from '../kit';
import { sfx, haptic } from '../../core/audio';
import type { Finish } from '../../core/store';
import { t } from '../../core/i18n';

// The Kleroterion: Athens' allotment machine. A white ball chooses the row; the row gives you a token.
// The tokens resting in the slots are one instanced draw: each slot has an anchor that is visible while it holds a token.
const COLS = 5, ROWS = 9;
const GREEK = 'ΑΒΓΔΕΖΗΘΙ';
const TOKEN = roundBox(0.17, 0.045, 0.07, 0.01, 2);

export class SocraticMachine extends Machine {
  readonly height = 3.45;
  readonly width = 2.05;
  private tokens: THREE.Object3D[][] = []; // slot anchors; visible = a token rests there
  private tokenCopies!: Copies;
  private rowGlow: THREE.Mesh[] = [];
  private funnel!: THREE.Mesh;
  private ball: THREE.Mesh | null = null;
  private owlEyes: THREE.Mesh[] = [];
  private owl = new THREE.Group();
  private row = 0;
  private blacks = 0;
  private drops = 0;
  private dropping = false;
  private picked: THREE.Mesh | null = null;
  private halo: THREE.Sprite | null = null;
  private readonly TX = 0.98;

  build() {
    const g = this.group;
    const marble = M.marble('#F1F2F3', '#9AA5B1', 3.1);
    const bronze = M.metal('#A9773A', 0.32);
    // parts that never move are drawn as one mesh per material (mergeStatic, at the end)
    const still: THREE.Mesh[] = [], owlStill: THREE.Mesh[] = [];
    const plinth = new THREE.Mesh(roundBox(1.9, 0.2, 0.7, 0.03), marble);
    plinth.position.y = 0.1;
    const slab = new THREE.Mesh(roundBox(1.56, 2.5, 0.3, 0.03), marble);
    slab.position.y = 0.2 + 1.25;
    g.add(plinth, slab);
    // frieze + pediment
    const frieze = new THREE.Mesh(roundBox(1.72, 0.2, 0.38, 0.02), marble);
    frieze.position.y = 2.8;
    const ins = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.15), new THREE.MeshBasicMaterial({ map: textTex('ΓΝΩΘΙ ΣΑΥΤΟΝ', { font: '600 76px "Times New Roman", Georgia, serif', color: '#4A5A6C', w: 1024, h: 110 }), transparent: true, depthWrite: false }));
    ins.position.set(0, 2.8, 0.192);
    const tri = new THREE.Shape();
    tri.moveTo(-0.9, 0); tri.lineTo(0.9, 0); tri.lineTo(0, 0.4); tri.lineTo(-0.9, 0);
    const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.36, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), marble);
    ped.geometry.translate(0, 0, -0.18);
    ped.position.y = 2.9;
    g.add(frieze, ins, ped);
    still.push(plinth, slab, frieze, ped);

    // slots and tokens (pinakia); the row letters share one texture
    const slotMat = M.std('#26303a', { roughness: 0.9 });
    const letters = textAtlas([...GREEK], { font: '600 90px "Times New Roman", serif', color: '#5a6a7c', w: 128, h: 128 }, 3);
    const letterMat = new THREE.MeshBasicMaterial({ map: letters.tex, transparent: true });
    for (let r = 0; r < ROWS; r++) {
      const row: THREE.Object3D[] = [];
      const y = 2.48 - r * 0.215;
      const label = new THREE.Mesh(uvInto(new THREE.PlaneGeometry(0.1, 0.1), letters.cell(r)), letterMat);
      label.position.set(-0.7, y, 0.152);
      g.add(label);
      still.push(label);
      const glowRow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.16), new THREE.MeshBasicMaterial({ color: '#FFD98A', transparent: true, opacity: 0, depthWrite: false }));
      glowRow.position.set(0.02, y, 0.153);
      glowRow.visible = false; // drawn only while it glows (see beforeRender)
      this.rowGlow.push(glowRow);
      g.add(glowRow);
      for (let c = 0; c < COLS; c++) {
        const x = -0.48 + c * 0.25;
        const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.055), slotMat);
        slot.position.set(x, y, 0.151);
        g.add(slot);
        still.push(slot);
        const tok = new THREE.Object3D();
        tok.position.set(x, y, 0.16);
        tok.visible = Math.random() < 0.72;
        g.add(tok);
        row.push(tok);
      }
      this.tokens.push(row);
    }
    this.tokenCopies = new Copies(TOKEN, M.metal('#B98441', 0.35), this.tokens.flat(), g);
    g.add(this.tokenCopies);

    // the tube: glass with bronze rings, a funnel on top, a cup below
    const X = this.TX;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.05, 24, 1, true), M.glass('#eaf4ff', 0.2));
    tube.position.set(X, 1.55, 0.05);
    g.add(tube);
    for (let i = 0; i <= 5; i++) {
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 24), bronze);
      ringM.rotation.x = Math.PI / 2;
      ringM.position.set(X, 0.53 + i * 0.41, 0.05);
      g.add(ringM);
      still.push(ringM);
    }
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), bronze);
    bracket.position.set(X - 0.12, 2.2, 0.05);
    const bracket2 = bracket.clone(); bracket2.position.y = 0.9;
    this.funnel = new THREE.Mesh(lathe([[0.065, 0], [0.09, 0.08], [0.22, 0.3], [0.24, 0.32]], 40), new THREE.MeshStandardMaterial({ color: '#A9773A', metalness: 1, roughness: 0.3, side: THREE.DoubleSide }));
    this.funnel.position.set(X, 2.58, 0.05);
    const cup = new THREE.Mesh(lathe([[0.001, 0], [0.1, 0], [0.13, 0.08], [0.12, 0.09], [0.09, 0.02], [0.001, 0.02]]), bronze);
    cup.position.set(X, 0.2, 0.2);
    g.add(bracket, bracket2, this.funnel, cup);
    still.push(bracket, bracket2, cup);
    // a few resting balls in the funnel
    const balls = [M.phys('#f6f6f2', { roughness: 0.25 }), M.phys('#111', { roughness: 0.3 })];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), balls[i % 2]);
      const a = i * 1.6;
      b.position.set(X + Math.cos(a) * 0.12, 2.76 + (i % 2) * 0.02, 0.05 + Math.sin(a) * 0.12);
      g.add(b);
      still.push(b);
    }

    // the owl of Athena keeps an eye on the proceedings
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), bronze);
    body.scale.set(1, 1.25, 0.9);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), M.metal('#C9A15E', 0.4));
    belly.scale.set(1, 1.2, 0.5);
    belly.position.set(0, -0.03, 0.09);
    this.owl.add(body, belly);
    owlStill.push(body);
    for (const x of [-0.06, 0.06]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), M.basic('#FFF8E6'));
      white.position.set(x, 0.07, 0.11);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), M.basic('#1a1410'));
      pupil.position.set(x, 0.07, 0.155);
      this.owlEyes.push(white, pupil);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 8), bronze);
      tuft.position.set(x * 1.5, 0.19, 0);
      tuft.rotation.z = -x * 4;
      this.owl.add(white, pupil, tuft);
      owlStill.push(tuft);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), M.basic('#E6A43A'));
    beak.rotation.x = Math.PI;
    beak.position.set(0, 0.02, 0.15);
    this.owl.add(beak);
    this.owl.position.set(0, 3.47, 0);
    g.add(this.owl);
    g.add(contactShadow(2.9, 1.8, 0.45));
    mergeStatic(g, still);
    mergeStatic(this.owl, owlStill); // the owl turns as one: body and ear tufts together
    g.updateMatrixWorld(true);
    this.beforeRender();
  }

  beforeRender() {
    this.tokenCopies.sync();
    for (const r of this.rowGlow) r.visible = (r.material as THREE.MeshBasicMaterial).opacity > 0; // at 0 it drew nothing anyway
  }

  update(_dt: number, t: number) {
    const blink = (t % 5.3) < 0.14 ? 0.1 : 1;
    this.owlEyes.forEach((e) => (e.scale.y = blink));
    this.owl.rotation.y = Math.sin(t * 0.6) * 0.35 + (this.ball ? Math.sin(t * 3) * 0.1 : 0);
    this.owl.rotation.z = Math.sin(t * 0.9) * 0.05;
    if (this.halo) this.halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  }

  pointerDown(ray: THREE.Raycaster) {
    if (this.busy || this.dropping || !this.host || !hits(ray, this.group)) return false;
    void this.dropOne();
    return true;
  }

  async auto() {
    if (this.busy || !this.host) return;
    while (!this.busy && this.host) {
      if (!this.dropping) await this.dropOne();
      await this.wait(0.15);
    }
  }

  private highlight(r: number, on: boolean) {
    const m = this.rowGlow[r].material as THREE.MeshBasicMaterial;
    const from = m.opacity, to = on ? 0.35 : 0;
    void this.tween(0.25, (k) => { m.opacity = from + (to - from) * k; });
  }

  private async dropOne() {
    if (this.dropping || this.busy) return;
    this.dropping = true;
    if (this.drops === 0) {
      this.row = (Math.random() * (ROWS - 3)) | 0;
      this.blacks = (Math.random() * 3) | 0;
      this.highlight(this.row, true);
    }
    const white = this.drops >= this.blacks;
    this.drops++;
    const X = this.TX;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), white ? M.phys('#f7f7f3', { roughness: 0.2 }) : M.phys('#111', { roughness: 0.28 }));
    ball.position.set(X + 0.16, 2.9, 0.05);
    this.group.add(ball);
    this.ball = ball;
    sfx.glass();
    // spiral down the funnel
    await this.tween(0.5, (k) => {
      const a = k * Math.PI * 3, r = 0.16 * (1 - k) + 0.01;
      ball.position.set(X + Math.cos(a) * r, 2.9 - k * 0.3, 0.05 + Math.sin(a) * r);
    }, (x) => x);
    // fall down the tube, tapping the rings
    let taps = 0;
    await this.tween(0.55, (k) => {
      ball.position.set(X, 2.6 - k * 2.3, 0.05);
      const tIdx = Math.floor(k * 5);
      if (tIdx > taps) { taps = tIdx; sfx.tick(); }
    }, (x) => x * x);
    await this.tween(0.25, (k) => { ball.position.set(X, 0.3 - Math.sin(k * Math.PI) * 0.06 + (1 - k) * 0.02, 0.05 + k * 0.15); }, ease.outCubic);
    sfx.bounce(0.7);
    haptic(8);
    this.host?.progress(this.drops / (this.blacks + 1));
    if (!white) {
      this.host?.say(t(`ลูกดำ แถว ${GREEK[this.row]} ไม่ได้รับเลือก`, `Black ball. Row ${GREEK[this.row]} is dismissed.`));
      this.highlight(this.row, false);
      this.row++;
      this.highlight(this.row, true);
      await this.wait(0.35);
      this.group.remove(ball);
      this.ball = null;
      this.dropping = false;
      return;
    }
    this.host?.say(t(`ลูกขาว แถว ${GREEK[this.row]} ได้รับเลือก`, `White ball! Row ${GREEK[this.row]} is chosen.`));
    this.busy = true;
    this.dropping = false;
    await this.finishGesture((f) => this.dispense(f), () => this.refuse());
  }

  private async refuse() {
    sfx.stamp();
    this.host?.say(t('ไฟวันนี้หมดแล้ว', 'No flames left today'));
    this.highlight(this.row, false);
    if (this.ball) this.group.remove(this.ball);
    this.ball = null;
    this.drops = 0;
    this.host?.progress(0);
  }

  /** The token that flies out, in the card's finish. */
  private token(finish: Finish) {
    return new THREE.Mesh(TOKEN, finish === 'gold' ? M.metal('#E7B54A', 0.18)
      : finish === 'foil' ? new THREE.MeshPhysicalMaterial({ color: '#E8E4F2', metalness: 0.6, roughness: 0.15, iridescence: 1, iridescenceIOR: 1.35 })
      : (this.tokenCopies.material as THREE.Material));
  }

  warm() { return [...FINISHES.map((f) => this.token(f)), halo('foil', 1)]; }

  private async dispense(finish: Finish): Promise<THREE.Vector3> {
    const row = this.tokens[this.row];
    const idx = Math.max(0, row.findIndex((s) => s.visible)); // an empty row still sends someone, from its first slot
    row[idx].visible = false; // the resting copy leaves; a token of its own flies out
    const tok = this.token(finish);
    tok.position.copy(row[idx].position);
    this.group.add(tok);
    this.picked = tok;
    const from = tok.position.clone();
    const to = new THREE.Vector3(0.1, 1.45, 0.75);
    sfx.drop();
    await this.tween(0.25, (k) => { tok.position.z = from.z + k * 0.2; }, ease.outCubic);
    await this.tween(0.6, (k) => {
      tok.position.lerpVectors(new THREE.Vector3(from.x, from.y, from.z + 0.2), to, ease.inOutCubic(k));
      tok.rotation.set(k * Math.PI * 2, 0, Math.sin(k * Math.PI) * 0.4);
      tok.scale.setScalar(1 + k * 1.2);
    }, (x) => x);
    if (finish !== 'paper') {
      this.halo = halo(finish, 0.9);
      this.halo.position.copy(tok.position);
      this.group.add(this.halo);
      finish === 'gold' ? sfx.gold() : sfx.foil();
      await this.wait(0.4);
    }
    const w = new THREE.Vector3();
    tok.getWorldPosition(w);
    return w;
  }

  reset() {
    if (this.picked) this.group.remove(this.picked);
    if (this.ball) this.group.remove(this.ball);
    if (this.halo) this.group.remove(this.halo);
    this.picked = this.ball = this.halo = null;
    this.rowGlow.forEach((r) => ((r.material as THREE.MeshBasicMaterial).opacity = 0));
    // refill the emptied slot so the stone never runs out of citizens
    this.tokens.forEach((row) => row.forEach((slot) => {
      if (slot.visible || Math.random() > 0.5) return;
      slot.visible = true;
    }));
    this.drops = 0;
    this.busy = false;
    this.dropping = false;
    this.host?.progress(0);
  }
}
