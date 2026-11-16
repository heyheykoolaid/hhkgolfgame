// Procedural textures for characters: albedo + a normal map derived from a height field, so cloth and skin
// catch the low sun the way PS3-era assets did (weave, folds, seams) without any image files.
import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;
function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a tangent-space normal map from a grey height canvas. */
function normalFromHeight(h: HTMLCanvasElement, strength = 2) {
  const w = h.width,
    H = h.height,
    src = h.getContext('2d')!.getImageData(0, 0, w, H).data;
  const out = canvas(w, H),
    octx = out.getContext('2d')!,
    img = octx.createImageData(w, H),
    d = img.data;
  const at = (x: number, y: number) => src[(((y + H) % H) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      d[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  octx.putImageData(img, 0, 0);
  return out;
}
function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
function speckle(x: Ctx, w: number, h: number, n: number, r: () => number, col: (v: number) => string, size = 1) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = col(r());
    x.fillRect(r() * w, r() * h, size, size);
  }
}

export interface ClothSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughness: number;
}

/** Jersey knit (tees, hoodies). Big soft folds + fine knit + seams at the sides. */
export function knit(base: string, seed = 1, print?: (x: Ctx, w: number, h: number) => void): ClothSet {
  const W = 512,
    r = rng(seed),
    a = canvas(W),
    h = canvas(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = base;
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  // soft drape folds (vertical-ish, gathered near the hem = bottom of the texture)
  for (let i = 0; i < 26; i++) {
    const x0 = r() * W,
      wdt = 10 + r() * 40,
      g = hx.createLinearGradient(x0 - wdt, 0, x0 + wdt, 0);
    g.addColorStop(0, 'rgba(128,128,128,0)');
    g.addColorStop(0.5, r() > 0.5 ? 'rgba(170,170,170,.55)' : 'rgba(80,80,80,.55)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    hx.fillStyle = g;
    hx.save();
    hx.translate(x0, W);
    hx.rotate((r() - 0.5) * 0.35);
    hx.fillRect(-wdt, -W * (0.3 + r() * 0.7), wdt * 2, W);
    hx.restore();
  }
  // fine knit rows
  for (let y = 0; y < W; y += 2) {
    hx.fillStyle = `rgba(${y % 4 ? 150 : 100},${y % 4 ? 150 : 100},${y % 4 ? 150 : 100},.25)`;
    hx.fillRect(0, y, W, 1);
  }
  speckle(hx, W, W, 9000, r, v => `rgba(${v > 0.5 ? 200 : 60},${v > 0.5 ? 200 : 60},${v > 0.5 ? 200 : 60},.35)`);
  // albedo: fold shading baked + wash-out + lint
  ax.globalCompositeOperation = 'overlay';
  ax.globalAlpha = 0.45;
  ax.drawImage(h, 0, 0);
  ax.globalAlpha = 1;
  ax.globalCompositeOperation = 'source-over';
  speckle(ax, W, W, 2500, r, v => `rgba(255,255,255,${0.04 + v * 0.06})`, 2);
  // side seams (u = 0 / 0.5 are the sides on our lofts)
  for (const sx of [0, W / 2]) {
    ax.fillStyle = 'rgba(0,0,0,.18)';
    ax.fillRect(sx - 1, 0, 2, W);
    hx.fillStyle = '#5a5a5a';
    hx.fillRect(sx - 1, 0, 2, W);
  }
  // hem stitching at the bottom
  ax.fillStyle = 'rgba(0,0,0,.2)';
  ax.fillRect(0, W - 16, W, 2);
  hx.fillStyle = '#6a6a6a';
  hx.fillRect(0, W - 16, W, 2);
  if (print) print(ax, W, W);
  return { map: tex(a, true), normalMap: tex(normalFromHeight(h, 3), false), roughness: 0.92 };
}

/** Cotton twill (cargos, work pants): diagonal weave, wear on the knees, pocket seams baked by geometry. */
export function twill(base: string, seed = 2): ClothSet {
  const W = 512,
    r = rng(seed),
    a = canvas(W),
    h = canvas(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = base;
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  hx.strokeStyle = 'rgba(170,170,170,.5)';
  hx.lineWidth = 1.2;
  for (let i = -W; i < W * 2; i += 4) {
    hx.beginPath();
    hx.moveTo(i, 0);
    hx.lineTo(i + W * 0.5, W);
    hx.stroke();
  }
  // bunching folds around the ankles (bottom) and behind the knee (middle)
  for (let i = 0; i < 40; i++) {
    const y0 = r() > 0.4 ? W * (0.82 + r() * 0.17) : W * (0.45 + r() * 0.12),
      x0 = r() * W,
      len = 30 + r() * 90;
    hx.strokeStyle = r() > 0.5 ? 'rgba(200,200,200,.6)' : 'rgba(60,60,60,.6)';
    hx.lineWidth = 3 + r() * 6;
    hx.beginPath();
    hx.moveTo(x0, y0);
    hx.quadraticCurveTo(x0 + len * 0.5, y0 + (r() - 0.5) * 20, x0 + len, y0 + (r() - 0.5) * 14);
    hx.stroke();
  }
  hx.filter = 'blur(1.5px)';
  hx.drawImage(h, 0, 0);
  hx.filter = 'none';
  ax.globalCompositeOperation = 'overlay';
  ax.globalAlpha = 0.4;
  ax.drawImage(h, 0, 0);
  ax.globalAlpha = 1;
  ax.globalCompositeOperation = 'source-over';
  // worn knees + dusty cuffs
  const knee = ax.createRadialGradient(W * 0.25, W * 0.5, 4, W * 0.25, W * 0.5, 70);
  knee.addColorStop(0, 'rgba(255,240,210,.18)');
  knee.addColorStop(1, 'rgba(255,240,210,0)');
  ax.fillStyle = knee;
  ax.fillRect(0, 0, W, W);
  const dust = ax.createLinearGradient(0, W * 0.85, 0, W);
  dust.addColorStop(0, 'rgba(160,130,90,0)');
  dust.addColorStop(1, 'rgba(160,130,90,.35)');
  ax.fillStyle = dust;
  ax.fillRect(0, 0, W, W);
  for (const sx of [0, W / 2]) {
    ax.fillStyle = 'rgba(0,0,0,.25)';
    ax.fillRect(sx - 1.5, 0, 3, W);
    hx.fillStyle = '#505050';
    hx.fillRect(sx - 1.5, 0, 3, W);
  }
  return { map: tex(a, true), normalMap: tex(normalFromHeight(h, 2.5), false), roughness: 0.95 };
}

/** Baseball cap cotton: twill weave, six panel seams with stitching, a little sweat/fade near the band. */
export function capCloth(base: string, seed = 10): ClothSet {
  const t = twill(base, seed),
    W = 512,
    a = canvas(W),
    h = canvas(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.drawImage((t.map as THREE.CanvasTexture).image, 0, 0);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  hx.strokeStyle = 'rgba(170,170,170,.45)';
  hx.lineWidth = 1;
  for (let i = -W; i < W * 2; i += 3) {
    hx.beginPath();
    hx.moveTo(i, 0);
    hx.lineTo(i + W * 0.4, W);
    hx.stroke();
  }
  for (let k = 0; k < 6; k++) {
    const x = (k / 6) * W;
    hx.fillStyle = '#3c3c3c';
    hx.fillRect(x - 2, 0, 4, W); // seam groove
    for (const o of [-6, 6])
      for (let y = 4; y < W; y += 9) {
        ax.fillStyle = 'rgba(0,0,0,.18)';
        ax.fillRect(x + o - 0.8, y, 1.6, 5);
        hx.fillStyle = '#9a9a9a';
        hx.fillRect(x + o - 0.8, y, 1.6, 5);
      } // top-stitching
    ax.fillStyle = 'rgba(0,0,0,.22)';
    ax.fillRect(x - 1.5, 0, 3, W);
  }
  const fade = ax.createLinearGradient(0, W * 0.7, 0, W);
  fade.addColorStop(0, 'rgba(255,240,220,0)');
  fade.addColorStop(1, 'rgba(255,240,220,.12)');
  ax.fillStyle = fade;
  ax.fillRect(0, 0, W, W);
  return { map: tex(a, true), normalMap: tex(normalFromHeight(h, 2), false), roughness: 0.9 };
}

/** Skin: warm base, subtle mottling and pores, slightly redder joints. */
export function skin(base: string, seed = 3): ClothSet {
  const W = 256,
    r = rng(seed),
    a = canvas(W),
    h = canvas(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = base;
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  speckle(ax, W, W, 1600, r, v => (v > 0.5 ? 'rgba(150,60,40,.06)' : 'rgba(255,230,200,.05)'), 6);
  speckle(hx, W, W, 6000, r, v => `rgba(${v > 0.5 ? 150 : 100},${v > 0.5 ? 150 : 100},${v > 0.5 ? 150 : 100},.5)`);
  return { map: tex(a, true), normalMap: tex(normalFromHeight(h, 0.8), false), roughness: 0.6 };
}

/** Face, painted on an equirect sphere map (face centre at u = 0.25). PS2/PS3-style painted features. */
export function face(skinBase: string, opts: { brow?: string; stubble?: boolean; seed?: number } = {}): ClothSet {
  const W = 1024,
    H = 512,
    r = rng(opts.seed || 7),
    a = canvas(W, H),
    h = canvas(W, H),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = skinBase;
  ax.fillRect(0, 0, W, H);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, H);
  speckle(ax, W, H, 5000, r, v => (v > 0.5 ? 'rgba(150,60,40,.05)' : 'rgba(255,230,200,.05)'), 5);
  speckle(hx, W, H, 20000, r, v => `rgba(${v > 0.5 ? 150 : 100},${v > 0.5 ? 150 : 100},${v > 0.5 ? 150 : 100},.5)`);
  const cx = W * 0.25,
    eyeY = H * 0.5,
    ex = W * 0.034; // each degree ≈ W/360 px horizontally
  const blob = (x: number, y: number, rx: number, ry: number, c: string) => {
    ax.save();
    ax.translate(x, y);
    ax.scale(rx, ry);
    const g = ax.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ax.fillStyle = g;
    ax.beginPath();
    ax.arc(0, 0, 1, 0, Math.PI * 2);
    ax.fill();
    ax.restore();
  };
  // features are drawn at a nominal scale, then stretched to fit the lofted head's UV layout
  for (const c of [ax, hx]) {
    c.save();
    c.translate(cx, eyeY);
    c.scale(2.0, 1.9);
    c.translate(-cx, -eyeY);
  }
  // cheeks + nose warmth, eye sockets
  blob(cx - ex * 1.5, eyeY + 40, 34, 22, 'rgba(200,90,70,.18)');
  blob(cx + ex * 1.5, eyeY + 40, 34, 22, 'rgba(200,90,70,.18)');
  blob(cx, eyeY + 32, 14, 26, 'rgba(190,90,70,.16)');
  for (const s of [-1, 1]) blob(cx + s * ex, eyeY - 2, 30, 16, 'rgba(70,35,25,.28)');
  if (opts.stubble) {
    ax.save();
    ax.globalAlpha = 0.5;
    for (let i = 0; i < 3500; i++) {
      const t = r() * Math.PI,
        rr = 0.55 + r() * 0.45;
      const x = cx + Math.cos(t) * 95 * rr,
        y = eyeY + 60 + Math.sin(t) * 62 * rr;
      ax.fillStyle = 'rgba(40,28,20,.35)';
      ax.fillRect(x, y, 1.5, 1.5);
    }
    ax.restore();
  }
  // eyes: white, iris, pupil, lid line, catch-light
  for (const s of [-1, 1]) {
    const x = cx + s * ex,
      y = eyeY;
    blob(x, y - 6, 22, 11, 'rgba(60,30,22,.22)'); // shadow under the brow
    ax.save();
    ax.beginPath();
    ax.ellipse(x, y, 12.5, 5.2, 0, 0, Math.PI * 2);
    ax.clip();
    ax.fillStyle = '#d8cdc2';
    ax.fillRect(x - 14, y - 7, 28, 14);
    const ir = ax.createRadialGradient(x - s, y + 0.3, 1, x - s, y + 0.3, 5.6);
    ir.addColorStop(0, '#2c1d12');
    ir.addColorStop(0.45, '#4f3726');
    ir.addColorStop(1, '#2a1b11');
    ax.fillStyle = ir;
    ax.beginPath();
    ax.arc(x - s, y + 0.3, 5.4, 0, Math.PI * 2);
    ax.fill();
    ax.fillStyle = '#0e0906';
    ax.beginPath();
    ax.arc(x - s, y + 0.3, 2.3, 0, Math.PI * 2);
    ax.fill();
    const lid = ax.createLinearGradient(0, y - 6, 0, y);
    lid.addColorStop(0, 'rgba(40,20,14,.55)');
    lid.addColorStop(1, 'rgba(40,20,14,0)');
    ax.fillStyle = lid;
    ax.fillRect(x - 14, y - 7, 28, 7);
    ax.restore(); // the upper lid shades the eyeball
    ax.fillStyle = 'rgba(255,255,255,.55)';
    ax.fillRect(x - s + 1.2, y - 2.4, 1.6, 1.6);
    ax.strokeStyle = 'rgba(34,18,12,.9)';
    ax.lineWidth = 2.2;
    ax.beginPath();
    ax.ellipse(x, y + 0.6, 13, 5.8, 0, Math.PI * 1.06, Math.PI * 1.94);
    ax.stroke();
    ax.strokeStyle = 'rgba(60,30,20,.25)';
    ax.lineWidth = 1.2;
    ax.beginPath();
    ax.ellipse(x, y + 3, 12.5, 6, 0, Math.PI * 0.15, Math.PI * 0.85);
    ax.stroke();
    blob(x, y + 9, 14, 5, 'rgba(70,35,25,.12)'); // soft bag under the eye
    // brows: thick, slightly angled
    ax.save();
    ax.globalAlpha = 0.8;
    ax.strokeStyle = opts.brow || '#2b1d14';
    ax.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      const f = k / 25,
        bx = x - s * 15 + s * 32 * f,
        by = y - 18 - Math.sin(f * Math.PI) * 4.5 + (f > 0.7 ? (f - 0.7) * 6 : 0);
      ax.lineWidth = 1.3;
      ax.beginPath();
      ax.moveTo(bx, by + 2.5 - f * 1.5);
      ax.lineTo(bx + s * 3.5, by - 1.5 + r() * 1.2);
      ax.stroke();
    }
    ax.restore();
    hx.fillStyle = '#5a5a5a';
    hx.beginPath();
    hx.ellipse(x, y + 1, 17, 9, 0, 0, Math.PI * 2);
    hx.fill();
  }
  // nostrils + mouth
  for (const s of [-1, 1]) blob(cx + s * 9, eyeY + 52, 5, 3, 'rgba(70,30,20,.5)');
  blob(cx, eyeY + 78, 24, 5, 'rgba(150,70,58,.3)');
  blob(cx, eyeY + 86, 17, 5.5, 'rgba(165,78,62,.38)'); // upper and lower lip colour
  ax.strokeStyle = 'rgba(90,40,32,.85)';
  ax.lineWidth = 2.2;
  ax.lineCap = 'round';
  ax.beginPath();
  ax.moveTo(cx - 24, eyeY + 81);
  ax.quadraticCurveTo(cx, eyeY + 84, cx + 24, eyeY + 80);
  ax.stroke();
  blob(cx, eyeY + 96, 16, 5, 'rgba(60,30,22,.14)'); // shadow under the lower lip
  for (const s of [-1, 1]) {
    ax.strokeStyle = 'rgba(90,45,35,.16)';
    ax.lineWidth = 3;
    ax.beginPath();
    ax.moveTo(cx + s * 16, eyeY + 50);
    ax.quadraticCurveTo(cx + s * 26, eyeY + 68, cx + s * 27, eyeY + 82);
    ax.stroke();
  } // smile lines
  hx.strokeStyle = '#404040';
  hx.lineWidth = 4;
  hx.beginPath();
  hx.moveTo(cx - 22, eyeY + 80);
  hx.quadraticCurveTo(cx, eyeY + 84, cx + 22, eyeY + 79);
  hx.stroke();
  ax.restore();
  hx.restore();
  // ears are separate meshes; darken the back/sides slightly (hairline shadow)
  const g = ax.createLinearGradient(0, 0, 0, H * 0.3);
  g.addColorStop(0, 'rgba(40,25,15,.5)');
  g.addColorStop(1, 'rgba(40,25,15,0)');
  ax.fillStyle = g;
  ax.fillRect(0, 0, W, H * 0.3);
  const t = tex(a, true);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  const n = tex(normalFromHeight(h, 1.2), false);
  n.wrapT = THREE.ClampToEdgeWrapping;
  return { map: t, normalMap: n, roughness: 0.62 };
}

/** Rubber/canvas shoe and plain painted plastics. */
export function solid(base: string, rough = 0.8, seed = 4, grain = 0.4): ClothSet {
  const W = 128,
    r = rng(seed),
    a = canvas(W),
    h = canvas(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = base;
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  speckle(ax, W, W, 800, r, v => (v > 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)'), 3);
  speckle(hx, W, W, 3000, r, v => `rgba(${v > 0.5 ? 180 : 80},${v > 0.5 ? 180 : 80},${v > 0.5 ? 180 : 80},${grain})`);
  return { map: tex(a, true), normalMap: tex(normalFromHeight(h, 1), false), roughness: rough };
}

/** Messy short hair strands. */
export function hair(base: string, seed = 5): ClothSet {
  const W = 256,
    r = rng(seed),
    a = canvas(W),
    h = canvas(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = base;
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  for (let i = 0; i < 2600; i++) {
    const x = r() * W,
      y = r() * W,
      l = 6 + r() * 16,
      ang = Math.PI / 2 + (r() - 0.5) * 0.9,
      v = r();
    for (const [ctx, col] of [
      [ax, v > 0.5 ? 'rgba(255,230,190,.12)' : 'rgba(0,0,0,.18)'],
      [hx, v > 0.5 ? 'rgba(220,220,220,.5)' : 'rgba(40,40,40,.5)'],
    ] as [Ctx, string][]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l);
      ctx.stroke();
    }
  }
  return { map: tex(a, true), normalMap: tex(normalFromHeight(h, 3), false), roughness: 0.75 };
}
