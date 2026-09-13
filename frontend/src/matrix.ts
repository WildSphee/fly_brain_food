import * as THREE from "three";

// Decorative binary rain lives behind the room, so it never overlays the flies or controls.
export class MatrixBackdrop {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private previous = -Infinity;
  private brightness = -1;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  constructor() {
    this.canvas.width = 768;
    this.canvas.height = 640;
    this.context = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }
  update(time: number, daylight: number) {
    const tick = this.reducedMotion.matches ? 0 : Math.floor(time * 10);
    if (tick === this.previous && Math.abs(daylight - this.brightness) < 0.01)
      return;
    this.previous = tick;
    this.brightness = daylight;
    const ctx = this.context;
    ctx.fillStyle = `rgb(${3 + daylight * 5}, ${8 + daylight * 8}, ${6 + daylight * 5})`;
    ctx.fillRect(0, 0, 768, 640);
    ctx.font = "12px monospace";
    for (let column = 0; column < 64; column++) {
      const head = (column * 137 + tick * (1.2 + (column % 5) * 0.35)) % 640;
      const length = 26 + (column % 4) * 6;
      for (let row = 0; row < length; row++) {
        const y = (head - row * 14 + 640) % 640;
        const alpha = (0.2 + daylight * 0.38) * (1 - row / length);
        ctx.fillStyle =
          row === 0
            ? `rgba(180, 255, 190, ${0.5 + daylight * 0.35})`
            : `rgba(72, 205, 104, ${alpha})`;
        ctx.fillText(
          (column * 13 + row * 7 + Math.floor(tick / 18)) % 5 > 2 ? "1" : "0",
          column * 12 + 2,
          y,
        );
      }
    }
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
  }
}
