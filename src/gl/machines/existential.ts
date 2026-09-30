import * as THREE from 'three';
import { Machine, hits } from './base';
import { M, roundBox, contactShadow, capsule, capsuleCopies, finishMaterial, capsuleWarm, halo, textTex, textAtlas, uvInto, glow, ease, mergeStatic, mergeAll, Copies } from '../kit';
import { sfx, haptic } from '../../core/audio';
import type { Finish } from '../../core/store';
import { t } from '../../core/i18n';
import { L } from '../../content/schools';

// Le Distributeur: an Art Deco cabinet with twelve windows. The machine never chooses for you.
// Each window is a group of plain anchors the animations move (the capsule turns, the door swings, the button
// presses, the whole window shakes when it refuses); what is drawn are instanced copies that follow them, one
// draw call per part for all twelve windows instead of thirteen draw calls per window.
interface Cell { g: THREE.Group; door: THREE.Object3D; cap: THREE.Object3D; button: THREE.Object3D; n: number; empty: boolean }

// Layout, bottom to top: plinth (with the maker's plaque), tray and collection door, belt, then four rows of
// windows, each with its number plate and button underneath, clear of the next row, the belt and the plaque.
const W = 1.8, D = 0.8;
const CW = 0.46, CH = 0.335; // a window, between the centres of its frame bars
const GX = 0.075; // air between columns
const PITCH = 0.455; // row to row: window, plate, and air on both sides of the plate
const TOP_ROW = 2.46; // centre of the top row
const PLATE_Y = -(CH / 2 + 0.0125 + 0.01 + 0.0375); // number plate centre, just under the window frame
const CAP_R = 0.125;
const CAP_COLORS = ['#E3363F', '#C9A45C', '#EDE6D8', '#3A3940'];
const _c = new THREE.Color();

export class ExistentialMachine extends Machine {
  readonly height = 3.55;
  readonly width = 2.0;
  private cells: Cell[] = [];
  private parts: Copies[] = [];
  private lamps!: Copies;
  private neon!: THREE.Mesh;
  private neonGlow!: THREE.Sprite;
  private redLight: THREE.PointLight | null = null;
  private flicker = 0;
  private asked = false;
  private chosen: Cell | null = null;
  private out: THREE.Group | null = null;
  private halo: THREE.Sprite | null = null;
  private pulse = 0;

