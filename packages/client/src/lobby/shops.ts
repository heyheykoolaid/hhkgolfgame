// The West Side's four working shops, built in code so each looks like what it sells: Threads (clothing), The Clip
// Joint (barber), Ink Spot (tattoos) and the Pro Shop. One shared storefront (walls, a recessed glazed door, lit
// display windows, a sign band, an optional striped awning) and then each shop's own dressing in and around it.
import * as THREE from 'three';
import { M, box, cyl, textTex } from './world';

function stripeTex(a: string, b: string, n: number) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  for (let i = 0; i < n * 2; i++) {
    x.fillStyle = i % 2 ? b : a;
    x.fillRect((i * 256) / (n * 2), 0, 256 / (n * 2) + 1, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Brick, clapboard or tile, drawn small and tiled across a wall. */
function wallTex(kind: 'brick' | 'board' | 'tile' | 'plaster', base: string, line: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = line;
  x.lineWidth = 2;
  if (kind === 'brick')
    for (let r = 0; r < 8; r++) {
      x.strokeRect(-2, r * 16, 132, 16);
      for (let k = 0; k < 5; k++) x.strokeRect(k * 32 - (r % 2 ? 16 : 0), r * 16, 32, 16);
    }
  else if (kind === 'board') for (let r = 0; r < 8; r++) x.strokeRect(-2, r * 16, 132, 16);
  else if (kind === 'tile') for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) x.strokeRect(k * 32, r * 32, 32, 32);
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.06})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const wallM = (kind: Parameters<typeof wallTex>[0], base: string, line: string, w: number, h: number) => {
  const t = wallTex(kind, base, line);
  t.repeat.set(w / 1.6, h / 1.6);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
};
const glow = (c: string, k = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.5 });
function lettering(text: string, w: number, h: number, bg: string, fg: string, k = 0.6) {
  const t = textTex([{ t: text, s: 110, c: fg, b: true, y: 150 }], 1024, 256, bg);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: k, roughness: 0.7 }),
  );
}
interface Front {
  /** middle of the front, the front's z (the shop runs back from it), width, height, depth */
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  wall: THREE.Material;
  trim: string;
  sign: [string, string, string]; // text, background, letters
  awning?: [string, string];
  doorW?: number;
}
/** The shared storefront. Returns the group (origin at the middle of the front, at ground level, facing -z) and the
 *  two display windows' sills (x of each middle, width), for the shop's own display. */
