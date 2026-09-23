/* Small canvas-painted sprites: the Sun's glow and the true-scale position marker. */
import { CanvasTexture, SRGBColorSpace } from 'three';

type Painter = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTex(w: number, h: number, paint: Painter): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = SRGBColorSpace;
  return t;
}

export const glowTex = (stops: [number, string][]) => canvasTex(256, 256, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  for (const [at, color] of stops) r.addColorStop(at, color);
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});

export const markerTex = () => canvasTex(32, 32, (g, w, h) => {
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(190,205,255,.95)'); r.addColorStop(1, 'rgba(190,205,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