  build() {
    const g = this.group;
    const lacquer = M.phys('#141317', { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
    const brass = M.metal('#C9A45C', 0.28);
    const lacquerParts: THREE.Mesh[] = [], brassParts: THREE.Mesh[] = [];
    const add = (list: THREE.Mesh[], m: THREE.Mesh) => { list.push(m); g.add(m); return m; };

    add(lacquerParts, new THREE.Mesh(roundBox(W + 0.14, 0.22, D + 0.12, 0.04), lacquer)).position.y = 0.11; // plinth
    add(lacquerParts, new THREE.Mesh(roundBox(W, 2.5, D, 0.05), lacquer)).position.y = 0.22 + 1.25; // body
    // brass trim: verticals, belts (base, under the windows, top)
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) add(brassParts, new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.46, 0.035), brass)).position.set(x, 1.47, D / 2);
    for (const y of [0.24, 0.79, 2.7]) add(brassParts, new THREE.Mesh(new THREE.BoxGeometry(W, 0.035, 0.035), brass)).position.set(0, y, D / 2 + 0.005);
    // stepped Deco crown
    [1.62, 1.3, 0.94].forEach((w, i) => {
      add(i === 1 ? brassParts : lacquerParts, new THREE.Mesh(roundBox(w, 0.13, D - i * 0.12, 0.03), i === 1 ? brass : lacquer)).position.y = 2.79 + i * 0.13;
    });
    // sunburst fan on the crown face
    for (let i = 0; i < 9; i++) {
      const ray = add(brassParts, new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.34, 0.01), brass));
      ray.position.set(0, 2.83, D / 2 - 0.05);
      ray.geometry.translate(0, 0.17, 0);
      ray.rotation.z = (i - 4) * 0.28;
    }

    // neon sign
    const board = new THREE.Mesh(roundBox(1.5, 0.46, 0.06, 0.03), M.std('#0b0a0c', { roughness: 0.8 }));
    board.position.set(0, 3.43, 0);
    g.add(board);
    this.neon = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: textTex('Choisis.', { font: 'italic 700 104px "Fraunces", Georgia, serif', color: '#FFD6D9', glow: '#FF2E3A', w: 1024, h: 256 }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.neon.position.set(0, 3.43, 0.04);
    this.neonGlow = glow('rgba(255,50,64,0.8)', 2.4, 0.5);
    this.neonGlow.position.set(0, 3.43, 0.2);
    g.add(this.neon, this.neonGlow); // the red light itself belongs to the gallery (see gallery.ts)

    // twelve windows, 3 x 4: anchors and an invisible box to tap
    const hitGeo = new THREE.BoxGeometry(CW + 0.03, CH / 2 + 0.0125 - PLATE_Y + 0.0375, 0.24);
    const hitMat = new THREE.MeshBasicMaterial();
    const panes: THREE.Object3D[] = [];
    let n = 1;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = new THREE.Group();
        cell.position.set((c - 1) * (CW + GX), TOP_ROW - r * PITCH, D / 2);
        const cap = new THREE.Object3D();
        cap.position.set(0, -0.03, -0.09);
        cap.rotation.set(0.3, Math.random() * 3, 0.2);
        cap.scale.setScalar(CAP_R);
        const door = new THREE.Object3D();
        door.position.x = -CW / 2; // hinge on the left
        const pane = new THREE.Object3D();
        pane.position.set(CW / 2, 0, 0.02);
        door.add(pane);
        const button = new THREE.Object3D();
        button.rotation.x = Math.PI / 2;
        button.position.set(CW / 2 - 0.05, PLATE_Y, 0.02);
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.visible = false; // never drawn, only tapped
        hit.position.set(0, (CH / 2 + 0.0125 + PLATE_Y - 0.0375) / 2, -0.08);
        cell.add(cap, door, button, hit);
        cell.userData.cell = n;
        g.add(cell);
        this.cells.push({ g: cell, door, cap, button, n, empty: false });
        panes.push(pane);
        n++;
      }
    }
    const cells = this.cells.map((c) => c.g);
    // the compartment, the lamp strip at its top, the brass frame with the number plate's backing, the number
    const back = new THREE.BoxGeometry(CW, CH, 0.2).translate(0, 0, -0.1);
    const lamp = new THREE.PlaneGeometry(CW * 0.9, 0.03).translate(0, CH / 2 - 0.03, -0.01);
    const frame = mergeAll([
      new THREE.BoxGeometry(CW + 0.03, 0.025, 0.03).translate(0, CH / 2, 0),
      new THREE.BoxGeometry(CW + 0.03, 0.025, 0.03).translate(0, -CH / 2, 0),
      new THREE.BoxGeometry(0.025, CH, 0.03).translate(-CW / 2, 0, 0),
      new THREE.BoxGeometry(0.025, CH, 0.03).translate(CW / 2, 0, 0),
      roundBox(0.17, 0.075, 0.02, 0.01).translate(-CW / 2 + 0.11, PLATE_Y, 0.01),
    ]);
    const numbers = textAtlas(this.cells.map((x) => String(x.n)), { font: '700 84px "Bricolage Grotesque", Arial, sans-serif', color: '#1a1410', w: 256, h: 128 }, 4);
    const plate = uvInto(new THREE.PlaneGeometry(0.15, 0.075), numbers.cell(0)).translate(-CW / 2 + 0.11, PLATE_Y, 0.022);
    const first = numbers.cell(0);
    plate.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(this.cells.flatMap((_, i) => { const k = numbers.cell(i); return [k[0] - first[0], k[1] - first[1]]; })), 2));
    const plateMat = new THREE.MeshBasicMaterial({ map: numbers.tex, transparent: true });
    plateMat.onBeforeCompile = (s) => {
      s.vertexShader = 'attribute vec2 aCell;\n' + s.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv += aCell; // this copy\'s number in the atlas');
    };
    // one white top material, each copy tinted with the colour its own material used to carry
    const capsules = capsuleCopies(g, this.cells.map((x) => x.cap), M.phys('#ffffff', { roughness: 0.3 }));
    this.cells.forEach((_, i) => capsules[0].setColorAt(i, _c.set(CAP_COLORS[(Math.floor(i / 3) + (i % 3)) % 4])));
    this.lamps = new Copies(lamp, M.basic('#ffffff'), cells, g);
    this.cells.forEach((_, i) => this.lamps.setColorAt(i, _c.setScalar(0.75)));
    this.parts = [
      new Copies(back, M.std('#5a2230', { roughness: 0.95, side: THREE.BackSide }), cells, g),
      this.lamps,
      new Copies(frame, brass, cells, g),
      ...capsules,
      new Copies(new THREE.PlaneGeometry(CW - 0.02, CH - 0.02), M.glass('#fff3e6', 0.14), panes, g),
      new Copies(plate, plateMat, cells, g),
      new Copies(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 18), M.phys('#E3363F', { roughness: 0.25 }), this.cells.map((x) => x.button), g),
    ];
    g.add(...this.parts);

    // collection door, and the maker's plaque on the plinth
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.33), M.basic('#070607'));
    mouth.position.set(0, 0.555, D / 2 + 0.003);
    add(brassParts, new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.03, 0.05), brass)).position.set(0, 0.735, D / 2 + 0.01); // flap rim
    add(brassParts, new THREE.Mesh(roundBox(1.0, 0.05, 0.28, 0.02), brass)).position.set(0, 0.4, D / 2 + 0.13); // tray lip
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.09), new THREE.MeshBasicMaterial({ map: textTex('N° 1945', { font: '600 64px "Fraunces", Georgia, serif', color: '#C9A45C', w: 512, h: 96 }), transparent: true }));
    plaque.position.set(0, 0.11, (D + 0.12) / 2 + 0.004);
    g.add(mouth, plaque);
    g.add(contactShadow(2.9, 2.2, 0.55));
    mergeStatic(g, lacquerParts);
    mergeStatic(g, brassParts);
    g.updateMatrixWorld(true);
    this.beforeRender();
  }

  warm() { return capsuleWarm(0.12, '#E3363F'); }

  beforeRender() {
    for (const p of this.parts) p.sync();
  }

  update(dt: number, t: number, near: boolean) {
    // neon: mostly steady, sometimes a nervous flicker
    this.flicker -= dt;
    let k = 1;
    if (this.flicker < 0) {
      // the sign buzzes when you stand near it, never under the lamp's curtain (the hall is built behind it)
      if (Math.random() < 0.012) { this.flicker = 0.25 + Math.random() * 0.3; if (near && !document.documentElement.classList.contains('has-ritual')) sfx.neon(); }
    } else k = Math.random() < 0.5 ? 0.25 : 1;
    (this.neon.material as THREE.MeshBasicMaterial).opacity = 0.95 * k;
    this.neonGlow.material.opacity = 0.45 * k;
    if (!this.redLight) {
      let root: THREE.Object3D = this.group;
      while (root.parent) root = root.parent;
      this.redLight = (root.getObjectByName('existential-neon') as THREE.PointLight) || new THREE.PointLight();
    }
    this.redLight.intensity = 2.2 * k;
    // invite a choice: gentle pulse of the window lamps
    this.pulse = Math.max(0, this.pulse - dt * 0.6);
    const p = this.pulse > 0 ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
    this.cells.forEach((c, i) => {
      this.lamps.setColorAt(i, _c.setScalar(0.75 + p * 0.25 + Math.sin(t * 2 + i) * 0.04));
      if (!c.empty && c !== this.chosen) c.cap.rotation.y += dt * 0.2;
    });
    this.lamps.instanceColor!.needsUpdate = true;
    if (this.halo) this.halo.material.opacity = 0.55 + Math.sin(t * 4) * 0.2;
  }

  pointerDown(ray: THREE.Raycaster) {
    if (this.busy || !this.host) return false;
    const cell = this.cells.find((c) => !c.empty && hits(ray, c.g));
    if (!cell) return false;
    void this.choose(cell);
    return true;
  }

  async auto(again = false) {
    if (this.busy || !this.host) return;
    // "Pull again" on a card is already the second press: the reader has chosen to let chance choose (it used to be
    // refused like a first press, and only two more presses on the big button pulled)
    if (!this.asked && !again) {
      // the machine refuses to choose for you, the first time
      this.asked = true;
      this.pulse = 2.2;
      sfx.neon();
      this.host.say(t('ไม่มีใครเลือกแทนคุณได้ แตะช่องที่ใจเลือก หรือกดอีกครั้งให้โชคเลือกแทน', 'Nobody can choose for you. Tap a window, or press again to let chance decide.'));
      return;
    }
    const pool = this.cells.filter((c) => !c.empty);
    this.host.say(t('คุณเลือกให้โชคเลือกแทน แต่นั่นก็ยังนับเป็นการเลือกอยู่ดี', 'You chose to let chance choose. That is still a choice.'));
    await this.choose(pool[(Math.random() * pool.length) | 0]);
  }

  private async choose(cell: Cell) {
    this.busy = true;
    this.chosen = cell;
    this.asked = false;
    sfx.tick();
    haptic(10);
    await this.tween(0.12, (k) => { cell.button.position.z = 0.02 - k * 0.012; });
    await this.tween(0.12, (k) => { cell.button.position.z = 0.008 + k * 0.012; });
    this.host?.progress(0.5);
    this.host?.say(L(this.school.machine.busy));
    await this.finishGesture((f) => this.dispense(cell, f), () => this.refuse(cell));
  }

  private async refuse(cell: Cell) {
    sfx.stamp();
    const x0 = cell.g.position.x;
    await this.tween(0.45, (k) => { cell.g.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.015 * (1 - k); });
    this.chosen = null;
    this.host?.progress(0);
  }

  private async dispense(cell: Cell, finish: Finish): Promise<THREE.Vector3> {
    sfx.glass();
    await this.tween(0.35, (k) => { cell.door.rotation.y = -k * 1.9; }, ease.outCubic);
    cell.empty = true;
    cell.cap.visible = false;
    const start = new THREE.Vector3();
    cell.cap.getWorldPosition(start);
    this.group.worldToLocal(start);
    const cap = capsule(0.12, finishMaterial(finish, '#E3363F'));
    cap.position.copy(start);
    this.group.add(cap);
    this.out = cap;
    this.host?.progress(1);
    // out of the window, down the front, into the tray
    const end = new THREE.Vector3(0, 0.52, 0.62);
    await this.tween(0.25, (k) => { cap.position.z = start.z + k * 0.25; }, ease.outCubic);
    sfx.drop();
    const z1 = cap.position.z;
    let b = 0;
    await this.tween(0.8, (k) => {
      cap.position.x = start.x + (end.x - start.x) * ease.outCubic(k);
      cap.position.y = start.y + (end.y - start.y) * ease.outBounce(k);
      cap.position.z = z1 + (end.z - z1) * k;
      cap.rotation.x += 0.12;
      const nb = k > 0.36 ? (k > 0.72 ? 2 : 1) : 0;
      if (nb > b) { b = nb; sfx.bounce(1 / nb); haptic(8); }
    }, (x) => x);
    if (finish !== 'paper') {
      this.halo = halo(finish, 0.9);
      this.halo.position.copy(cap.position);
      this.group.add(this.halo);
      finish === 'gold' ? sfx.gold() : sfx.foil();
      await this.wait(0.45);
    }
    sfx.pop();
    const top = cap.userData.top as THREE.Mesh;
    void this.tween(0.5, (k) => { top.position.y = k * 1.2; top.rotation.z = k; top.visible = k < 0.95; }, ease.outCubic);
    const w = new THREE.Vector3();
    cap.getWorldPosition(w);
    return w;
  }

  reset() {
    if (this.out) this.group.remove(this.out);
    if (this.halo) this.group.remove(this.halo);
    this.out = this.halo = null;
    const cell = this.chosen;
    if (cell) {
      // a fresh capsule arrives; the glass closes
      cell.cap.visible = true;
      cell.empty = false;
      cell.cap.scale.setScalar(0.001);
      void this.tween(0.5, (k) => { cell.cap.scale.setScalar(CAP_R * ease.outBack(k)); cell.door.rotation.y = -1.9 * (1 - k); });
    }
    this.chosen = null;
    this.busy = false;
    this.host?.progress(0);
  }
}
