// Ball skins: 50 collectible designs, painted procedurally onto an equirectangular canvas (u = around, v = pole to
// pole) so they wrap a sphere. Sets: Classics, Planets, Emoji, Spooky, and Legends (invented celebrity-style
// characters — no real people). Three more sets use real art (asset-audit.md), packed in public/balls/:
// Animals (Kenney's Animal Pack Redux, CC0), Masterpieces (public-domain paintings) and Landmarks (Openclipart
// silhouettes, CC0, over painted skies). Won from the Birdie Ball machine in the lobby with Birdie Dollars.
import * as THREE from 'three';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface BallDef {
  id: string;
  name: string;
  set: 'Classics' | 'Planets' | 'Emoji' | 'Spooky' | 'Legends' | 'Animals' | 'Masterpieces' | 'Landmarks';
  rarity: Rarity;
  paint: (x: CanvasRenderingContext2D, W: number, H: number) => void;
}
export const RARITY_COLOR: Record<Rarity, string> = { common: '#c9c2b4', rare: '#59a8e8', epic: '#b072e8', legendary: '#f2b84a' };
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 5, epic: 2.4, legendary: 1 };

// ---------------------------------------------------------------- painting helpers
type C = CanvasRenderingContext2D;
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const fill = (x: C, W: number, H: number, c: string | CanvasGradient) => {
  x.fillStyle = c;
  x.fillRect(0, 0, W, H);
};
const vgrad = (x: C, H: number, stops: [number, string][]) => {
  const g = x.createLinearGradient(0, 0, 0, H);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
};
/** horizontal bands (gas giants) with wobble */
function bands(x: C, W: number, H: number, cols: string[], seed: number, n = 14) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const y0 = (i / n) * H,
      h = H / n + 2;
    x.fillStyle = cols[Math.floor(r() * cols.length)];
    x.beginPath();
    x.moveTo(0, y0);
    for (let u = 0; u <= W; u += 16) x.lineTo(u, y0 + Math.sin(u * 0.03 + i) * 3 * r());
    x.lineTo(W, y0 + h);
    x.lineTo(0, y0 + h);
    x.fill();
  }
}
function blotches(x: C, W: number, H: number, cols: string[], seed: number, n: number, rmin: number, rmax: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * W,
      cy = H * 0.1 + r() * H * 0.8,
      rr = rmin + r() * (rmax - rmin);
    x.fillStyle = cols[i % cols.length];
    for (const ox of [-W, 0, W]) {
      x.beginPath();
      x.ellipse(cx + ox, cy, rr * (1.2 + r()), rr, 0, 0, 7);
      x.fill();
    }
  }
}
function craters(x: C, W: number, H: number, seed: number, n: number, dark: string, light: string) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * W,
      cy = H * 0.12 + r() * H * 0.76,
      rr = 3 + r() * 14;
    x.fillStyle = dark;
    x.beginPath();
    x.arc(cx, cy, rr, 0, 7);
    x.fill();
    x.strokeStyle = light;
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(cx + 1, cy - 1, rr, 3.6, 5.8);
    x.stroke();
  }
}
/** a face drawn at the front of the ball (u = 0.25 faces +Z on a three.js sphere) */
function face(x: C, W: number, H: number, draw: (x: C, cx: number, cy: number, s: number) => void) {
  draw(x, W * 0.25, H * 0.5, H * 0.32);
  draw(x, W * 0.75, H * 0.5, H * 0.32);
}
const eye = (x: C, cx: number, cy: number, r: number, pupil = '#2a1a10') => {
  x.fillStyle = pupil;
  x.beginPath();
  x.ellipse(cx, cy, r * 0.7, r, 0, 0, 7);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(cx - r * 0.25, cy - r * 0.35, r * 0.28, 0, 7);
  x.fill();
};
const arc = (x: C, cx: number, cy: number, r: number, a0: number, a1: number, w: number, col = '#3a2210') => {
  x.strokeStyle = col;
  x.lineWidth = w;
  x.lineCap = 'round';
  x.beginPath();
  x.arc(cx, cy, r, a0, a1);
  x.stroke();
};
const emojiBase = (x: C, W: number, H: number) =>
  fill(
    x,
    W,
    H,
    vgrad(x, H, [
      [0, '#ffe680'],
      [0.5, '#ffcc33'],
      [1, '#e8a020'],
    ]),
  );
const dimples = (x: C, W: number, H: number, a = 0.06) => {
  for (let j = 8; j < H; j += 12)
    for (let i = ((j / 12) % 2) * 6; i < W; i += 12) {
      x.fillStyle = `rgba(0,0,0,${a})`;
      x.beginPath();
      x.arc(i, j, 2.4, 0, 7);
      x.fill();
    }
};

// ---------------------------------------------------------------- real art: animals, paintings, landmarks
const BASE = (import.meta as any).env?.BASE_URL ?? './';
const SHEET: Record<'animals' | 'art' | 'landmarks', HTMLImageElement | null> = { animals: null, art: null, landmarks: null };
/** animals.png: 6 across, 192 px cells, in this order, with each animal's main colour (the ball is painted that colour). */
const ANIMALS: [string, string][] = [
  ['bear', '#a16639'],
  ['buffalo', '#5f422d'],
  ['chick', '#ffcc00'],
  ['chicken', '#f0f0f0'],
  ['cow', '#414040'],
  ['crocodile', '#2ecc71'],
  ['dog', '#d2d0d0'],
  ['duck', '#2ecc71'],
  ['elephant', '#d2d0d0'],
  ['frog', '#2ecc71'],
  ['giraffe', '#ffcc00'],
  ['goat', '#a16639'],
  ['gorilla', '#bdb6b6'],
  ['hippo', '#528cdb'],
  ['horse', '#a16639'],
  ['monkey', '#a16639'],
  ['moose', '#a16639'],
  ['narwhal', '#528cdb'],
  ['owl', '#a16639'],
  ['panda', '#f5f5f5'],
  ['parrot', '#d23007'],
  ['penguin', '#365a66'],
  ['pig', '#ee9fee'],
  ['rabbit', '#d2d0d0'],
  ['rhino', '#d2d0d0'],
  ['sloth', '#a16639'],
  ['snake', '#2ecc71'],
  ['walrus', '#986c4c'],
  ['whale', '#c3dce9'],
  ['zebra', '#414040'],
];
/** art.jpg: 4 across, 256 px cells. landmarks.png: 4 across, 256 px cells, white shapes standing on the cell's floor. */
const ART = [
  'monalisa',
  'starry',
  'scream',
  'wave',
  'pearl',
  'sunflowers',
  'venus',
  'kiss',
  'adam',
  'seurat',
  'mondrian',
  'gothic',
  'lilies',
  'shipwreck',
];
const MARKS = ['eiffel', 'liberty', 'bigben', 'taj', 'sydney', 'gate', 'pisa'];

/** An animal: the ball in its colour, its face on the front and the back. */
const animal = (id: string, name: string, rarity: Rarity): BallDef =>
  B(id, name, 'Animals', rarity, (x, W, H) => {
    const i = ANIMALS.findIndex(a => a[0] === id),
      img = SHEET.animals;
    fill(x, W, H, ANIMALS[i][1]);
    if (!img) return;
    const s = H * 0.74;
    for (const u of [0.25, 0.75]) x.drawImage(img, (i % 6) * 192, Math.floor(i / 6) * 192, 192, 192, W * u - s / 2, H * 0.5 - s / 2, s, s);
  });