function storefront(f: Front) {
  const g = new THREE.Group(),
    trim = M(f.trim, 0.7),
    dark = M('#1c1a1c', 0.6),
    dw = f.doorW ?? 1.5,
    ww = (f.w - dw - 1.8) / 2, // each window's width
    wx = dw / 2 + 0.45 + ww / 2,
    sillY = 0.75,
    winH = 2.25;
  g.position.set(f.x, 0, f.z);
  // the shell: the body starts a metre back, and the front wall is built round the window and door openings
  const FD = 1.0,
    pier = (x0: number, x1: number, y0: number, y1: number) => g.add(box(x1 - x0, y1 - y0, FD, f.wall, (x0 + x1) / 2, (y0 + y1) / 2, FD / 2));
  g.add(
    box(f.w, f.h, f.d - FD, f.wall, 0, f.h / 2, FD + (f.d - FD) / 2),
    box(f.w + 0.3, 0.28, f.d + 0.3, trim, 0, f.h + 0.14, f.d / 2),
    box(f.w + 0.1, 0.35, 0.18, trim, 0, 0.175, -0.05),
  );
  pier(-f.w / 2, f.w / 2, sillY + winH, f.h); // above the windows and door
  pier(-f.w / 2, -wx - ww / 2, 0, sillY + winH); // the corners
  pier(wx + ww / 2, f.w / 2, 0, sillY + winH);
  for (const sd of [-1, 1]) {
    const a = sd * (wx - ww / 2),
      b = sd * (dw / 2 + 0.15);
    pier(Math.min(a, b), Math.max(a, b), 0, sillY + winH); // between window and door
    pier(sd * wx - ww / 2, sd * wx + ww / 2, 0, sillY); // under each sill
  }
  pier(-dw / 2 - 0.15, dw / 2 + 0.15, 2.6, sillY + winH); // over the door
  // the lit inside seen through the glass: a warm back wall set a little way in, floor and ceiling of the display
  const inside = glow('#ffcf8a', 0.55);
  for (const s of [-1, 1]) {
    g.add(box(ww, winH, 0.05, inside, s * wx, sillY + winH / 2, 0.9), box(ww, 0.06, 0.9, M('#8a6a45', 0.8), s * wx, sillY, 0.45));
    // the frame, and a pane of glass with a soft reflection
    g.add(box(ww + 0.2, 0.12, 0.2, trim, s * wx, sillY - 0.06, -0.02), box(ww + 0.2, 0.12, 0.2, trim, s * wx, sillY + winH + 0.06, -0.02));
    for (const e of [-1, 1]) g.add(box(0.12, winH + 0.24, 0.2, trim, s * wx + (e * (ww + 0.12)) / 2, sillY + winH / 2, -0.02));
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(ww, winH),
      new THREE.MeshStandardMaterial({ color: '#bfd8e0', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.16 }),
    );
    pane.position.set(s * wx, sillY + winH / 2, -0.03);
    pane.rotation.y = Math.PI;
    g.add(pane);
  }
  // the door: recessed, half glazed, with a brass pull and a step
  g.add(
    box(dw + 0.3, 2.6, 0.5, dark, 0, 1.3, 0.3),
    box(dw, 2.35, 0.08, trim, 0, 1.2, 0.1),
    box(dw - 0.3, 1.2, 0.03, inside, 0, 1.55, 0.05),
    box(0.05, 0.4, 0.06, M('#d9b45a', 0.3, 0.7), dw / 2 - 0.2, 1.1, 0.03),
    box(dw + 0.5, 0.1, 0.5, M('#b9ad98', 0.9), 0, 0.05, -0.2),
  );
  // the sign band
  const band = lettering(f.sign[0], f.w - 0.6, 0.85, f.sign[1], f.sign[2]);
  band.position.set(0, f.h - 0.75, -0.06);
  band.rotation.y = Math.PI;
  g.add(band, box(f.w - 0.4, 1.0, 0.1, trim, 0, f.h - 0.75, 0.0));
  if (f.awning) {
    const am = new THREE.MeshStandardMaterial({ map: stripeTex(f.awning[0], f.awning[1], Math.round(f.w)), roughness: 0.85, side: THREE.DoubleSide }),
      aw = new THREE.Mesh(new THREE.PlaneGeometry(f.w - 0.2, 1.5), am);
    aw.rotation.x = Math.PI / 2 - 0.42;
    aw.position.set(0, sillY + winH + 0.55, -0.72);
    const val = new THREE.Mesh(new THREE.PlaneGeometry(f.w - 0.2, 0.28), am);
    val.position.set(0, sillY + winH + 0.1, -1.4);
    g.add(aw, val);
    for (const s of [-1, 1]) g.add(cyl(0.02, 0.02, 1.5, 5, dark, (s * (f.w - 0.3)) / 2, sillY + winH + 0.55, -0.72).rotateX(Math.PI / 2 - 0.42));
  }
  // a lamp either side of the door
  for (const s of [-1, 1])
    g.add(box(0.12, 0.3, 0.14, dark, s * (dw / 2 + 0.22), 2.3, -0.1), box(0.1, 0.16, 0.1, glow('#ffe2a0', 2), s * (dw / 2 + 0.22), 2.22, -0.14));
  g.traverse(o => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return { g, wx, ww, sillY };
}

