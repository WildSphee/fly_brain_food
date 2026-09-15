import * as THREE from "three";

// Visual reference: Boujjou Achraf (wefiy), https://codepen.io/wefiy/pen/WPpEwo.
// Binary-only column rain with persistent, fading trails behind the room.
const CELL = 10;
const FRAME_SECONDS = 0.035;

export class MatrixBackdrop {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private previous = -1;
  private brightness = -1;
  private drops: number[] = [];
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private wasReduced = this.reducedMotion.matches;
  private panic = false;

  constructor() {
    this.context = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
  }

  private draw() {
    const ctx = this.context;
    // Retain the previous frame: old digits fade into black as new ones fall.
    ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${CELL}px monospace`;
    ctx.fillStyle = this.panic
      ? "rgb(255, 42, 12)"
      : `rgb(0, ${Math.round(110 + this.brightness * 145)}, 0)`;
    this.drops.forEach((row, column) => {
      ctx.fillText(Math.random() < 0.5 ? "0" : "1", column * CELL, row * CELL);
      // Vary the off-screen wait, so columns restart independently.
      this.drops[column] =
        row * CELL > this.canvas.height && Math.random() < 0.025 ? 0 : row + 1;
    });
  }

  update(
    time: number,
    daylight: number,
    width: number,
    height: number,
    panic = false,
  ) {
    const modeChanged = panic !== this.panic;
    this.panic = panic;
    const tick = Math.floor(time / FRAME_SECONDS);
    const reduced = this.reducedMotion.matches;
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    const recolor = Math.abs(daylight - this.brightness) > 0.01;
    this.brightness = THREE.MathUtils.clamp(daylight, 0, 1);
    if (
      this.previous < 0 ||
      modeChanged ||
      tick < this.previous ||
      width !== this.canvas.width ||
      height !== this.canvas.height ||
      reduced !== this.wasReduced ||
      (recolor && (reduced || tick === this.previous))
    ) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.fillStyle = "#000";
      this.context.fillRect(0, 0, width, height);
      this.drops = Array.from({ length: Math.ceil(width / CELL) }, () =>
        Math.floor((Math.random() * height) / CELL),
      );
      // Start with established trails, including a still image for reduced motion.
      for (let frame = 0; frame < 70; frame++) this.draw();
      this.texture.needsUpdate = true;
    } else if (!reduced && tick > this.previous) {
      // Bound catch-up work after a slow frame or a backgrounded tab.
      for (let frame = 0; frame < Math.min(tick - this.previous, 8); frame++)
        this.draw();
      this.texture.needsUpdate = true;
    }
    this.previous = tick;
    this.wasReduced = reduced;
  }

  dispose() {
    this.texture.dispose();
  }
}