/** A painting: wrapped once round the ball and mirrored on the far side, so there's no seam. */
const painting = (id: string, name: string, rarity: Rarity, fallback: string, grid = 1): BallDef =>
  B(id, name, 'Masterpieces', rarity, (x, W, H) => {
    const i = ART.indexOf(id),
      img = SHEET.art;
    fill(x, W, H, fallback);
    if (!img) return;
    const sx = (i % 4) * 256 + 1,
      sy = Math.floor(i / 4) * 256 + 1;
    // `grid` copies across each half and down, every other one flipped so the edges always meet
    const cw = W / 2 / grid,
      ch = H / grid;
    for (let i2 = 0; i2 < grid * 2; i2++)
      for (let j = 0; j < grid; j++) {
        x.save();
        x.translate(i2 * cw + (i2 % 2 ? cw : 0), j * ch + (j % 2 ? ch : 0));
        x.scale(i2 % 2 ? -1 : 1, j % 2 ? -1 : 1);
        x.drawImage(img, sx, sy, 254, 254, 0, 0, cw, ch);
        x.restore();
      }
  });
let tintC: HTMLCanvasElement | null = null;
/** A landmark: a sky, a low sun or moon, the ground, and the landmark's shape standing on it (front and back). */
function landmark(
  id: string,
  name: string,
  rarity: Rarity,
  o: {
    sky: [string, string, string];
    shape: string;
    ground: string;
    orb?: [string, number, number, number];
    stars?: boolean;
    size?: number;
    tiers?: number;
    door?: boolean;
  },
  draw?: (x: C, cx: number, floor: number, s: number) => void,
): BallDef {
  return B(id, name, 'Landmarks', rarity, (x, W, H) => {
    const floor = H * 0.7,
      s = H * (o.size ?? 0.5);
    fill(
      x,
      W,
      H,
      vgrad(x, floor, [
        [0, o.sky[0]],
        [0.6, o.sky[1]],
        [1, o.sky[2]],
      ]),
    );
    if (o.stars) {
      const r = rng(id.length * 77);
      x.fillStyle = 'rgba(255,255,255,.85)';
      for (let k = 0; k < 90; k++) x.fillRect(r() * W, r() * floor * 0.6, 1.3, 1.3);
    }
    for (const u of [0.25, 0.75]) {
      const cx = W * u;
      if (o.orb) {
        const [col, dx, dy, rr] = o.orb,
          g = x.createRadialGradient(cx + dx * H, dy * H, 0, cx + dx * H, dy * H, rr * H * 2.4);
        g.addColorStop(0, col);
        g.addColorStop(0.4, col);
        g.addColorStop(0.42, 'rgba(255,255,255,.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(cx - W / 4, 0, W / 2, floor);
      }
    }
    x.fillStyle = o.ground;
    x.fillRect(0, floor - 1, W, H - floor + 1);
    for (const u of [0.25, 0.75]) {
      const cx = W * u,
        i = MARKS.indexOf(id);
      if (draw) draw(x, cx, floor, s);
      else if (SHEET.landmarks) {
        // tint the white shape, then stamp it
        const t = (tintC ??= document.createElement('canvas'));
        t.width = t.height = 256;
        const tx = t.getContext('2d')!;
        tx.drawImage(SHEET.landmarks, (i % 4) * 256, Math.floor(i / 4) * 256, 256, 256, 0, 0, 256, 256);
        tx.globalCompositeOperation = 'source-in';
        tx.fillStyle = o.shape;
        tx.fillRect(0, 0, 256, 256);
        tx.globalCompositeOperation = 'source-atop';
        if (o.tiers || o.door) {
          // pale stone needs modelling to read: light from the left, shade on the right
          const sh = tx.createLinearGradient(40, 0, 216, 0);
          sh.addColorStop(0, 'rgba(255,255,255,.25)');
          sh.addColorStop(0.5, 'rgba(0,0,0,0)');
          sh.addColorStop(1, 'rgba(70,50,60,.42)');
          tx.fillStyle = sh;
          tx.fillRect(0, 0, 256, 256);
        }
        if (o.tiers) {
          // the tower's arcaded storeys, tilted with it
          tx.save();
          tx.translate(128, 128);
          tx.rotate(-0.07);
          for (let k = 0; k < o.tiers; k++) {
            const y = -112 + (k * 236) / o.tiers;
            tx.fillStyle = 'rgba(70,52,40,.5)';
            tx.fillRect(-128, y, 256, 3);
            tx.fillStyle = 'rgba(70,52,40,.3)';
            for (let c2 = -120; c2 < 128; c2 += 11) tx.fillRect(c2, y + 7, 5, 236 / o.tiers - 12);
          }
          tx.restore();
        }
        if (o.door) {
          // the great arched doorway, and a smaller arch each side
          tx.fillStyle = 'rgba(96,62,70,.6)';
          for (const [ax, aw, ah] of [
            [128, 26, 58],
            [92, 12, 30],
            [164, 12, 30],
          ]) {
            tx.beginPath();
            tx.moveTo(ax - aw / 2, 256);
            tx.lineTo(ax - aw / 2, 256 - ah * 0.6);
            tx.quadraticCurveTo(ax, 256 - ah * 1.15, ax + aw / 2, 256 - ah * 0.6);
            tx.lineTo(ax + aw / 2, 256);
            tx.fill();
          }
        }
        tx.globalCompositeOperation = 'source-over';
        x.drawImage(t, cx - s / 2, floor - s + 1, s, s);
      }
    }
  });
}

// ---------------------------------------------------------------- the catalogue
const B = (id: string, name: string, set: BallDef['set'], rarity: Rarity, paint: BallDef['paint']): BallDef => ({ id, name, set, rarity, paint });
export const BALLS: BallDef[] = [
  // Classics (8)
  B('classic', 'Classic White', 'Classics', 'common', (x, W, H) => {
    fill(x, W, H, '#f6f4ee');
    dimples(x, W, H);
    x.fillStyle = '#2b4a8a';
    x.font = 'bold 22px Inter, sans-serif';
    x.textAlign = 'center';
    x.fillText('GH 1', W * 0.25, H * 0.55);
  }),
  B('tour-yellow', 'Tour Yellow', 'Classics', 'common', (x, W, H) => {
    fill(x, W, H, '#f3e83a');
    dimples(x, W, H, 0.08);
  }),
  B('matte-black', 'Matte Black', 'Classics', 'common', (x, W, H) => {
    fill(x, W, H, '#1c1c1e');
    dimples(x, W, H, 0.25);
    x.strokeStyle = '#e9b23a';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, H / 2);
    x.lineTo(W, H / 2);
    x.stroke();
  }),
  B('chrome', 'Chrome', 'Classics', 'rare', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#fafafa'],
        [0.45, '#8a8f96'],
        [0.5, '#3a3f46'],
        [0.55, '#b8bec6'],
        [1, '#e8eaee'],
      ]),
    );
  }),
  B('gold', 'Solid Gold', 'Classics', 'epic', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#fff2b0'],
        [0.4, '#e9b23a'],
        [0.55, '#9a6a14'],
        [1, '#f6d26a'],
      ]),
    );
    dimples(x, W, H, 0.12);
  }),
  B('eight-ball', '8-Ball', 'Classics', 'rare', (x, W, H) => {
    fill(x, W, H, '#151515');
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(W * 0.25, H / 2, H * 0.2, 0, 7);
    x.fill();
    x.fillStyle = '#111';
    x.font = `bold ${(H * 0.26) | 0}px Inter, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('8', W * 0.25, H / 2 + 2);
  }),
  B('tie-dye', 'Tie-Dye', 'Classics', 'rare', (x, W, H) => {
    const cols = ['#ff4f6d', '#ffb13b', '#ffe94a', '#5fd36a', '#3fb6ff', '#9a6cff'];
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = cols[i % 6];
      x.lineWidth = 9;
      x.beginPath();
      for (let u = 0; u <= W; u += 8) x.lineTo(u, i * 9 - 60 + Math.sin(u * 0.04 + i * 0.5) * 18);
      x.stroke();
    }
  }),
  B('disco', 'Disco Ball', 'Classics', 'epic', (x, W, H) => {
    const r = rng(5);
    for (let j = 0; j < H; j += 10)
      for (let i = 0; i < W; i += 10) {
        const v = (120 + r() * 135) | 0;
        x.fillStyle = r() < 0.08 ? '#fff' : `rgb(${v},${v},${Math.min(255, v + 25)})`;
        x.fillRect(i, j, 9, 9);
      }
  }),
  // Planets (12)
  B('mercury', 'Mercury', 'Planets', 'common', (x, W, H) => {
    fill(x, W, H, '#8f877c');
    craters(x, W, H, 1, 60, '#6f685e', '#b8b0a4');
  }),
  B('venus', 'Venus', 'Planets', 'common', (x, W, H) => {
    bands(x, W, H, ['#e8c27a', '#d9a55a', '#f0d79a', '#c99550'], 2, 18);
  }),
  B('earth', 'Earth', 'Planets', 'rare', (x, W, H) => {
    fill(x, W, H, '#2c6fb5');
    blotches(x, W, H, ['#4f8a3a', '#7a9a48', '#a8955e'], 3, 14, 10, 28);
    x.fillStyle = '#f4f6f8';
    x.fillRect(0, 0, W, H * 0.07);
    x.fillRect(0, H * 0.93, W, H * 0.07);
    blotches(x, W, H, ['rgba(255,255,255,.55)'], 33, 18, 4, 12);
  }),
  B('moon', 'The Moon', 'Planets', 'common', (x, W, H) => {
    fill(x, W, H, '#c9c6bf');
    blotches(x, W, H, ['#9c998f'], 4, 8, 12, 26);
    craters(x, W, H, 44, 50, '#a8a59c', '#e6e3dc');
  }),
  B('mars', 'Mars', 'Planets', 'common', (x, W, H) => {
    fill(x, W, H, '#c2562e');
    blotches(x, W, H, ['#8f3a1e', '#d9773f'], 5, 18, 6, 20);
    x.fillStyle = '#f2e6dc';
    x.fillRect(0, 0, W, H * 0.05);
  }),
  B('jupiter', 'Jupiter', 'Planets', 'rare', (x, W, H) => {
    bands(x, W, H, ['#d8b48a', '#b8865a', '#e8d6b8', '#a8704a', '#f0e2c8'], 6, 16);
    x.fillStyle = '#b8463a';
    x.beginPath();
    x.ellipse(W * 0.3, H * 0.62, 20, 11, 0, 0, 7);
    x.fill();
  }),
  B('saturn', 'Saturn', 'Planets', 'rare', (x, W, H) => {
    bands(x, W, H, ['#e8d39a', '#d6b878', '#f0e2b8', '#c9a868'], 7, 14);
    x.fillStyle = 'rgba(120,96,60,.75)';
    x.fillRect(0, H * 0.47, W, H * 0.06);
  }),
  B('uranus', 'Uranus', 'Planets', 'common', (x, W, H) => {
    bands(x, W, H, ['#9fdde0', '#8ad0d6', '#b4e8ea'], 8, 10);
  }),
  B('neptune', 'Neptune', 'Planets', 'common', (x, W, H) => {
    bands(x, W, H, ['#3a5fd0', '#2f4fb8', '#4a72e0'], 9, 12);
    x.fillStyle = '#1e2f80';
    x.beginPath();
    x.ellipse(W * 0.27, H * 0.4, 16, 9, 0, 0, 7);
    x.fill();
  }),
  B('pluto', 'Pluto', 'Planets', 'rare', (x, W, H) => {
    fill(x, W, H, '#b89878');
    blotches(x, W, H, ['#8a6a50'], 10, 10, 6, 18);
    x.fillStyle = '#f2e6d6';
    x.beginPath();
    x.moveTo(W * 0.25, H * 0.42);
    x.bezierCurveTo(W * 0.18, H * 0.25, W * 0.1, H * 0.45, W * 0.25, H * 0.7);
    x.bezierCurveTo(W * 0.4, H * 0.45, W * 0.32, H * 0.25, W * 0.25, H * 0.42);
    x.fill();
  }),
  B('sun', 'The Sun', 'Planets', 'legendary', (x, W, H) => {
    fill(x, W, H, '#ffb020');
    blotches(x, W, H, ['#ffd84a', '#ff8a1a', '#fff0a0'], 11, 60, 3, 12);
  }),
  B('black-hole', 'Black Hole', 'Planets', 'legendary', (x, W, H) => {
    fill(x, W, H, '#050308');
    for (let i = 0; i < 6; i++) {
      x.strokeStyle = `rgba(255,${150 + i * 15},${60 + i * 20},${0.9 - i * 0.12})`;
      x.lineWidth = 6 - i * 0.7;
      x.beginPath();
      for (let u = 0; u <= W; u += 6) x.lineTo(u, H / 2 + Math.sin((u / W) * Math.PI * 2) * (6 + i * 4));
      x.stroke();
    }
  }),
  // Emoji (10) — original faces
  B('smile', 'Smiley', 'Emoji', 'common', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.32, cy - s * 0.2, s * 0.13);
      eye(x, cx + s * 0.32, cy - s * 0.2, s * 0.13);
      arc(x, cx, cy + s * 0.05, s * 0.45, 0.35, Math.PI - 0.35, s * 0.09);
    });
  }),
  B('grin', 'Big Grin', 'Emoji', 'common', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.3, cy - s * 0.25, s * 0.12);
      eye(x, cx + s * 0.3, cy - s * 0.25, s * 0.12);
      x.fillStyle = '#5a2010';
      x.beginPath();
      x.arc(cx, cy + s * 0.08, s * 0.42, 0, Math.PI);
      x.fill();
      x.fillStyle = '#fff';
      x.fillRect(cx - s * 0.36, cy + s * 0.08, s * 0.72, s * 0.12);
    });
  }),
  B('shades', 'Too Cool', 'Emoji', 'common', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#151515';
      x.beginPath();
      x.roundRect(cx - s * 0.62, cy - s * 0.38, s * 0.55, s * 0.32, 8);
      x.roundRect(cx + s * 0.07, cy - s * 0.38, s * 0.55, s * 0.32, 8);
      x.fill();
      x.fillRect(cx - s * 0.1, cy - s * 0.32, s * 0.2, s * 0.06);
      arc(x, cx + s * 0.1, cy + s * 0.15, s * 0.3, 0.3, 1.8, s * 0.08);
    });
  }),
  B('hearts', 'Heart Eyes', 'Emoji', 'rare', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      for (const d of [-1, 1]) {
        const hx = cx + d * s * 0.32,
          hy = cy - s * 0.22,
          r = s * 0.14;
        x.fillStyle = '#e8304a';
        x.beginPath();
        x.arc(hx - r * 0.5, hy, r * 0.6, 0, 7);
        x.arc(hx + r * 0.5, hy, r * 0.6, 0, 7);
        x.moveTo(hx - r * 1.1, hy + r * 0.1);
        x.lineTo(hx, hy + r * 1.3);
        x.lineTo(hx + r * 1.1, hy + r * 0.1);
        x.fill();
      }
      arc(x, cx, cy + s * 0.05, s * 0.42, 0.4, Math.PI - 0.4, s * 0.08);
    });
  }),
  B('wink', 'Wink', 'Emoji', 'common', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.32, cy - s * 0.2, s * 0.13);
      arc(x, cx + s * 0.32, cy - s * 0.12, s * 0.13, Math.PI + 0.3, -0.3, s * 0.07);
      arc(x, cx, cy + s * 0.02, s * 0.45, 0.4, Math.PI - 0.4, s * 0.09);
      x.fillStyle = '#e84a5a';
      x.beginPath();
      x.ellipse(cx + s * 0.15, cy + s * 0.5, s * 0.1, s * 0.13, 0, 0, 7);
      x.fill();
    });
  }),
  B('lol', 'Crying Laughing', 'Emoji', 'rare', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      for (const d of [-1, 1]) {
        arc(x, cx + d * s * 0.32, cy - s * 0.16, s * 0.12, Math.PI + 0.2, -0.2, s * 0.07);
        x.fillStyle = '#5ab8f0';
        x.beginPath();
        x.ellipse(cx + d * s * 0.55, cy + s * 0.05, s * 0.08, s * 0.16, d * 0.4, 0, 7);
        x.fill();
      }
      x.fillStyle = '#5a2010';
      x.beginPath();
      x.arc(cx, cy + s * 0.12, s * 0.38, 0, Math.PI);
      x.fill();
    });
  }),
  B('angry', 'Fuming', 'Emoji', 'common', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#ff8a5a'],
        [0.6, '#e8452a'],
        [1, '#b82a1a'],
      ]),
    );
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.3, cy - s * 0.15, s * 0.11);
      eye(x, cx + s * 0.3, cy - s * 0.15, s * 0.11);
      x.strokeStyle = '#3a1008';
      x.lineWidth = s * 0.08;
      x.beginPath();
      x.moveTo(cx - s * 0.5, cy - s * 0.45);
      x.lineTo(cx - s * 0.15, cy - s * 0.3);
      x.moveTo(cx + s * 0.5, cy - s * 0.45);
      x.lineTo(cx + s * 0.15, cy - s * 0.3);
      x.stroke();
      arc(x, cx, cy + s * 0.55, s * 0.3, Math.PI + 0.5, -0.5, s * 0.08);
    });
  }),
  B('shock', 'Shook', 'Emoji', 'common', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      for (const d of [-1, 1]) {
        x.fillStyle = '#fff';
        x.beginPath();
        x.arc(cx + d * s * 0.3, cy - s * 0.2, s * 0.17, 0, 7);
        x.fill();
        x.fillStyle = '#222';
        x.beginPath();
        x.arc(cx + d * s * 0.3, cy - s * 0.2, s * 0.07, 0, 7);
        x.fill();
      }
      x.fillStyle = '#5a2010';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.3, s * 0.14, s * 0.2, 0, 0, 7);
      x.fill();
    });
  }),
  B('sleepy', 'Snooze', 'Emoji', 'common', (x, W, H) => {
    emojiBase(x, W, H);
    face(x, W, H, (x, cx, cy, s) => {
      for (const d of [-1, 1]) arc(x, cx + d * s * 0.3, cy - s * 0.22, s * 0.12, 0.2, Math.PI - 0.2, s * 0.06);
      x.fillStyle = '#5a2010';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.3, s * 0.1, s * 0.07, 0, 0, 7);
      x.fill();
      x.fillStyle = '#4a6ad0';
      x.font = `bold ${(s * 0.35) | 0}px Inter`;
      x.fillText('z', cx + s * 0.5, cy - s * 0.4);
      x.font = `bold ${(s * 0.25) | 0}px Inter`;
      x.fillText('z', cx + s * 0.75, cy - s * 0.65);
    });
  }),
  B('party', 'Party Time', 'Emoji', 'rare', (x, W, H) => {
    emojiBase(x, W, H);
    const r = rng(77);
    for (let i = 0; i < 140; i++) {
      x.fillStyle = ['#e84a7a', '#4ab8e8', '#7ad84a', '#9a5ae8'][i % 4];
      x.fillRect(r() * W, r() * H * 0.35, 4, 7);
    }
    face(x, W, H, (x, cx, cy, s) => {
      arc(x, cx - s * 0.3, cy - s * 0.15, s * 0.12, Math.PI + 0.2, -0.2, s * 0.07);
      arc(x, cx + s * 0.3, cy - s * 0.15, s * 0.12, Math.PI + 0.2, -0.2, s * 0.07);
      arc(x, cx, cy + s * 0.05, s * 0.42, 0.4, Math.PI - 0.4, s * 0.09);
    });
  }),
  // Spooky (10)
  B('pumpkin', "Jack-o'-Lantern", 'Spooky', 'rare', (x, W, H) => {
    fill(x, W, H, '#f07a1a');
    for (let i = 0; i < W; i += W / 12) {
      x.fillStyle = 'rgba(160,60,10,.35)';
      x.fillRect(i, 0, 3, H);
    }
    x.fillStyle = '#3a6a2a';
    x.fillRect(0, 0, W, H * 0.06);
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#ffd34a';
      for (const d of [-1, 1]) {
        x.beginPath();
        x.moveTo(cx + d * s * 0.45, cy - s * 0.05);
        x.lineTo(cx + d * s * 0.15, cy - s * 0.05);
        x.lineTo(cx + d * s * 0.3, cy - s * 0.38);
        x.fill();
      }
      x.beginPath();
      x.moveTo(cx - s * 0.5, cy + s * 0.2);
      for (let k = 0; k <= 6; k++) x.lineTo(cx - s * 0.5 + (k * s) / 6, cy + s * (k % 2 ? 0.32 : 0.48));
      x.lineTo(cx + s * 0.5, cy + s * 0.2);
      x.fill();
    });
  }),
  B('eyeball', 'Eyeball', 'Spooky', 'rare', (x, W, H) => {
    fill(x, W, H, '#f4f0ea');
    x.strokeStyle = 'rgba(200,40,40,.55)';
    x.lineWidth = 1.5;
    const r = rng(12);
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      let px = W * 0.25,
        py = H / 2;
      x.moveTo(px + 30, py);
      for (let k = 0; k < 8; k++) {
        px += (r() - 0.5) * 40 + 18 * Math.cos(i);
        py += (r() - 0.5) * 30;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    for (const [rr, c] of [
      [38, '#3a8a5a'],
      [26, '#1a5a3a'],
      [16, '#050505'],
    ] as [number, string][]) {
      x.fillStyle = c;
      x.beginPath();
      x.arc(W * 0.25, H / 2, rr, 0, 7);
      x.fill();
    }
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(W * 0.25 - 6, H / 2 - 7, 5, 0, 7);
    x.fill();
  }),
  B('skull', 'Skull', 'Spooky', 'rare', (x, W, H) => {
    fill(x, W, H, '#ece6d6');
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#1a1612';
      for (const d of [-1, 1]) {
        x.beginPath();
        x.ellipse(cx + d * s * 0.3, cy - s * 0.12, s * 0.2, s * 0.24, 0, 0, 7);
        x.fill();
      }
      x.beginPath();
      x.moveTo(cx, cy + s * 0.12);
      x.lineTo(cx - s * 0.08, cy + s * 0.28);
      x.lineTo(cx + s * 0.08, cy + s * 0.28);
      x.fill();
      for (let k = -3; k <= 3; k++) x.fillRect(cx + k * s * 0.09 - 2, cy + s * 0.42, 3, s * 0.16);
    });
  }),
  B('ghost', 'Boo!', 'Spooky', 'common', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#ffffff'],
        [1, '#d6e0ea'],
      ]),
    );
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#20202a';
      for (const d of [-1, 1]) {
        x.beginPath();
        x.ellipse(cx + d * s * 0.25, cy - s * 0.15, s * 0.1, s * 0.16, 0, 0, 7);
        x.fill();
      }
      x.beginPath();
      x.ellipse(cx, cy + s * 0.25, s * 0.12, s * 0.18, 0, 0, 7);
      x.fill();
    });
  }),
  B('zombie', 'Zombie', 'Spooky', 'rare', (x, W, H) => {
    fill(x, W, H, '#7a9a5a');
    blotches(x, W, H, ['#5a7a3a', '#8aa86a'], 13, 20, 4, 12);
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#f0ead0';
      x.beginPath();
      x.arc(cx - s * 0.3, cy - s * 0.15, s * 0.15, 0, 7);
      x.arc(cx + s * 0.32, cy - s * 0.1, s * 0.1, 0, 7);
      x.fill();
      x.fillStyle = '#300';
      x.beginPath();
      x.arc(cx - s * 0.3, cy - s * 0.15, s * 0.04, 0, 7);
      x.arc(cx + s * 0.32, cy - s * 0.1, s * 0.03, 0, 7);
      x.fill();
      x.strokeStyle = '#2a1a10';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(cx - s * 0.4, cy + s * 0.35);
      for (let k = 1; k <= 8; k++) x.lineTo(cx - s * 0.4 + k * s * 0.1, cy + s * (0.35 + (k % 2 ? 0.07 : -0.03)));
      x.stroke();
    });
  }),
  B('vampire', 'Count Ball', 'Spooky', 'epic', (x, W, H) => {
    fill(x, W, H, '#e8e2ea');
    x.fillStyle = '#151018';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(W, 0);
    x.lineTo(W, H * 0.3);
    for (let u = W; u >= 0; u -= W / 8) x.lineTo(u, H * (u % (W / 4) ? 0.3 : 0.38));
    x.fill();
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.3, cy - s * 0.1, s * 0.1, '#b01020');
      eye(x, cx + s * 0.3, cy - s * 0.1, s * 0.1, '#b01020');
      arc(x, cx, cy + s * 0.15, s * 0.3, 0.5, Math.PI - 0.5, s * 0.05, '#501018');
      x.fillStyle = '#fff';
      for (const d of [-1, 1]) {
        x.beginPath();
        x.moveTo(cx + d * s * 0.12, cy + s * 0.38);
        x.lineTo(cx + d * s * 0.07, cy + s * 0.55);
        x.lineTo(cx + d * s * 0.02, cy + s * 0.4);
        x.fill();
      }
    });
  }),
  B('mummy', 'Mummy', 'Spooky', 'rare', (x, W, H) => {
    fill(x, W, H, '#d8ccb0');
    const r = rng(14);
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(${(140 + r() * 60) | 0},${(120 + r() * 50) | 0},90,.7)`;
      x.lineWidth = 3 + r() * 5;
      const y = r() * H,
        t = (r() - 0.5) * 0.3;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(W, y + t * W * 0.2);
      x.stroke();
    }
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#100a06';
      x.fillRect(cx - s * 0.55, cy - s * 0.22, s * 1.1, s * 0.2);
      eye(x, cx - s * 0.25, cy - s * 0.12, s * 0.07, '#e0d040');
      eye(x, cx + s * 0.25, cy - s * 0.12, s * 0.07, '#e0d040');
    });
  }),
  B('cobweb', 'Cobweb', 'Spooky', 'common', (x, W, H) => {
    fill(x, W, H, '#1e1a24');
    x.strokeStyle = 'rgba(230,230,240,.7)';
    x.lineWidth = 1.4;
    for (const cx of [W * 0.25, W * 0.75]) {
      for (let a = 0; a < 12; a++) {
        x.beginPath();
        x.moveTo(cx, H / 2);
        x.lineTo(cx + Math.cos((a / 12) * 6.28) * 90, H / 2 + Math.sin((a / 12) * 6.28) * 90);
        x.stroke();
      }
      for (let r = 12; r < 90; r += 13) {
        x.beginPath();
        for (let a = 0; a <= 12; a++) {
          const ang = (a / 12) * 6.28;
          x.lineTo(cx + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r);
        }
        x.stroke();
      }
    }
  }),
  B('witch-brew', "Witch's Brew", 'Spooky', 'epic', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#3a1a5a'],
        [0.5, '#5a2a8a'],
        [1, '#1a0a2a'],
      ]),
    );
    const r = rng(15);
    for (let i = 0; i < 70; i++) {
      x.fillStyle = `rgba(${(120 + r() * 80) | 0},255,${(80 + r() * 60) | 0},${0.4 + r() * 0.5})`;
      x.beginPath();
      x.arc(r() * W, r() * H, 2 + r() * 9, 0, 7);
      x.fill();
    }
  }),
  B('black-cat', 'Black Cat', 'Spooky', 'rare', (x, W, H) => {
    fill(x, W, H, '#151218');
    face(x, W, H, (x, cx, cy, s) => {
      for (const d of [-1, 1]) {
        x.fillStyle = '#e8d030';
        x.beginPath();
        x.ellipse(cx + d * s * 0.3, cy - s * 0.1, s * 0.16, s * 0.12, 0, 0, 7);
        x.fill();
        x.fillStyle = '#000';
        x.beginPath();
        x.ellipse(cx + d * s * 0.3, cy - s * 0.1, s * 0.035, s * 0.11, 0, 0, 7);
        x.fill();
        x.strokeStyle = '#ddd';
        x.lineWidth = 1.5;
        for (let k = -1; k <= 1; k++) {
          x.beginPath();
          x.moveTo(cx + d * s * 0.15, cy + s * 0.25);
          x.lineTo(cx + d * s * 0.6, cy + s * (0.2 + k * 0.1));
          x.stroke();
        }
      }
      x.fillStyle = '#e88aa8';
      x.beginPath();
      x.moveTo(cx - s * 0.06, cy + s * 0.15);
      x.lineTo(cx + s * 0.06, cy + s * 0.15);
      x.lineTo(cx, cy + s * 0.24);
      x.fill();
    });
  }),
  // Legends (10) — invented celebrity-style characters, nobody real
  B('rockstar', 'The Rock Star', 'Legends', 'epic', (x, W, H) => {
    fill(x, W, H, '#f0c8a0');
    x.fillStyle = '#151515';
    x.beginPath();
    x.ellipse(W * 0.25, H * 0.08, W * 0.2, H * 0.22, 0, 0, 7);
    x.ellipse(W * 0.75, H * 0.05, W * 0.3, H * 0.18, 0, 0, 7);
    x.fill();
    x.fillRect(0, 0, W, H * 0.12);
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#c8302a';
      x.beginPath();
      x.roundRect(cx - s * 0.6, cy - s * 0.3, s * 1.2, s * 0.26, 10);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,.4)';
      x.fillRect(cx - s * 0.5, cy - s * 0.26, s * 0.2, s * 0.05);
      arc(x, cx + s * 0.15, cy + s * 0.3, s * 0.2, 0.2, 2.2, s * 0.07, '#7a2a1a');
    });
  }),
  B('moviestar', 'The Movie Star', 'Legends', 'epic', (x, W, H) => {
    fill(x, W, H, '#f6d2b8');
    x.fillStyle = '#f2d060';
    x.beginPath();
    for (let u = 0; u <= W; u += 20) x.ellipse(u, H * 0.12, 18, 26, 0, 0, 7);
    x.fill();
    face(x, W, H, (x, cx, cy, s) => {
      for (const d of [-1, 1]) {
        eye(x, cx + d * s * 0.3, cy - s * 0.15, s * 0.1, '#2a5a8a');
        x.strokeStyle = '#151515';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(cx + d * s * 0.18, cy - s * 0.3);
        x.lineTo(cx + d * s * 0.48, cy - s * 0.34);
        x.stroke();
      }
      x.fillStyle = '#d0203a';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.3, s * 0.22, s * 0.1, 0, 0, 7);
      x.fill();
      x.fillStyle = '#3a2010';
      x.beginPath();
      x.arc(cx + s * 0.35, cy + s * 0.2, 2.5, 0, 7);
      x.fill();
    });
  }),
  B('astronaut', 'The Astronaut', 'Legends', 'epic', (x, W, H) => {
    fill(x, W, H, '#f2f2f0');
    x.strokeStyle = '#c8c8c4';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(0, H * 0.18);
    x.lineTo(W, H * 0.18);
    x.moveTo(0, H * 0.85);
    x.lineTo(W, H * 0.85);
    x.stroke();
    face(x, W, H, (x, cx, cy, s) => {
      const g = x.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
      g.addColorStop(0, '#f2c860');
      g.addColorStop(0.5, '#9a6a20');
      g.addColorStop(1, '#2a1a08');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(cx, cy, s * 0.7, s * 0.55, 0, 0, 7);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.beginPath();
      x.ellipse(cx - s * 0.3, cy - s * 0.25, s * 0.15, s * 0.07, -0.5, 0, 7);
      x.fill();
    });
    x.fillStyle = '#d0302a';
    x.fillRect(W * 0.6, H * 0.3, 18, 12);
  }),
  B('luchador', 'El Bogey Grande', 'Legends', 'legendary', (x, W, H) => {
    fill(x, W, H, '#c8202a');
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#f2c82a';
      for (const d of [-1, 1]) {
        x.beginPath();
        x.moveTo(cx + d * s * 0.05, cy - s * 0.1);
        x.quadraticCurveTo(cx + d * s * 0.6, cy - s * 0.7, cx + d * s * 0.75, cy - s * 0.05);
        x.quadraticCurveTo(cx + d * s * 0.5, cy + s * 0.05, cx + d * s * 0.05, cy - s * 0.1);
        x.fill();
        x.fillStyle = '#fff';
        x.beginPath();
        x.ellipse(cx + d * s * 0.3, cy - s * 0.12, s * 0.16, s * 0.1, 0, 0, 7);
        x.fill();
        eye(x, cx + d * s * 0.3, cy - s * 0.12, s * 0.06);
        x.fillStyle = '#f2c82a';
      }
      x.fillStyle = '#fff';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.35, s * 0.25, s * 0.14, 0, 0, 7);
      x.fill();
      x.fillStyle = '#7a1a1a';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.35, s * 0.15, s * 0.06, 0, 0, 7);
      x.fill();
    });
  }),
  B('cowboy', 'The Cowboy', 'Legends', 'epic', (x, W, H) => {
    fill(x, W, H, '#e0b088');
    x.fillStyle = '#7a4a24';
    x.fillRect(0, 0, W, H * 0.28);
    x.fillStyle = '#3a2210';
    x.fillRect(0, H * 0.24, W, H * 0.05);
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.28, cy - s * 0.05, s * 0.08);
      eye(x, cx + s * 0.28, cy - s * 0.05, s * 0.08);
      x.fillStyle = '#4a2a14';
      x.beginPath();
      x.moveTo(cx - s * 0.45, cy + s * 0.32);
      x.quadraticCurveTo(cx, cy + s * 0.1, cx + s * 0.45, cy + s * 0.32);
      x.quadraticCurveTo(cx, cy + s * 0.22, cx - s * 0.45, cy + s * 0.32);
      x.fill();
    });
  }),
  B('pirate', 'The Captain', 'Legends', 'epic', (x, W, H) => {
    fill(x, W, H, '#d8a880');
    x.fillStyle = '#b0202a';
    x.fillRect(0, 0, W, H * 0.25);
    const r = rng(16);
    x.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      x.arc(r() * W, r() * H * 0.22, 3, 0, 7);
      x.fill();
    }
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.3, cy - s * 0.05, s * 0.1);
      x.fillStyle = '#111';
      x.beginPath();
      x.ellipse(cx + s * 0.3, cy - s * 0.05, s * 0.18, s * 0.15, 0, 0, 7);
      x.fill();
      x.strokeStyle = '#111';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(cx - s * 0.7, cy - s * 0.5);
      x.lineTo(cx + s * 0.75, cy + s * 0.2);
      x.stroke();
      x.fillStyle = '#3a2214';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.45, s * 0.4, s * 0.2, 0, 0, Math.PI);
      x.fill();
      arc(x, cx, cy + s * 0.15, s * 0.2, 0.4, Math.PI - 0.4, s * 0.06, '#6a2010');
    });
  }),
  B('diva', 'The Pop Diva', 'Legends', 'legendary', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#ff7ac8'],
        [1, '#9a3aff'],
      ]),
    );
    const r = rng(17);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
      const px = r() * W,
        py = r() * H,
        z = 1 + r() * 3;
      x.beginPath();
      x.moveTo(px, py - z * 2);
      x.lineTo(px + z * 0.5, py);
      x.lineTo(px, py + z * 2);
      x.lineTo(px - z * 0.5, py);
      x.fill();
    }
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#151515';
      for (const d of [-1, 1]) {
        x.beginPath();
        x.moveTo(cx + d * s * 0.6, cy - s * 0.35);
        x.lineTo(cx + d * s * 0.08, cy - s * 0.3);
        x.lineTo(cx + d * s * 0.12, cy - s * 0.05);
        x.lineTo(cx + d * s * 0.55, cy - s * 0.08);
        x.fill();
      }
      x.fillStyle = '#f2f';
      x.beginPath();
      x.ellipse(cx, cy + s * 0.3, s * 0.2, s * 0.09, 0, 0, 7);
      x.fill();
    });
  }),
  B('detective', 'The Detective', 'Legends', 'epic', (x, W, H) => {
    fill(x, W, H, '#e0bc98');
    x.fillStyle = '#6a5a48';
    x.fillRect(0, 0, W, H * 0.3);
    x.fillStyle = '#2a2018';
    x.fillRect(0, H * 0.24, W, H * 0.06);
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.3, cy, s * 0.07);
      x.strokeStyle = '#8a6a30';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(cx + s * 0.3, cy, s * 0.22, 0, 7);
      x.stroke();
      x.fillStyle = 'rgba(200,230,255,.5)';
      x.beginPath();
      x.arc(cx + s * 0.3, cy, s * 0.2, 0, 7);
      x.fill();
      eye(x, cx + s * 0.3, cy, s * 0.12);
      x.fillStyle = '#5a3218';
      x.fillRect(cx - s * 0.1, cy + s * 0.35, s * 0.35, s * 0.08);
    });
  }),
  B('chef', 'The Chef', 'Legends', 'rare', (x, W, H) => {
    fill(x, W, H, '#f0c8a8');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, W, H * 0.3);
    x.strokeStyle = '#e0e0e0';
    for (let u = 0; u < W; u += 24) {
      x.beginPath();
      x.moveTo(u, 0);
      x.lineTo(u, H * 0.3);
      x.stroke();
    }
    face(x, W, H, (x, cx, cy, s) => {
      eye(x, cx - s * 0.28, cy - s * 0.02, s * 0.08);
      eye(x, cx + s * 0.28, cy - s * 0.02, s * 0.08);
      x.strokeStyle = '#151515';
      x.lineWidth = s * 0.08;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(cx - s * 0.4, cy + s * 0.18);
      x.quadraticCurveTo(cx - s * 0.2, cy + s * 0.32, cx, cy + s * 0.22);
      x.quadraticCurveTo(cx + s * 0.2, cy + s * 0.32, cx + s * 0.4, cy + s * 0.18);
      x.stroke();
      x.fillStyle = '#d02030';
      x.fillRect(cx - s * 0.7, cy + s * 0.65, s * 1.4, s * 0.15);
    });
  }),
  B('surfer', 'The Surfer', 'Legends', 'rare', (x, W, H) => {
    fill(
      x,
      W,
      H,
      vgrad(x, H, [
        [0, '#f2d870'],
        [0.3, '#e0a070'],
        [0.75, '#2fa8c8'],
        [1, '#1a6aa0'],
      ]),
    );
    x.strokeStyle = '#fff';
    x.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      for (let u = 0; u <= W; u += 8) x.lineTo(u, H * (0.72 + k * 0.07) + Math.sin(u * 0.06 + k) * 4);
      x.stroke();
    }
    face(x, W, H, (x, cx, cy, s) => {
      x.fillStyle = '#ff6a3a';
      x.beginPath();
      x.roundRect(cx - s * 0.55, cy - s * 0.32, s * 1.1, s * 0.22, 8);
      x.fill();
      arc(x, cx, cy - s * 0.05, s * 0.3, 0.4, Math.PI - 0.4, s * 0.07);
    });
  }),
  // Animals (30) — Kenney's Animal Pack Redux (CC0)
  animal('bear', 'Bear', 'common'),
  animal('buffalo', 'Buffalo', 'common'),
  animal('chick', 'Chick', 'common'),
  animal('chicken', 'Chicken', 'common'),
  animal('cow', 'Cow', 'common'),
  animal('crocodile', 'Crocodile', 'rare'),
  animal('dog', 'Good Dog', 'common'),
  animal('duck', 'Duck', 'common'),
  animal('elephant', 'Elephant', 'rare'),
  animal('frog', 'Frog', 'common'),
  animal('giraffe', 'Giraffe', 'rare'),
  animal('goat', 'Goat', 'common'),
  animal('gorilla', 'Gorilla', 'rare'),
  animal('hippo', 'Hippo', 'common'),
  animal('horse', 'Horse', 'common'),
  animal('monkey', 'Monkey', 'common'),
  animal('moose', 'Moose', 'rare'),
  animal('narwhal', 'Narwhal', 'epic'),
  animal('owl', 'Owl', 'rare'),
  animal('panda', 'Panda', 'rare'),
  animal('parrot', 'Parrot', 'common'),
  animal('penguin', 'Penguin', 'rare'),
  animal('pig', 'Pig', 'common'),
  animal('rabbit', 'Rabbit', 'common'),
  animal('rhino', 'Rhino', 'common'),
  animal('sloth', 'Sloth', 'epic'),
  animal('snake', 'Snake', 'common'),
  animal('walrus', 'Walrus', 'epic'),
  animal('whale', 'Whale', 'rare'),
  animal('zebra', 'Zebra', 'rare'),
  // Masterpieces (14) — public-domain paintings
  painting('monalisa', 'Mona Lisa', 'legendary', '#6b5a32'),
  painting('starry', 'The Starry Night', 'legendary', '#2a4a8a'),
  painting('scream', 'The Scream', 'epic', '#c8642a'),
  painting('wave', 'The Great Wave', 'epic', '#c9c2a4'),
  painting('pearl', 'Girl with a Pearl Earring', 'epic', '#1c1a18'),
  painting('kiss', 'The Kiss', 'epic', '#b8922e'),
  painting('adam', 'The Creation of Adam', 'epic', '#cfc4b0'),
  painting('venus', 'The Birth of Venus', 'rare', '#9fb8a8'),
  painting('sunflowers', 'Sunflowers', 'rare', '#d9b93a'),
  painting('seurat', 'Sunday in the Park', 'rare', '#7f9a4a'),
  painting('mondrian', 'Red, Blue and Yellow', 'rare', '#e8e4dc', 2),
  painting('gothic', 'American Gothic', 'rare', '#8a8f7a'),
  painting('lilies', 'Water Lilies', 'rare', '#5f8fb0'),
  painting('shipwreck', 'The Shipwreck', 'rare', '#4a4a3a'),
  // Landmarks (8) — Openclipart silhouettes (CC0) against painted skies
  landmark('eiffel', 'Paris at Dusk', 'epic', {
    sky: ['#27255a', '#a8497f', '#ffb06a'],
    shape: '#170f22',
    ground: '#170f22',
    orb: ['#fff3d0', -0.2, 0.3, 0.05],
    size: 0.56,
    stars: true,
  }),
  landmark('liberty', 'Lady Liberty', 'epic', {
    sky: ['#5fb2e0', '#bfe4f4', '#f8ead0'],
    shape: '#3f9f8c',
    ground: '#2c6a84',
    orb: ['#fffbe6', 0.24, 0.28, 0.07],
    size: 0.54,
  }),
  landmark('bigben', 'Big Ben', 'rare', {
    sky: ['#33254f', '#d2503f', '#ffc56e'],
    shape: '#19121d',
    ground: '#19121d',
    orb: ['#ffe9a8', -0.22, 0.6, 0.09],
    size: 0.56,
  }),
  landmark('taj', 'Taj Mahal', 'rare', {
    sky: ['#b8507e', '#e98a78', '#fbd19a'],
    shape: '#fff9ee',
    ground: '#3d8a66',
    orb: ['#fff6d8', 0, 0.42, 0.1],
    size: 0.46,
    door: true,
  }),
  landmark('sydney', 'Opera House', 'rare', {
    sky: ['#1f7fd0', '#7cc6ee', '#e4f5fb'],
    shape: '#ffffff',
    ground: '#1b5a96',
    orb: ['#fffbe6', -0.3, 0.2, 0.06],
    size: 0.56,
  }),
  landmark('gate', 'Golden Gate', 'rare', {
    sky: ['#e9b58a', '#f6dcbc', '#fdf3e2'],
    shape: '#c63f27',
    ground: '#3a6c88',
    orb: ['#fff8e6', -0.18, 0.34, 0.08],
    size: 0.6,
  }),
  landmark('pisa', 'Leaning Tower', 'rare', {
    sky: ['#4a9de0', '#b6dff6', '#fdf5dc'],
    shape: '#e3d2a8',
    ground: '#69a548',
    orb: ['#fffbe6', 0.3, 0.22, 0.06],
    size: 0.5,
    tiers: 8,
  }),
  landmark(
    'pyramids',
    'The Pyramids',
    'epic',
    { sky: ['#e9762c', '#f7bb5c', '#fde6a2'], shape: '#c9963f', ground: '#e0b560', orb: ['#fff4c8', 0.02, 0.5, 0.1], size: 0.56 },
    (x, cx, floor, s) => {
      // three pyramids, each with a lit face and a shaded one
      for (const [dx, k] of [
        [-0.42, 0.42],
        [0.4, 0.55],
        [0, 0.8],
      ]) {
        const px = cx + dx * s,
          h = k * s * 0.72,
          w = k * s * 0.58;
        x.fillStyle = '#d6a549';
        x.beginPath();
        x.moveTo(px - w, floor);
        x.lineTo(px, floor - h);
        x.lineTo(px + w * 0.25, floor);
        x.fill();
        x.fillStyle = '#8f6426';
        x.beginPath();
        x.moveTo(px + w * 0.25, floor);
        x.lineTo(px, floor - h);
        x.lineTo(px + w, floor);
        x.fill();
      }
    },
  ),
];
export const BALL = new Map(BALLS.map(b => [b.id, b]));
export const DEFAULT_BALL = 'classic';

