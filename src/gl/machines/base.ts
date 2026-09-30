import * as THREE from 'three';
import type { Stage } from '../stage';
import type { School } from '../../content/schools';
import type { Finish } from '../../core/store';
import { tween } from '../kit';

export interface MachineHost {
  stage: Stage;
  camera: THREE.PerspectiveCamera;
  /** The gesture is complete: spend a flame and pick a quote. null = refused (no flames left). */
  commit(): Promise<{ finish: Finish } | null>;
  /** The capsule is out: open the card from this point in the world. */
  present(world: THREE.Vector3): void;
  /** Gesture progress 0..1 for the HUD ring. */
  progress(p: number): void;
  say(text: string): void;
}

export abstract class Machine {
  readonly group = new THREE.Group();
  host: MachineHost | null = null;
  busy = false;
  armed = false;
  /** Height of the machine in world units, used to frame the camera. */
  abstract readonly height: number;
  /** Width that must stay in frame (decorative parts may spill outside). */
  readonly width: number = 2;
  /** Extra vertical offset for the room camera target. */
  readonly focusY: number = 0;

  constructor(readonly school: School, readonly stage: Stage) {}

  abstract build(): void;

  /**
   * What a pull adds to the scene later, in every finish (the capsule, the stick, the token, the halo), made exactly as
   * the pull makes it. The gallery compiles these with the machine and never shows them: a material first drawn in the
   * middle of a pull compiled right there and froze the page for half a second (a foil capsule, 450 to 480 ms).
   */
  warm(): THREE.Object3D[] { return []; }

  /** Idle animation. `near` is true when the machine is on screen. */
  update(_dt: number, _t: number, _near: boolean) {}

  /** Just before a frame is drawn, after every tick and tween of that frame: copy moving anchors into instanced parts. */
  beforeRender() {}

  enter(host: MachineHost) { this.host = host; this.armed = true; }
  exit() { this.armed = false; this.host = null; }

  /** Pointer input in the room. Return true when this machine takes the drag. */
  pointerDown(_ray: THREE.Raycaster, _e: PointerEvent): boolean { return false; }
  pointerMove(_ray: THREE.Raycaster, _e: PointerEvent) {}
  pointerUp(_ray: THREE.Raycaster, _e: PointerEvent) {}

  /** Play the whole gesture by itself (the big button, the keyboard). `again`: the reader asked for another card from the last one. */
  abstract auto(again?: boolean): Promise<void>;

  /** Called after the reveal closes, so the machine is ready for another pull. */
  reset() {}

  /** Device shake (only the eastern machine listens). */
  shake(_strength: number) {}

  protected onTick(fn: (dt: number) => void) { return this.stage.onTick((dt) => fn(dt)); }
  protected tween(dur: number, fn: (k: number) => void, e?: (t: number) => number) {
    return tween((f) => this.stage.onTick((dt) => f(dt)), dur, fn, e);
  }
  protected wait(sec: number) { return this.tween(sec, () => {}); }

  /** Shared ending of every gesture: commit, then run the machine's own dispense. */
  protected async finishGesture(dispense: (finish: Finish) => Promise<THREE.Vector3>, refuse: () => Promise<void>) {
    if (!this.host) return;
    const ticket = await this.host.commit();
    if (!ticket) { await refuse(); this.busy = false; return; }
    const where = await dispense(ticket.finish);
    this.host?.present(where);
  }
}

/** Hit test helper: is this object (or any child) under the ray? */
export function hits(ray: THREE.Raycaster, obj: THREE.Object3D) {
  return ray.intersectObject(obj, true)[0] || null;
}