/** Build the row. Fronts face -z along z = front. Returns a per-frame update (the barber's pole turns). */
export function buildShopRow(G: THREE.Group, front: number, col: (x0: number, x1: number, z0: number, z1: number) => void) {
  const spin: THREE.Object3D[] = [];
  // ---- Threads: painted brick, a striped awning, dressed mannequins in the windows
  {
    const w = 12,
      s = storefront({
        x: -110.9,
        z: front,
        w,
        h: 5.2,
        d: 9,
        wall: wallM('brick', '#8a4a3a', '#6a362a', w, 5.2),
        trim: '#f1e6d0',
        sign: ['THREADS', '#27405e', '#ffe9a8'],
        awning: ['#27405e', '#f1e6d0'],
      });
    const shirts = ['#c8452f', '#2f8a86', '#e2b23a', '#6a4a8a', '#f1e6d0', '#3a5a3a'];
    for (const sd of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const mx = sd * s.wx + (i - 1) * (s.ww / 3.2),
          cloth = M(shirts[(i + (sd > 0 ? 3 : 0)) % 6], 0.8),
          form = new THREE.Mesh(
            new THREE.LatheGeometry(
              [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(0.17, 0.02),
                new THREE.Vector2(0.2, 0.3),
                new THREE.Vector2(0.15, 0.5),
                new THREE.Vector2(0.21, 0.66),
                new THREE.Vector2(0.07, 0.74),
                new THREE.Vector2(0.06, 0.8),
                new THREE.Vector2(0, 0.8),
              ],
              10,
            ),
            cloth,
          );
        form.scale.z = 0.6;
        form.position.set(mx, s.sillY + 0.75, 0.45);
        s.g.add(
          form,
          cyl(0.02, 0.02, 0.75, 5, M('#3a3a3c', 0.5, 0.5), mx, s.sillY + 0.38, 0.45),
          cyl(0.14, 0.14, 0.03, 10, M('#3a3a3c', 0.5, 0.5), mx, s.sillY + 0.03, 0.45),
        );
      }
    G.add(s.g);
    col(-110.9 - w / 2, -110.9 + w / 2, front, front + 9);
  }
  // ---- The Clip Joint: white tile, a turning barber's pole, a chair in the window
  {
    const w = 7,
      s = storefront({
        x: -100.2,
        z: front,
        w,
        h: 4.4,
        d: 8,
        wall: wallM('tile', '#eef0ee', '#c9d2d0', w, 4.4),
        trim: '#27405e',
        sign: ['THE CLIP JOINT', '#f1eee6', '#8a2f28'],
        doorW: 1.3,
      });
    const pt = stripeTex('#c8452f', '#f1eee6', 2);
    pt.wrapS = pt.wrapT = THREE.RepeatWrapping;
    pt.repeat.set(1, 3);
    pt.rotation = 0.6;
    const pole = cyl(
      0.11,
      0.11,
      0.95,
      14,
      new THREE.MeshStandardMaterial({ map: pt, emissive: '#ffffff', emissiveMap: pt, emissiveIntensity: 0.35, roughness: 0.4 }),
      -w / 2 + 0.05,
      2.1,
      -0.28,
    );
    pole.userData.noBatch = true;
    spin.push(pole);
    const chrome = M('#c9ccd0', 0.25, 0.8);
    s.g.add(
      pole,
      cyl(0.14, 0.14, 0.1, 12, chrome, -w / 2 + 0.05, 2.62, -0.28),
      cyl(0.14, 0.14, 0.1, 12, chrome, -w / 2 + 0.05, 1.58, -0.28),
      box(0.3, 0.08, 0.3, chrome, -w / 2 + 0.05, 2.1, -0.12),
    );
    // a barber's chair seen through the right-hand window, and a shelf of bottles through the left
    const leather = M('#7a2a22', 0.5),
      cx = -s.wx;
    s.g.add(
      cyl(0.28, 0.32, 0.08, 12, chrome, cx, s.sillY + 0.07, 0.5),
      cyl(0.05, 0.05, 0.4, 8, chrome, cx, s.sillY + 0.3, 0.5),
      box(0.5, 0.12, 0.5, leather, cx, s.sillY + 0.55, 0.5),
      box(0.5, 0.6, 0.1, leather, cx, s.sillY + 0.9, 0.72),
      box(0.3, 0.14, 0.08, leather, cx, s.sillY + 1.27, 0.72),
    );
    for (let i = 0; i < 5; i++)
      s.g.add(
        cyl(
          0.04,
          0.05,
          0.22 + (i % 2) * 0.06,
          8,
          M(['#7fb0c8', '#e2b23a', '#9ac87a', '#c8452f', '#f1eee6'][i], 0.3),
          s.wx - 0.5 + i * 0.25,
          s.sillY + 0.14,
          0.5,
        ),
      );
    G.add(s.g);
    col(-100.2 - w / 2, -100.2 + w / 2, front, front + 8);
  }
  // ---- Ink Spot: black-painted brick, a neon sign, flash sheets in the windows
  {
    const w = 9,
      s = storefront({
        x: -90.7,
        z: front,
        w,
        h: 4.8,
        d: 8,
        wall: wallM('brick', '#2a2630', '#1a1820', w, 4.8),
        trim: '#1a1820',
        sign: ['INK SPOT', '#141016', '#ff5a8a'],
      });
    const neon = glow('#ff5a8a', 2.4);
    s.g.add(box(w - 1, 0.05, 0.05, neon, 0, 4.8 - 1.3, -0.1), box(w - 1, 0.05, 0.05, glow('#5ad8ff', 2.2), 0, 4.8 - 0.2, -0.1));
    const tt = textTex([{ t: 'TATTOO', s: 150, c: '#5ad8ff', b: true, y: 160 }], 512, 256, '#141016'),
      open = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.75),
        new THREE.MeshStandardMaterial({ map: tt, emissive: '#ffffff', emissiveMap: tt, emissiveIntensity: 1.1 }),
      );
    open.position.set(s.wx, s.sillY + 1.7, 0.2);
    open.rotation.y = Math.PI;
    s.g.add(open);
    // flash: little framed sheets on the display's back wall
    // flash: the game's own tattoo designs (golfer/tattoos.png is a sheet of 18, six across), one to a frame
    const sheet = new THREE.TextureLoader().load(new URL('golfer/tattoos.png', document.baseURI).href);
    sheet.colorSpace = THREE.SRGBColorSpace;
    let fi = 0;
    const flash = () => {
      const t = sheet.clone(),
        i = (fi++ * 5) % 18;
      t.repeat.set(1 / 6, 1 / 3);
      t.offset.set((i % 6) / 6, 1 - (Math.floor(i / 6) + 1) / 3);
      t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: t, transparent: true, color: '#241c1c' }));
      m.rotation.y = Math.PI;
      return m;
    };
    for (const sd of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const fx = sd * s.wx + ((i % 3) - 1) * 0.62,
          fy = s.sillY + 0.55 + Math.floor(i / 3) * 0.72;
        if (sd > 0 && i >= 3) continue; // (the TATTOO sign hangs there)
        s.g.add(
          box(0.46, 0.58, 0.03, M('#f1e6d0', 0.9), fx, fy, 0.86),
          (() => {
            const m = flash();
            m.position.set(fx, fy + 0.02, 0.838);
            return m;
          })(),
          box(0.5, 0.62, 0.02, M('#1c1a1c', 0.6), fx, fy, 0.875),
        );
      }
    G.add(s.g);
    col(-90.7 - w / 2, -90.7 + w / 2, front, front + 8);
  }
  // ---- the Pro Shop: green clapboard under a shingled gable, clubs and a bag in the window, a golf ball on the roof
  {
    const w = 11,
      h = 4.2,
      s = storefront({
        x: -79.2,
        z: front,
        w,
        h,
        d: 9,
        wall: wallM('board', '#3f6a4a', '#2f5038', w, h),
        trim: '#f1e6d0',
        sign: ['PRO SHOP', '#2b4a3a', '#ffe9a8'],
        awning: ['#2b4a3a', '#f1e6d0'],
      });
    const roofM = M('#5a4636', 0.9),
      tri = new THREE.Shape();
    tri.moveTo(-w / 2 - 0.35, 0);
    tri.lineTo(w / 2 + 0.35, 0);
    tri.lineTo(0, 2.3);
    tri.closePath();
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 9.5, bevelEnabled: false }), roofM);
    gable.position.set(0, h + 0.28, -0.25);
    const ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.75, 2),
      new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.5, flatShading: true }),
    );
    ball.position.set(0, h + 0.28 + 2.3 + 0.95, 0.6);
    s.g.add(gable, ball, cyl(0.2, 0.26, 0.5, 8, M('#e9e4d4', 0.7), 0, h + 0.28 + 2.3 + 0.1, 0.6));
    // a golf bag with clubs through one window, a rack of clubs through the other
    const steel = M('#c9ccd0', 0.3, 0.7),
      bx = -s.wx;
    s.g.add(cyl(0.16, 0.14, 0.9, 10, M('#8a2f28', 0.7), bx, s.sillY + 0.48, 0.5));
    for (let i = 0; i < 4; i++)
      s.g.add(
        cyl(0.012, 0.012, 0.55, 5, steel, bx - 0.09 + i * 0.06, s.sillY + 1.15, 0.5 + (i % 2) * 0.05),
        box(0.07, 0.05, 0.09, M('#2a2a2c', 0.4, 0.5), bx - 0.09 + i * 0.06, s.sillY + 1.45, 0.5 + (i % 2) * 0.05),
      );
    for (let i = 0; i < 6; i++) {
      const rx = s.wx - 0.75 + i * 0.3;
      s.g.add(
        cyl(0.012, 0.012, 1.2, 5, steel, rx, s.sillY + 0.75, 0.75),
        box(0.1, 0.06, 0.05, M('#2a2a2c', 0.4, 0.5), rx + 0.03, s.sillY + 0.17, 0.74),
      );
    }
    s.g.add(box(2.0, 0.05, 0.12, M('#8a6a45', 0.8), s.wx, s.sillY + 1.25, 0.8));
    G.add(s.g);
    col(-79.2 - w / 2, -79.2 + w / 2, front, front + 9);
  }
  // ---- Homestead Furniture: cream plaster with big windows, a sofa and a floor lamp on show
  {
    const w = 10,
      s = storefront({
        x: -67.3,
        z: front,
        w,
        h: 4.6,
        d: 9,
        wall: wallM('plaster', '#e6dcc6', '#d2c7ae', w, 4.6),
        trim: '#5a3a26',
        sign: ['HOMESTEAD', '#5a3a26', '#ffe9a8'],
        awning: ['#8a2f28', '#f1e6d0'],
      });
    const cloth = M('#2f6a8a', 0.8),
      wood = M('#8a5f38', 0.8),
      sx = -s.wx;
    s.g.add(
      box(1.5, 0.3, 0.55, cloth, sx, s.sillY + 0.3, 0.5),
      box(1.5, 0.5, 0.14, cloth, sx, s.sillY + 0.62, 0.72),
      box(0.16, 0.42, 0.55, cloth, sx - 0.75, s.sillY + 0.45, 0.5),
      box(0.16, 0.42, 0.55, cloth, sx + 0.75, s.sillY + 0.45, 0.5),
    );
    s.g.add(
      cyl(0.16, 0.18, 0.03, 10, wood, s.wx - 0.5, s.sillY + 0.03, 0.5),
      cyl(0.02, 0.02, 1.3, 6, wood, s.wx - 0.5, s.sillY + 0.68, 0.5),
      cyl(0.14, 0.24, 0.3, 10, glow('#ffe2a0', 1.4), s.wx - 0.5, s.sillY + 1.4, 0.5),
    );
    s.g.add(
      box(0.7, 0.05, 0.5, wood, s.wx + 0.5, s.sillY + 0.5, 0.5),
      box(0.06, 0.5, 0.06, wood, s.wx + 0.2, s.sillY + 0.25, 0.5),
      box(0.06, 0.5, 0.06, wood, s.wx + 0.8, s.sillY + 0.25, 0.5),
      cyl(0.1, 0.07, 0.2, 8, M('#c8452f', 0.6), s.wx + 0.5, s.sillY + 0.63, 0.5),
    );
    G.add(s.g);
    col(-67.3 - w / 2, -67.3 + w / 2, front, front + 9);
  }
  return {
    update(t: number) {
      for (const p of spin) p.rotation.y = t * 1.6;
    },
  };
}