// ---------------------------------------------------------------- textures + previews
const texCache = new Map<string, THREE.CanvasTexture>(),
  canvasCache = new Map<string, HTMLCanvasElement>();
function repaint(id: string, c: HTMLCanvasElement) {
  const def = BALL.get(id) || BALL.get(DEFAULT_BALL)!,
    x = c.getContext('2d', { willReadFrequently: true })!;
  x.save();
  x.clearRect(0, 0, 512, 256);
  def.paint(x, 512, 256);
  x.restore();
}
function paintCanvas(id: string) {
  let c = canvasCache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  repaint(id, c);
  canvasCache.set(id, c);
  return c;
}
/** Load the art sheets. As each arrives, repaint the skins that use it and tell open menus (a 'ballskins' event). */
if (typeof Image !== 'undefined')
  for (const [key, file, set] of [
    ['animals', 'animals.png', 'Animals'],
    ['art', 'art.jpg', 'Masterpieces'],
    ['landmarks', 'landmarks.png', 'Landmarks'],
  ] as ['animals' | 'art' | 'landmarks', string, BallDef['set']][]) {
    const im = new Image();
    im.onload = () => {
      SHEET[key] = im;
      for (const [id, c] of canvasCache)
        if (BALL.get(id)?.set === set) {
          repaint(id, c);
          const t = texCache.get(id);
          if (t) t.needsUpdate = true;
        }
      dispatchEvent(new CustomEvent('ballskins', { detail: set }));
    };
    im.src = `${BASE}balls/${file}`;
  }
