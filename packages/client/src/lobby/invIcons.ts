// Pictures for inventory slots and shop cards, drawn once on a canvas and kept as data URLs. The bud is drawn the way
// the rolling minigame draws it (a cluster of lobes, orange hairs, a dusting of frost) so it reads as the same thing.
const cache = new Map<string, string>();
const INK = '#1c1410';
function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function mix(hex: string, k: number) {
  // k < 1 darkens, k > 1 lightens
  const n = parseInt(hex.slice(1), 16),
    c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1)))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
type Ctx = CanvasRenderingContext2D;
const rr = (x: Ctx, a: number, b: number, w: number, h: number, r: number) => {
  x.beginPath();
  x.roundRect(a, b, w, h, r);
};
function bud(x: Ctx, color: string, seed = 7) {
  const r = rnd(seed),
    R = 30,
    L: [number, number, number, number][] = [];
  x.translate(48, 50);
  x.fillStyle = 'rgba(0,0,0,.3)';
  x.beginPath();
  x.ellipse(3, R * 0.9, R * 0.95, R * 0.26, 0, 0, 7);
  x.fill();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.283 + r() * 0.5,
      d = R * (0.25 + r() * 0.38);
    L.push([Math.cos(a) * d, Math.sin(a) * d * 1.05 - 2, R * (0.42 + r() * 0.2), r()]);
  }
  L.push([0, -16, R * 0.42, 0.7], [0, 0, R * 0.6, 0.5]);
  x.fillStyle = INK;
  for (const [lx, ly, lr] of L) {
    x.beginPath();
    x.arc(lx, ly, lr + 3, 0, 7);
    x.fill();
  }
  for (const [lx, ly, lr, k] of L) {
    x.fillStyle = mix(color, 0.55 + k * 0.6);
    x.beginPath();
    x.arc(lx, ly, lr, 0, 7);
    x.fill();
    x.fillStyle = mix(color, 1.35);
    x.globalAlpha = 0.55;
    x.beginPath();
    x.arc(lx - lr * 0.25, ly - lr * 0.3, lr * 0.45, 0, 7);
    x.fill();
    x.globalAlpha = 1;
  }
  x.strokeStyle = '#e8862e';
  x.lineWidth = 2;
  x.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = r() * 6.283,
      d = r() * R * 0.75,
      hx = Math.cos(a) * d,
      hy = Math.sin(a) * d * 0.9;
    x.beginPath();
    x.moveTo(hx, hy);
    x.quadraticCurveTo(hx + 5, hy - 7, hx + 9 * (r() - 0.5) * 2, hy - 10);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.283,
      d = r() * R * 0.85;
    x.fillRect(Math.cos(a) * d, Math.sin(a) * d * 0.9, 1.6, 1.6);
  }
  // a stub of stem
  x.strokeStyle = '#6a5a2a';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(2, R * 0.75);
  x.lineTo(7, R + 7);
  x.stroke();
}
const DRAW: Record<string, (x: Ctx, color: string) => void> = {
  bud,
  // a booklet of papers: a card cover folded back, one leaf pulled out
  papers(x) {
    x.translate(48, 50);
    x.rotate(-0.22);
    x.fillStyle = 'rgba(0,0,0,.3)';
    rr(x, -30, 12, 66, 12, 5);
    x.fill();
    // the leaf sticking out, thin and translucent with a gum line
    x.save();
    x.rotate(-0.16);
    x.fillStyle = '#fbf6e6';
    x.strokeStyle = INK;
    x.lineWidth = 2;
    rr(x, -24, -34, 60, 26, 2);
    x.fill();
    x.stroke();
    x.fillStyle = '#e6d9a8';
    x.fillRect(-23, -33, 58, 4);
    x.restore();
    // the pack
    x.fillStyle = '#d9772b';
    x.strokeStyle = INK;
    x.lineWidth = 3;
    rr(x, -34, -16, 68, 32, 4);
    x.fill();
    x.stroke();
    x.fillStyle = '#f3d27a';
    rr(x, -26, -9, 52, 18, 3);
    x.fill();
    x.fillStyle = '#7a3a12';
    x.font = '900 11px Inter, sans-serif';
    x.textAlign = 'center';
    x.fillText('PAPERS', 0, 4);
    x.fillStyle = '#b85e1e';
    x.fillRect(-33, -16, 66, 4);
  },
  // a two-piece metal herb grinder, seen from above and to the side
  grinder(x) {
    x.translate(48, 50);
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(2, 30, 32, 8, 0, 0, 7);
    x.fill();
    const body = (y: number, h: number, c0: string, c1: string) => {
      const g = x.createLinearGradient(-30, 0, 30, 0);
      g.addColorStop(0, c0);
      g.addColorStop(0.35, c1);
      g.addColorStop(0.6, c0);
      g.addColorStop(1, '#3a3d44');
      x.fillStyle = g;
      x.strokeStyle = INK;
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(0, y + h, 30, 11, 0, 0, Math.PI);
      x.lineTo(-30, y);
      x.ellipse(0, y, 30, 11, 0, Math.PI, 0, true);
      x.closePath();
      x.fill();
      x.stroke();
      // knurling
      x.strokeStyle = 'rgba(0,0,0,.28)';
      x.lineWidth = 1.5;
      for (let i = -27; i <= 27; i += 5) {
        const yy = Math.sqrt(1 - (i / 30) ** 2) * 11;
        x.beginPath();
        x.moveTo(i, y + yy + 2);
        x.lineTo(i, y + h + yy - 2);
        x.stroke();
      }
    };
    body(4, 18, '#7d838e', '#d8dce4');
    body(-14, 14, '#8b919c', '#eef0f4');
    // the lid
    const g = x.createRadialGradient(-8, -18, 2, 0, -14, 30);
    g.addColorStop(0, '#f4f6f9');
    g.addColorStop(1, '#8d939e');
    x.fillStyle = g;
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(0, -14, 30, 11, 0, 0, 7);
    x.fill();
    x.stroke();
    x.strokeStyle = 'rgba(0,0,0,.25)';
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(0, -14, 20, 7, 0, 0, 7);
    x.stroke();
  },
  // a rolled joint: a paper cone with a twisted tip and a card filter
  joint(x, color) {
    x.translate(48, 48);
    x.rotate(-0.6);
    x.fillStyle = 'rgba(0,0,0,.25)';
    x.beginPath();
    x.ellipse(0, 12, 36, 5, 0, 0, 7);
    x.fill();
    x.fillStyle = '#f6f0de';
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-36, -4);
    x.lineTo(26, -9);
    x.lineTo(36, -1);
    x.lineTo(40, -4);
    x.lineTo(38, 3);
    x.lineTo(26, 9);
    x.lineTo(-36, 4);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#d9c9a0';
    x.fillRect(-35, -3.5, 12, 7);
    x.fillStyle = mix(color, 0.8);
    x.globalAlpha = 0.35;
    x.fillRect(-20, -5, 44, 10);
    x.globalAlpha = 1;
  },
  // a sack of fertilizer
  fert(x) {
    x.translate(48, 50);
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(2, 32, 28, 6, 0, 0, 7);
    x.fill();
    x.fillStyle = '#e9e2cf';
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-24, -30);
    x.quadraticCurveTo(0, -36, 24, -30);
    x.quadraticCurveTo(30, 0, 26, 30);
    x.quadraticCurveTo(0, 36, -26, 30);
    x.quadraticCurveTo(-30, 0, -24, -30);
    x.fill();
    x.stroke();
    x.fillStyle = '#4f7a4a';
    rr(x, -18, -14, 36, 30, 4);
    x.fill();
    x.fillStyle = '#e9e2cf';
    x.font = '900 12px Inter, sans-serif';
    x.textAlign = 'center';
    x.fillText('GROW', 0, -1);
    x.font = '800 9px Inter, sans-serif';
    x.fillText('5·3·4', 0, 10);
    x.strokeStyle = '#b9ae90';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-22, -24);
    x.lineTo(22, -24);
    x.stroke();
  },
  growpot(x) {
    x.translate(48, 52);
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(2, 28, 26, 6, 0, 0, 7);
    x.fill();
    x.fillStyle = '#2f2f33';
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(-28, -14);
    x.lineTo(28, -14);
    x.lineTo(21, 28);
    x.lineTo(-21, 28);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#45454b';
    rr(x, -31, -22, 62, 11, 3);
    x.fill();
    x.stroke();
    x.fillStyle = '#3b2a1c';
    x.beginPath();
    x.ellipse(0, -20, 26, 5, 0, 0, 7);
    x.fill();
    // a seedling
    x.strokeStyle = '#5f9a3e';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, -20);
    x.lineTo(0, -36);
    x.stroke();
    x.fillStyle = '#6fae3c';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(s * 8, -37, 9, 4.5, s * -0.5, 0, 7);
      x.fill();
    }
  },
  growbed(x) {
    x.translate(48, 54);
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(0, 22, 40, 6, 0, 0, 7);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.fillStyle = '#3b2a1c';
    x.beginPath();
    x.moveTo(-28, -16);
    x.lineTo(34, -16);
    x.lineTo(40, -2);
    x.lineTo(-40, -2);
    x.closePath();
    x.fill();
    x.stroke();
    for (let i = 0; i < 2; i++) {
      x.fillStyle = i ? '#8a5f38' : '#a0703f';
      rr(x, -40, -2 + i * 11, 80, 11, 2);
      x.fill();
      x.stroke();
    }
    x.fillStyle = '#6fae3c';
    for (const px of [-18, 3, 24]) {
      x.strokeStyle = '#5f9a3e';
      x.beginPath();
      x.moveTo(px, -8);
      x.lineTo(px, -24);
      x.stroke();
      for (const s of [-1, 1]) {
        x.beginPath();
        x.ellipse(px + s * 6, -25, 7, 3.5, s * -0.5, 0, 7);
        x.fill();
      }
    }
  },
  sprinkler(x) {
    x.translate(48, 54);
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.beginPath();
    x.ellipse(0, 26, 22, 5, 0, 0, 7);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.fillStyle = '#3a3a3c';
    rr(x, -16, 16, 32, 10, 4);
    x.fill();
    x.stroke();
    x.fillStyle = '#9aa0a6';
    rr(x, -3.5, -14, 7, 30, 2);
    x.fill();
    x.stroke();
    x.fillStyle = '#2d6fb3';
    rr(x, -20, -22, 40, 9, 4);
    x.fill();
    x.stroke();
    x.strokeStyle = '#8fd0f0';
    x.lineWidth = 2.5;
    x.lineCap = 'round';
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.arc(s * 20, -18, 10 + i * 8, s > 0 ? -1.2 : Math.PI + 0.5, s > 0 ? -0.5 : Math.PI + 1.2);
        x.stroke();
      }
  },
};
/** A 96 px picture for `kind` (bud, joint, papers, grinder, fert, growpot, growbed, sprinkler). */
export function invIcon(kind: string, color = '#6fae3c') {
  const k = kind + color;
  let u = cache.get(k);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d')!;
    (DRAW[kind] || DRAW.bud)(x, color);
    cache.set(k, (u = c.toDataURL()));
  }
  return `<img src="${u}" alt="">`;
}
