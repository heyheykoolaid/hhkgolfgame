// Boulder Peak's horizon: a ring of snow-capped mountains with pine-dark foothills in front, in place of the city.
import * as THREE from 'three';

const HAZE_COAST = new THREE.Color('#93a9ba'); // blue distance, as mountains across water look
const HAZE = new THREE.Color('#cfd8de'); // Boulder Peak's own cool afternoon haze (world/course.ts sets the matching fog)
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
/** One peak: a cone pulled about into ridges, grey rock below, snow from about two thirds up. */
function peak(r: () => number, base: number, h: number, snow: number, rock: THREE.Color, low: THREE.Color, haze: number, hazeC = HAZE) {
  const g = new THREE.ConeGeometry(base, h, 11, 7, true),
    p = g.attributes.position,
    col = new Float32Array(p.count * 3),
    c = new THREE.Color(),
    white = new THREE.Color('#f6f1ea'),
    ridge = Array.from({ length: 11 }, () => 0.72 + r() * 0.56),
    lean = [(r() - 0.5) * base * 0.5, (r() - 0.5) * base * 0.5],
    // The cone's side has a seam where the first and last column of corners sit on top of each other. Both copies of a
    // corner must be moved exactly the same way, or the mountain splits open along the seam.
    moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5, // 0 at the foot, 1 at the top
      key = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    let mv = moved.get(key);
    if (!mv) {
      const a = Math.atan2(p.getZ(i), p.getX(i)),
        col11 = ((Math.round((a / (Math.PI * 2)) * 11) % 11) + 11) % 11;
      moved.set(key, (mv = [ridge[col11], 1 + (r() - 0.5) * 0.16, y > 0.05 && y < 0.98 ? (r() - 0.5) * h * 0.05 : 0]));
    }
    const [k, wob, lift] = mv;
    p.setXYZ(i, p.getX(i) * k * wob + lean[0] * y * y, p.getY(i) + lift, p.getZ(i) * k * wob + lean[1] * y * y);
    c.copy(low).lerp(rock, Math.min(1, y * 2.2));
    const s = y - snow + (k - 1) * 0.25 + (wob - 1) * 0.5;
    if (s > 0) c.lerp(white, Math.min(1, 0.55 + s * 4));
    // distance haze, painted in (the scene's own fog would wipe the range out altogether): thicker toward the foot
    c.lerp(hazeC, haze * (1.15 - 0.45 * y));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}
/** look: 'alpine' is Boulder Peak's bare grey range with low cloud; 'coast' is a forested coastal range (blue-green
 *  slopes, snow only on the highest tops, no cloud bands), like the mountains across the water from Vancouver. */
