// Top-down hole map (tee at the bottom, green at the top) with the shot preview: the club's predicted flight at the
// power the pin needs, run through the real shared physics (wind and roll included), plus every player's ball.
import { COURSE, classify, simulateShot, type ShotInput } from '@gh/shared';

// map window (world metres) and scale; fitted to the current hole by setHole()
const MM = { xa: -45, xb: 100, za: -20, zb: 372, s: 0.8 };
const COL: Record<string, string> = {
  tee: '#8fae55',
  fairway: '#7f9c47',
  fringe: '#8aa64e',
  green: '#9bbb5c',
  rough: '#5f7739',
  heavy: '#4f6330',
  bunker: '#dcc79c',
  path: '#b6a98f',
  hardpan: '#a1855f',
  rock: '#9a958c',
  water: '#4f6a6a',
  ob: '#4b5730',
};
export interface MiniBall {
  x: number;
  z: number;
  color: string;
  me: boolean;
  trail?: number[][];
}

export class Minimap {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private previewKey = '';
  private preview: number[][] | null = null;
  private land: [number, number] | null = null;
  private t = 0;
  constructor(el: HTMLCanvasElement) {
    this.el = el;
    this.ctx = el.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.setHole();
  }
  /** Re-fit and re-bake the map for the current hole (Hole 1 keeps its original framing). */
  setHole() {
    const el = this.el,
      xs = COURSE.center.map(c => c[0]),
      g = COURSE.green;
    MM.xa = Math.min(...xs, g.x - g.rx) - 45;
    MM.xb = Math.max(...xs, g.x + g.rx) + 65;
    MM.za = -20;
    MM.zb = g.z + 37;
    MM.s = Math.min(0.8, 314 / (MM.zb - MM.za), 150 / (MM.xb - MM.xa));
    el.width = Math.round((MM.xb - MM.xa) * MM.s);
    el.height = Math.round((MM.zb - MM.za) * MM.s);
    this.previewKey = '';
    this.preview = null;
    // bake the course once, one sample per pixel from the shared surface model
    this.base.width = el.width;
    this.base.height = el.height;
    const bc = this.base.getContext('2d')!,
      img = bc.createImageData(el.width, el.height),
      d = img.data;
    for (let py = 0; py < el.height; py++)
      for (let px = 0; px < el.width; px++) {
        const x = MM.xb - px / MM.s,
          z = MM.zb - py / MM.s,
          c = COL[classify(x, z).s] || '#556';
        const n = parseInt(c.slice(1), 16),
          i = (py * el.width + px) * 4,
          sh = ((px * 7 + py * 13) % 5) - 2;
        d[i] = (n >> 16) + sh;
        d[i + 1] = ((n >> 8) & 255) + sh;
        d[i + 2] = (n & 255) + sh;
        d[i + 3] = 255;
      }
    bc.putImageData(img, 0, 0);
  }
  private p(x: number, z: number): [number, number] {
    return [(MM.xb - x) * MM.s, (MM.zb - z) * MM.s];
  }
  /** Recompute the predicted flight only when the setup changes (it runs the full physics). */
  setPreview(ball: { x: number; z: number; teed: boolean } | null, input: ShotInput | null, wind: { x: number; z: number }) {
    if (!ball || !input) {
      this.preview = null;
      this.land = null;
      this.previewKey = '';
      return;
    }
    const key = [
      ball.x.toFixed(2),
      ball.z.toFixed(2),
      ball.teed,
      input.club,
      input.power.toFixed(3),
      input.aimYaw.toFixed(3),
      input.puttRange,
      wind.x,
      wind.z,
    ].join('|');
    if (key === this.previewKey) return;
    this.previewKey = key;
    const r = simulateShot({ ball, wind }, { ...input, u: 0 }, 1);
    this.preview = r.frames;
    const ev = r.events.find(e => e.type === 'land');
    if (ev) {
      const f = r.frames.find(f => f[0] >= ev.t) || r.frames[r.frames.length - 1];
      this.land = [f[1], f[3]];
    } else this.land = null;
  }
  draw(dt: number, balls: MiniBall[], lines = false) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.06;
    const c = this.ctx;
    c.clearRect(0, 0, this.el.width, this.el.height);
    c.drawImage(this.base, 0, 0);
    const line = (pts: number[][], style: string, w: number, dash: number[] = []) => {
      if (pts.length < 2) return;
      c.setLineDash(dash);
      c.beginPath();
      pts.forEach((f, i) => {
        const [x, y] = this.p(f[1], f[3]);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      });
      c.strokeStyle = style;
      c.lineWidth = w;
      c.stroke();
      c.setLineDash([]);
    };
    if (this.preview) {
      line(this.preview, 'rgba(255,216,74,.95)', 1.6, [3, 3]);
      const end = this.preview[this.preview.length - 1],
        [ex, ey] = this.p(end[1], end[3]);
      if (this.land) {
        const [lx, ly] = this.p(this.land[0], this.land[1]);
        c.beginPath();
        c.arc(lx, ly, 4.5, 0, 7);
        c.strokeStyle = '#ffd84a';
        c.lineWidth = 1.5;
        c.stroke();
      }
      c.beginPath();
      c.arc(ex, ey, 2, 0, 7);
      c.fillStyle = '#ffd84a';
      c.fill();
    }
    for (const b of balls) if (b.trail) line(b.trail, b.me ? 'rgba(255,255,255,.85)' : b.color, 1.3);
    // safe (white) and bold (orange) landing spots from the generator's strategy check
    const L = lines && COURSE.plan?.lines;
    if (L)
      for (const [pt, col, lbl] of [
        [L.safe, 'rgba(255,255,255,.9)', 'SAFE'],
        [L.bold, 'rgba(255,160,60,.95)', 'BOLD'],
      ] as [number[], string, string][]) {
        const [x, y] = this.p(pt[0], pt[1]);
        c.beginPath();
        c.arc(x, y, 4, 0, 7);
        c.strokeStyle = col;
        c.lineWidth = 1.6;
        c.setLineDash([2, 2]);
        c.stroke();
        c.setLineDash([]);
        c.font = 'bold 7px system-ui, sans-serif';
        c.fillStyle = col;
        c.fillText(lbl, x + 6, y + 3);
      }
    // pin
    const [fx, fy] = this.p(COURSE.pin.x, COURSE.pin.z);
    c.fillStyle = '#e0372b';
    c.fillRect(fx, fy - 9, 7, 5);
    c.fillStyle = '#fff';
    c.fillRect(fx - 0.5, fy - 9, 1.5, 9);
    for (const b of balls) {
      const [x, y] = this.p(b.x, b.z);
      c.beginPath();
      c.arc(x, y, b.me ? 3.2 : 2.6, 0, 7);
      c.fillStyle = b.me ? '#fff' : b.color;
      c.fill();
      c.strokeStyle = b.me ? '#000' : '#fff';
      c.lineWidth = 1.2;
      c.stroke();
    }
  }
}