/** Texture for a ball skin (cached; shared by every ball wearing it). */
export function ballTexture(id: string) {
  let t = texCache.get(id);
  if (t) return t;
  t = new THREE.CanvasTexture(paintCanvas(id));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(id, t);
  return t;
}
export function ballMaterial(id: string, glow?: string) {
  const def = BALL.get(id),
    metal = id === 'chrome' || id === 'gold' || id === 'disco';
  return new THREE.MeshStandardMaterial({
    map: ballTexture(id),
    roughness: metal ? 0.18 : def?.set === 'Masterpieces' ? 0.55 : 0.35,
    metalness: metal ? 0.85 : 0,
    emissive: glow || '#000',
    emissiveIntensity: glow ? 0.12 : 0,
    ...(def?.id === 'sun' ? { emissive: '#ff9a20', emissiveIntensity: 0.6 } : {}),
  });
}
/** Little lit-sphere picture of a skin for menus (2D canvas, no WebGL). */
export function ballPreview(id: string, size = 72, spin = 0): HTMLCanvasElement {
  const src = paintCanvas(id),
    sx = src.getContext('2d')!.getImageData(0, 0, 512, 256).data;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!,
    img = x.createImageData(size, size),
    d = img.data,
    R = size / 2 - 1;
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const nx = (i - size / 2 + 0.5) / R,
        ny = (j - size / 2 + 0.5) / R,
        r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2),
        lon = Math.atan2(nx, nz) + spin,
        lat = Math.asin(-ny);
      const u = (((0.25 + lon / (Math.PI * 2)) % 1) + 1) % 1,
        v = 0.5 - lat / Math.PI,
        si = (Math.min(255, (v * 256) | 0) * 512 + ((u * 512) | 0)) * 4;
      const l = Math.max(0, nx * -0.4 + ny * -0.5 + nz * 0.77),
        sh = 0.35 + 0.75 * l,
        spec = Math.pow(Math.max(0, l), 30) * 120,
        o = (j * size + i) * 4,
        edge = Math.min(1, (1 - r2) * 18);
      d[o] = Math.min(255, sx[si] * sh + spec);
      d[o + 1] = Math.min(255, sx[si + 1] * sh + spec);
      d[o + 2] = Math.min(255, sx[si + 2] * sh + spec);
      d[o + 3] = 255 * edge;
    }
  x.putImageData(img, 0, 0);
  return c;
}