export function buildMountains(center: [number, number], sunAz: number, look: 'alpine' | 'coast' = 'alpine') {
  const root = new THREE.Group(),
    r = rng(8848),
    coast = look === 'coast',
    rock = new THREE.Color(coast ? '#5f7480' : '#8b8378'),
    low = new THREE.Color(coast ? '#3d5a54' : '#5d6650'),
    mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, side: THREE.DoubleSide });
  root.name = 'mountains';
  // the coastal range is drawn in its own colours whatever the evening light is doing (lit, it turned sand-coloured)
  const coastMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const add = (ring: number, n: number, hMin: number, hMax: number, bMin: number, bMax: number, snow: number, y: number, haze: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.2,
        d = ring * (0.92 + r() * 0.2),
        // a little lower toward the setting sun, so it still shows between the peaks
        dip = 1 - 0.35 * Math.max(0, Math.cos(a - sunAz)) ** 6,
        h = (hMin + r() * (hMax - hMin)) * dip,
        m = new THREE.Mesh(peak(r, bMin + r() * (bMax - bMin), h, snow, rock, low, haze, coast ? HAZE_COAST : HAZE), coast ? coastMat : mat);
      m.position.set(center[0] + Math.sin(a) * d, y, center[1] + Math.cos(a) * d);
      m.rotation.y = r() * 6.28;
      root.add(m);
    }
  };
  if (coast) {
    // a continuous forested ridge first, so no sky shows between the peaks; then three ranks of peaks in front of
    // and behind it. Everything beyond the ridge's foot is hidden from town, which is what lets the far city go.
    const N = 96,
      R = 400,
      pos: number[] = [],
      col: number[] = [],
      idx: number[] = [],
      foot = low.clone().lerp(HAZE_COAST, 0.38),
      crest = low.clone().lerp(HAZE_COAST, 0.2);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2,
        k = i % N,
        h = 46 + 22 * Math.sin(k * 0.9) + 14 * Math.sin(k * 2.3 + 1) + 9 * Math.sin(k * 5.1 + 2);
      pos.push(
        center[0] + Math.sin(a) * R,
        -6,
        center[1] + Math.cos(a) * R,
        center[0] + Math.sin(a) * (R + 60),
        h,
        center[1] + Math.cos(a) * (R + 60),
      );
      col.push(foot.r, foot.g, foot.b, crest.r, crest.g, crest.b);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    rg.setIndex(idx);
    root.add(new THREE.Mesh(rg, coastMat));
    // (every peak's foot stays outside the ridge at 400 m: nothing built may stand in or beyond the mountains)
    add(600, 30, 80, 130, 150, 190, 2, -12, 0.3); // forested shoulders, overlapping
    add(760, 26, 170, 250, 220, 300, 0.84, -18, 0.46); // the range: a dusting on the tops
    add(980, 18, 260, 350, 290, 380, 0.62, -28, 0.62); // the snowy ones behind
    return root;
  }
  add(520, 15, 50, 95, 150, 230, 2, -14, 0.42); // wooded foothills (no snow)
  add(700, 18, 130, 230, 200, 290, 0.5, -20, 0.55); // the range
  add(930, 14, 230, 350, 280, 380, 0.42, -30, 0.66); // the giants behind
  // low cloud: bands of it lying in the valleys between the course and the peaks, drifting slowly. It hides where the
  // mountains meet the ground and makes the course feel high up.
  const ct = cloudBand();
  for (const [rad, y0, hgt, op, speed] of [
    [430, -8, 70, 0.55, 0.004],
    [620, 20, 120, 0.7, -0.003],
    [840, 60, 170, 0.6, 0.002],
  ]) {
    const tex = ct.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.round(rad / 110), 1);
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rad, rad, hgt, 64, 1, true),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: op,
        depthWrite: false,
        fog: false,
        side: THREE.BackSide,
        color: '#f3f1ec',
      }),
    );
    m.position.set(center[0], y0 + hgt / 2, center[1]);
    m.renderOrder = 2;
    m.onBeforeRender = () => {
      m.rotation.y = performance.now() * 0.001 * speed;
    };
    root.add(m);
  }
  return root;
}
/** A strip of cloud that tiles sideways: soft puffs, thick along the middle, thinning to nothing at top and bottom. */
function cloudBand() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const x = c.getContext('2d')!,
    r = rng(77);
  for (let i = 0; i < 260; i++) {
    const px = r() * 1024,
      py = 128 + (r() - 0.5) * (r() < 0.7 ? 90 : 170),
      rad = 26 + r() * 70,
      a = 0.05 + r() * 0.12;
    for (const ox of [-1024, 0, 1024]) {
      const g = x.createRadialGradient(px + ox, py, 0, px + ox, py, rad);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(px + ox - rad, py - rad, rad * 2, rad * 2);
    }
  }
  // fade out toward the top and bottom edges
  const f = x.createLinearGradient(0, 0, 0, 256);
  f.addColorStop(0, 'rgba(0,0,0,1)');
  f.addColorStop(0.3, 'rgba(0,0,0,0)');
  f.addColorStop(0.7, 'rgba(0,0,0,0)');
  f.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = f;
  x.fillRect(0, 0, 1024, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
