// @ts-nocheck — plain data maths
// Random holes in the Golden Hills style: dry golden rough, olive fairways, palms and oaks, a pond, sandy hardpan.
// Same seed → same hole on every client, so a group just shares the seed. A layout is checked for fairness
// (playable landing zone, clear approach, no water/sand on the green, etc.) and re-rolled until one passes.
import {
  mulberry32,
  clamp,
  lerp,
  setHole,
  centerInfo,
  fairwayHW,
  greenEd,
  greenPt,
  pondPd,
  altDist,
  classify,
  treesNear,
  gradAt,
  heightAt,
  baseH,
  HOLE_LEN,
  CENTER_PTS,
  COURSE,
  HOLE1,
  type HoleDef,
} from './course';

const NAMES = [
  'Arroyo Bend',
  'Sycamore Turn',
  'Dry Creek',
  'Mission Grade',
  'Coyote Run',
  'Live Oak',
  'Chaparral',
  'Jacaranda Walk',
  'Poppy Field',
  'Topanga',
  'Ojai Rise',
  'El Camino',
  'Santa Ana',
  'Oak Knoll',
  'Sagebrush',
  'Canyon Mouth',
  'Palm Row',
  'Golden Mile',
  'Agave Alley',
  'Bluff Top',
  'Rancho Seco',
  'Manzanita',
  'Silver Lake',
  'Laurel Canyon',
  'Joshua Gap',
  'Vista Point',
  'Hollyhock',
  'Sunset Strip',
];

/** 5-character base-36 hole code ↔ seed. */
export const holeCode = (seed: number) => (seed >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(-5);
export const codeSeed = (code: string) =>
  parseInt(
    String(code)
      .toLowerCase()
      .replace(/[^0-9a-z]/g, '')
      .slice(-5) || '0',
    36,
  ) >>> 0;

// ---------------------------------------------------------------- archetypes
// Every hole starts from a strategic idea (pillar 2: two coherent lines with different risk), and every hazard,
// slope and width is placed to serve that idea rather than scattered. Weights are per par.
const ARCH: Record<number, [string, number][]> = {
  3: [
    ['carry', 3],
    ['valley', 3],
    ['stamp', 2],
    ['redan', 2],
  ],
  4: [
    ['cape', 3],
    ['corner', 3],
    ['split', 2],
    ['driveable', 2],
    ['ridge', 3],
  ],
  5: [
    ['reachable', 3],
    ['double', 3],
  ],
};
const TIPS: Record<string, string> = {
  carry: 'Carry the water to the flag, or bail out on the dry side.',
  valley: 'Over the valley: take enough club, anything short rolls back down.',
  stamp: 'Short, but ringed with sand. Find the green.',
  redan: 'Angled green: land it short of the flag and let the slope feed it on.',
  cape: 'Cape hole: the more pond you bite off, the shorter your approach.',
  corner: 'Dogleg: cut the corner over the oaks, or play out to the elbow.',
  split: 'Two fairways: the narrow one is shorter, the wide one is safer.',
  driveable: 'Driveable: go for the green past the sand, or lay up for a wedge.',
  ridge: 'Carry the ridge for a big kick forward; its slope feeds the sand.',
  reachable: 'Reachable in two if you carry the creek. Lay up short of it to be safe.',
  double: 'Three-shotter: place your second past the trees to open up the green.',
};

/** A hole's idea from its seed alone (cheap: no layout): par, archetype, and which way it bends. */
export function holeIdea(seed: number) {
  const r0 = mulberry32((seed * 2654435761) >>> 0),
    pr = r0(),
    par = pr < 0.25 ? 3 : pr < 0.78 ? 4 : 5;
  const opts = ARCH[par];
  let w = r0() * opts.reduce((t, o) => t + o[1], 0),
    kind = opts[0][0];
  for (const [k, wt] of opts) {
    if ((w -= wt) < 0) {
      kind = k;
      break;
    }
  }
  const D = r0() < 0.5 ? 1 : -1; // +1: the hole bends left (toward +x), −1 right
  return { par, kind, D };
}

export function _rawHole(seed: number, attempt: number): HoleDef {
  const r = mulberry32((seed * 7919 + attempt * 104729) >>> 0),
    U = (a: number, b: number) => a + (b - a) * r(),
    pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const chance = (p: number) => r() < p;
  // par, archetype and bend direction come from the seed alone, so re-rolls keep the hole's idea
  const { par, kind, D } = holeIdea(seed);

  // ---- centreline from (length, turn) legs; heading 0 = +z, positive turns toward +x (left)
  const legs: [number, number][] = [];
  const DEG = Math.PI / 180;
  let L = 0,
    corner = 0,
    theta = 0;
  switch (kind) {
    case 'carry':
      L = U(140, 180);
      legs.push([L * 0.5, 0], [L * 0.5, D * U(3, 8) * DEG]);
      break;
    case 'valley':
      L = U(150, 190);
      legs.push([L * 0.5, 0], [L * 0.5, D * U(0, 6) * DEG]);
      break;
    case 'stamp':
      L = U(108, 135);
      legs.push([L, D * U(0, 4) * DEG]);
      break;
    case 'redan':
      L = U(160, 192);
      legs.push([L * 0.6, 0], [L * 0.4, D * U(4, 10) * DEG]);
      break;
    case 'cape':
      corner = U(190, 218);
      theta = U(38, 55);
      L = U(305, 360);
      legs.push([corner * 0.5, 0], [corner * 0.5, D * U(0, 4) * DEG], [L - corner, D * theta * DEG]);
      break;
    case 'corner':
      corner = U(214, 230);
      theta = U(34, 50);
      L = U(336, 375);
      legs.push([corner * 0.5, 0], [corner * 0.5, 0], [L - corner, D * theta * DEG]);
      break;
    case 'split':
      L = U(330, 365);
      legs.push([70, 0], [150, -D * U(30, 36) * DEG], [L - 220, D * U(56, 64) * DEG]);
      break;
    case 'driveable':
      L = U(245, 270);
      legs.push([120, 0], [L - 120, D * U(10, 22) * DEG]);
      break;
    case 'ridge':
      corner = 205;
      L = U(310, 365);
      legs.push([corner, 0], [L - corner, D * U(8, 20) * DEG]);
      break;
    case 'reachable':
      L = U(432, 465);
      legs.push([230, 0], [L - 230, D * U(10, 24) * DEG]);
      break;
    case 'double': {
      const c1 = U(215, 240),
        c2 = U(125, 150);
      L = U(455, 495);
      legs.push([c1, 0], [c2, D * U(22, 36) * DEG], [L - c1 - c2, -D * U(28, 44) * DEG]);
      break;
    }
  }
  const center: number[][] = [
    [0, -5],
    [0, 0],
  ];
  let hx = 0,
    hz = 0,
    hd = 0;
  for (const [len, turn] of legs) {
    hd += turn;
    const n = Math.max(1, Math.round(len / 40));
    for (let i = 1; i <= n; i++) {
      hx += (Math.sin(hd) * len) / n;
      hz += (Math.cos(hd) * len) / n;
      center.push([hx, hz]);
    }
  }
  center.splice(1, 1); // the origin is implied by the first leg
  const g0 = center[center.length - 1],
    gx = g0[0],
    gz = g0[1];
  let len = 0;
  for (let i = 0; i < center.length - 1; i++) len += Math.hypot(center[i + 1][0] - center[i][0], center[i + 1][1] - center[i][1]);
  /** point on the centreline: position, unit direction (dx, dz) and left vector (lx, lz) */
  const at = (along: number) => {
    let acc = 0;
    for (let i = 0; i < center.length - 1; i++) {
      const [ax, az] = center[i],
        [bx, bz] = center[i + 1],
        Ls = Math.hypot(bx - ax, bz - az);
      if (acc + Ls >= along || i === center.length - 2) {
        const t = clamp((along - acc) / Ls, 0, 1),
          dx = (bx - ax) / Ls,
          dz = (bz - az) / Ls;
        return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx, dz, lx: dz, lz: -dx };
      }
      acc += Ls;
    }
    return null as any;
  };
  const side = (p: any, s: number, d: number, fwd = 0) => ({ x: p.x + p.lx * s * d + p.dx * fwd, z: p.z + p.lz * s * d + p.dz * fwd });
  const angOf = (dx: number, dz: number) => Math.atan2(dx, dz); // ellipse ang whose long (rz) axis points along (dx, dz)

  // ---- pieces filled in by the archetype
  const bunkers: { x: number; z: number; r: number }[] = [];
  /** a bunker: main bowl plus 0–2 lobes for a less circular shape */
  const bunker = (x: number, z: number, rr: number, ax = r() - 0.5, az = r() - 0.5) => {
    bunkers.push({ x, z, r: rr });
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    for (let k = Math.floor(U(0, 2.6)); k > 0; k--) {
      const f = k === 1 ? 1 : -1,
        d = rr * U(0.55, 0.85);
      bunkers.push({ x: x + ax * d * f + U(-0.6, 0.6), z: z + az * d * f + U(-0.6, 0.6), r: rr * U(0.5, 0.75) });
    }
  };
  const land: NonNullable<HoleDef['land']> = [];
  const clusters: NonNullable<HoleDef['trees']['clusters']> = [];
  let pond: HoleDef['pond'] = null,
    alt: HoleDef['alt'] = null;
  let widths: number[][] = [],
    fwStart = par === 3 ? len - 40 : U(30, 48),
    taper0 = len - 42,
    tw0 = 11;
  const lz: number[] = [];
  const base = U(13.5, 16);
  // green: size, angle, levels
  let rx = U(12, 16),
    rz = U(10, 13.5),
    gAng = U(-0.5, 0.5);
  const approach = at(len - 1); // direction the ball comes in from
  const green: HoleDef['green'] = {
    x: gx,
    z: gz,
    rx,
    rz,
    sx: U(-0.022, 0.022),
    sz: U(-0.01, 0.024),
    mound: { x: gx + U(-0.4, 0.4) * rx, z: gz + U(-0.4, 0.4) * rz, h: U(0, 0.3) },
  };
  let guardSide = 0; // which side of the green is guarded (pins get tucked there)
  /** the point on the green's edge furthest toward (dx, dz), pushed out by gap + r: where a greenside bunker goes */
  const rimOut = (dx: number, dz: number, rr: number, gap = U(2.2, 3.6)) => {
    const c = Math.cos(gAng),
      sn = Math.sin(gAng);
    let best = -1e9,
      bx = 0,
      bz = 0;
    for (let a = 0; a < 6.283; a += 0.1) {
      const u = Math.sin(a) * rx,
        v = Math.cos(a) * rz,
        x = u * c + v * sn,
        z = -u * sn + v * c,
        d = x * dx + z * dz;
      if (d > best) {
        best = d;
        bx = x;
        bz = z;
      }
    }
    const l = Math.hypot(bx, bz) || 1;
    return { x: gx + bx + (bx / l) * (rr + gap), z: gz + bz + (bz / l) * (rr + gap) };
  };
  /** direction from the green toward side s (−1 right, +1 left) and fwd (−1 front/short, +1 back) */
  const gdir = (s0: number, fwd: number) => ({ x: approach.lx * s0 + approach.dx * fwd, z: approach.lz * s0 + approach.dz * fwd });
  const gbunker = (s0: number, fwd: number, rr: number) => {
    const d = gdir(s0, fwd),
      p = rimOut(d.x, d.z, rr);
    bunker(p.x, p.z, rr, d.z, -d.x);
  };

  switch (kind) {
    case 'carry': {
      const prz = U(9, 13),
        p = at(len - rz - prz - U(4, 8));
      const c = side(p, D, U(4, 10));
      pond = { x: c.x, z: c.z, rx: U(18, 24), rz: prz, ang: angOf(p.dx, p.dz) + D * U(0.1, 0.35) }; // right in front, wrapping the guarded side
      fwStart = len - 75;
      widths = [[0, 12]]; // a dry bail-out apron short and to the safe side
      guardSide = D;
      gAng = D * U(0.15, 0.5);
      for (let k = Math.floor(U(1, 2.6)); k > 0; k--) gbunker(-D, U(-0.2, 1), U(3.5, 5));
      break;
    }
    case 'valley': {
      const p = at(len * 0.5);
      land.push({ x: p.x, z: p.z, rx: U(22, 34), rz: U(45, 70), ang: angOf(p.lx, p.lz), h: -U(3.2, 5) }); // the valley runs across the hole
      land.push({ x: gx, z: gz, rx: U(26, 34), rz: U(22, 30), ang: 0, h: U(1.4, 2.6) }); // a perched green
      if (chance(0.6)) land.push({ x: 0, z: 0, rx: 22, rz: 22, ang: 0, h: U(1, 2.2) }); // and an elevated tee
      fwStart = len - 34;
      for (let k = Math.floor(U(2, 3.4)); k > 0; k--) gbunker(pick([-1, 1]) * U(0.3, 1), -1, U(3.5, 5));
      break;
    }
    case 'stamp': {
      rx = U(9, 11.5);
      rz = U(8, 9.5);
      green.rx = rx;
      green.rz = rz;
      fwStart = len - 30;
      const n = Math.floor(U(4, 6.5)),
        a0 = U(0, 6.28);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * 6.283) / n + U(-0.3, 0.3),
          rr = U(3, 4.4),
          p = rimOut(Math.sin(a), Math.cos(a), rr, U(1.8, 2.8));
        bunkers.push({ x: p.x, z: p.z, r: rr });
      }
      break;
    }
    case 'redan': {
      gAng = D * U(0.55, 0.8);
      rx = U(9, 11);
      rz = U(16, 20);
      green.rx = rx;
      green.rz = rz;
      guardSide = -D;
      gbunker(-D, -U(0.6, 1.2), U(4.5, 6)); // deep front bunker on the near side
      const k = side(approach, D, U(12, 18), -U(16, 24));
      land.push({ x: k.x, z: k.z, rx: U(10, 14), rz: U(18, 26), ang: angOf(approach.dx, approach.dz), h: U(0.9, 1.5) }); // kicker that feeds onto the green
      fwStart = len - 45;
      widths = [[0, 13]];
      break;
    }
    case 'cape':
    case 'corner': {
      const K = at(corner),
        K2 = at(corner + 30),
        inX = K2.dx - K.dx,
        inZ = K2.dz - K.dz,
        il = Math.hypot(inX, inZ) || 1; // toward the inside of the bend
      widths = [
        [40, base],
        [corner - 40, base + U(1, 3)],
        [corner + 10, base - U(2, 3.5)],
        [corner + 50, base],
        [len - 60, base - 1],
      ]; // lay-up area wide, the elbow pinched
      lz.push(corner - 5, corner + 25);
      if (kind === 'cape') {
        // the pond hugs the inside of the bend: cut lines carry water and land beyond it, a short or pulled cut gets wet
        const prx = U(13, 18),
          P = side(at(corner - U(0, 12)), D, base + U(2, 5) + prx);
        pond = { x: P.x, z: P.z, rx: prx, rz: U(28, 38), ang: angOf(K.dx + K2.dx, K.dz + K2.dz) };
      } else {
        // a bunker tight against the inside edge where cuts land, oaks right behind it
        const rr = U(4.5, 6.2),
          B = side(at(corner + U(6, 20)), D, base - 1.5 + rr * 0.75);
        bunker(B.x, B.z, rr, K.dx, K.dz);
        const T = side(at(corner - U(5, 15)), D, base + U(12, 18));
        clusters.push({ x: T.x, z: T.z, r: U(12, 16), n: Math.floor(U(10, 16)) });
      }
      // the safe line runs out to the elbow: a run-through bunker waits for drives hit straight on, a kicker feeds the rest back
      const K3 = at(corner + 16);
      bunker(K3.x - K3.lx * D * (base * U(0.95, 1.2)) + K.dx * U(8, 18), K3.z - K3.lz * D * (base * U(0.95, 1.2)) + K.dz * U(8, 18), U(4.5, 6.5));
      const kk = side(K, -D, base + U(10, 14), U(5, 15));
      land.push({ x: kk.x, z: kk.z, rx: U(9, 13), rz: U(28, 40), ang: angOf(K.dx, K.dz), h: U(1, 1.8) });
      guardSide = D;
      break;
    }
    case 'split': {
      // the main (safe) fairway swings out; the bold line runs straight at the green
      const tx = gx,
        tz = gz,
        tl = Math.hypot(tx, tz),
        ux = tx / tl,
        uz = tz / tl;
      const a1 = U(165, 180),
        a2 = U(240, 258);
      alt = {
        pts: [
          [ux * a1, uz * a1],
          [ux * a2, uz * a2],
        ],
        hw: U(7.5, 9.5),
      };
      widths = [
        [40, base + 1],
        [200, base + 2.5],
        [len - 70, base],
      ];
      lz.push(205);
      for (let k = Math.floor(U(2, 3.6)); k > 0; k--) {
        const t = U(0.2, 0.9),
          x = ux * lerp(a1, a2, t),
          z = uz * lerp(a1, a2, t),
          sd = (k % 2 ? 1 : -1) * (alt.hw + U(1.5, 3.5));
        bunker(x + uz * sd, z - ux * sd, U(3.5, 5));
      }
      guardSide = -D; // the green opens up from the bold side
      break;
    }
    case 'driveable': {
      rx = U(10, 13);
      rz = U(9, 11);
      green.rx = rx;
      green.rz = rz;
      widths = [
        [40, base + 1],
        [len - 85, base + 3],
        [len - 64, base + 3],
        [len - 52, 0],
      ]; // wide lay-up, then rough up to the green
      taper0 = len - 34;
      tw0 = 7;
      lz.push(len - 80);
      for (let k = -1; k <= 1; k++) if (k !== 0 || chance(0.7)) gbunker(k * U(0.5, 0.9), -1, U(3.5, 5)); // bunkers across the front
      if (chance(0.45)) {
        const c = side(at(len - 26), D, U(16, 22));
        pond = { x: c.x, z: c.z, rx: U(10, 14), rz: U(16, 22), ang: angOf(approach.dx, approach.dz) };
        guardSide = D;
      }
      break;
    }
    case 'ridge': {
      const R = at(U(200, 210)),
        s0 = pick([-1, 1]);
      land.push({ x: R.x, z: R.z, rx: U(12, 15), rz: U(50, 70), ang: angOf(R.lx, R.lz), h: U(1, 1.6) }); // the cross ridge
      const hi = side(R, s0, base + 6, 16);
      land.push({ x: hi.x, z: hi.z, rx: U(16, 22), rz: U(30, 42), ang: angOf(R.dx, R.dz), h: U(1.2, 2) }); // high side: tilts the landing area away
      const bb = side(at(U(228, 240)), -s0, base * U(0.62, 0.78));
      bunker(bb.x, bb.z, U(5, 6.5), R.dx, R.dz); // where the slope feeds
      widths = [
        [40, base],
        [180, base - 1],
        [215, base + 1],
        [len - 60, base],
      ];
      lz.push(170, 242);
      guardSide = s0;
      break;
    }
    case 'reachable': {
      const c = at(len - U(48, 58));
      pond = { x: c.x + U(-4, 4), z: c.z, rx: U(34, 46), rz: U(6.5, 9), ang: angOf(c.dx, c.dz) + U(-0.25, 0.25) }; // a creek across the hole (short axis along the line of play)
      widths = [
        [40, base],
        [230, base + 1],
        [len - 110, base + 2],
        [len - 70, base - 2],
      ];
      lz.push(230, len - 90);
      for (let k = Math.floor(U(1, 2.6)); k > 0; k--) {
        const p = side(at(len - U(90, 120)), pick([-1, 1]), base * U(0.9, 1.1));
        bunker(p.x, p.z, U(4, 6));
      }
      const f = side(at(225), pick([-1, 1]), base * U(0.9, 1.1));
      bunker(f.x, f.z, U(4.5, 6.5));
      break;
    }
    case 'double': {
      const c2 = legs[0][0] + legs[1][0],
        K = at(c2),
        K2 = at(c2 + 30),
        inX = K2.dx - K.dx,
        inZ = K2.dz - K.dz,
        il = Math.hypot(inX, inZ) || 1;
      clusters.push({ x: K.x + (inX / il) * (base + 14), z: K.z + (inZ / il) * (base + 14), r: U(12, 16), n: Math.floor(U(8, 13)) });
      widths = [
        [40, base],
        [legs[0][0], base + 1],
        [c2 - 20, base + 2],
        [len - 70, base - 1],
      ];
      lz.push(legs[0][0], c2 + 10);
      const fb = side(at(legs[0][0] + U(5, 20)), pick([-1, 1]), base * U(0.9, 1.1));
      bunker(fb.x, fb.z, U(4.5, 6.5));
      if (chance(0.55)) land.push({ x: gx, z: gz, rx: U(40, 60), rz: U(40, 60), ang: 0, h: U(1.5, 3) }); // uphill finish to a raised green
      break;
    }
  }
  green.rx = rx;
  green.rz = rz;
  green.ang = gAng;
  // ---- green levels: a second tier, a false front, a runoff hollow
  const mr = Math.min(rx, rz);
  if (chance(kind === 'stamp' || kind === 'redan' ? 0.7 : 0.45)) {
    const a = U(0, 6.28);
    green.tier = { dx: Math.sin(a), dz: Math.cos(a), off: U(-0.25, 0.25) * mr, h: U(0.28, 0.42) };
  }
  if (chance(0.35)) green.ff = { dx: -approach.dx, dz: -approach.dz, h: U(0.25, 0.4) };
  if (chance(0.35)) {
    const s0 = pick([-1, 1]),
      p = side(approach, s0, mr * 1.9 + 4, U(-4, 6));
    land.push({ x: p.x, z: p.z, rx: U(7, 10), rz: U(9, 13), ang: angOf(approach.dx, approach.dz), h: -U(0.8, 1.4) });
  }
  // ---- greenside bunkers (some archetypes already placed theirs), favouring the guarded side
  const have = bunkers.filter(b => Math.hypot(b.x - gx, b.z - gz) < Math.max(rx, rz) + 12).length;
  for (let k = Math.max(0, Math.floor(U(2, 4.4)) - have); k > 0; k--) {
    const s0 = guardSide && chance(0.65) ? guardSide : pick([-1, 1]);
    gbunker(s0, U(-0.9, 0.7), U(3.5, 5.5));
  }
  // ---- pin candidates, best first: often tucked toward the guarded side, sometimes on the top tier
  const pins: { x: number; z: number }[] = [];
  {
    const near: { x: number; z: number }[] = bunkers.filter(b => Math.hypot(b.x - gx, b.z - gz) < Math.max(rx, rz) + 14);
    if (pond && Math.hypot(pond.x - gx, pond.z - gz) < Math.max(rx, rz) + Math.max(pond.rx, pond.rz) + 12) near.push(pond, pond);
    for (let k = 0; k < 6 && near.length && chance(par === 3 ? 0.85 : 0.6); k++) {
      const hz = pick(near),
        d = Math.hypot(hz.x - gx, hz.z - gz) || 1,
        ex = rimOut((hz.x - gx) / d, (hz.z - gz) / d, 0, 0),
        f = par === 3 ? U(0.64, 0.76) : U(0.52, 0.7);
      pins.push({ x: gx + (ex.x - gx) * f, z: gz + (ex.z - gz) * f });
    }
  }
  for (let k = 0; k < 10; k++) {
    const tuck = k < 6 && chance(par === 3 ? 0.85 : 0.55),
      s0 = tuck && guardSide ? guardSide : pick([-1, 1]),
      kk = tuck ? U(0.45, 0.68) : U(0.1, 0.45),
      fwd = U(-0.5, 0.5) * mr;
    pins.push({ x: gx + approach.lx * s0 * kk * mr + approach.dx * fwd, z: gz + approach.lz * s0 * kk * mr + approach.dz * fwd });
  }
  // ---- framing: big landforms in the rough that shape the views and feed stray balls back toward play
  for (let k = Math.floor(U(2, 4.6)); k > 0; k--) {
    const p = at(U(40, Math.max(60, len - 50))),
      s0 = pick([-1, 1]),
      c = side(p, s0, base + U(32, 60));
    land.push({ x: c.x, z: c.z, rx: U(18, 30), rz: U(30, 55), ang: angOf(p.dx, p.dz) + U(-0.5, 0.5), h: U(1.5, 3.8) * (chance(0.8) ? 1 : -0.6) });
  }
  // a lone oak in play now and then
  if (par > 3 && chance(0.4)) {
    const p = side(at(U(110, Math.max(120, len - 120))), pick([-1, 1]), base + U(3, 7));
    clusters.push({ x: p.x, z: p.z, r: 0.5, n: 1 });
  }

  const xs = center.map(c => c[0]).concat(alt ? alt.pts.map(p => p[0]) : []);
  const bounds = { x0: Math.min(...xs) - 160, x1: Math.max(...xs) + 165, z0: -80, z1: gz + 125 };
  const hardpan = [];
  for (let k = Math.floor(U(3, 6)); k > 0; k--) {
    const p = at(U(60, len - 20)),
      s0 = pick([-1, 1]),
      c = side(p, s0, U(base + 4, base + 16));
    hardpan.push({ x: c.x, z: c.z, r: U(2.6, 4.2) });
  }
  return {
    name: pick(NAMES),
    number: 0,
    par,
    seed,
    code: holeCode(seed),
    tee: { x: 0, z: 0 },
    pin: pins[0],
    green,
    pond,
    alt,
    land,
    center,
    bunkers: bunkers.slice(0, 24),
    bounds,
    obDist: U(72, 84),
    obZ: [-25, gz + 45],
    fw: { start: fwStart, base, amp: 0, freq: 0, phase: 0, taper0, taper1: len - 18, tw0, tw1: 8, widths },
    path: {
      side: -D,
      off: U(26, 30),
      a0: 30,
      a1: Math.max(40, len - 30),
      start: [
        [-5.5, 3],
        [-14, 18],
      ],
    },
    hardpan,
    terrain: { p1: U(0, 6.28), p2: U(0, 6.28), p3: U(0, 6.28), amp: U(0.5, 1.2), tilt: U(-0.008, 0.008), tiltX: U(-0.005, 0.005), tiltZ0: gz * 0.5 },
    trees: { seed: Math.floor(r() * 2 ** 31), count: Math.floor(U(600, 900)), density: U(0.8, 1.25), clusters },
    plan: { kind, tip: TIPS[kind], lz },
    _pins: pins,
  } as HoleDef;
}

const slope = (x: number, z: number) => Math.hypot(...gradAt(x, z));
const cpt = (along: number) => CENTER_PTS[clamp(Math.round(along), 0, CENTER_PTS.length - 1)];

/** Fairness checks on the current hole (call after setHole). Returns '' if it's fine, else the reason.
 *  Interesting is the generator's job; this only makes sure every hole stays playable for a first-timer. */
export function holeProblem(): string {
  const H = COURSE,
    g = H.green,
    pin = H.pin,
    lz = H.plan?.lz?.length ? H.plan.lz : H.par > 3 ? [225] : [];
  if (classify(pin.x, pin.z).s !== 'green' || greenEd(pin.x, pin.z) > 0.6) return 'pin too near the edge';
  if (slope(pin.x, pin.z) > 0.045) return 'pin on a slope';
  // nothing but green on the putting surface; slopes steep only across a tier
  let steep = 0,
    n = 0;
  for (let a = 0; a < 6.28; a += 0.4)
    for (const k of [0.3, 0.6, 0.9]) {
      const p = greenPt(a, k),
        sv = slope(p.x, p.z);
      n++;
      if (sv > 0.09) steep++;
      if (sv > 0.24) return 'cliff on the green';
      if (classify(p.x, p.z).s !== 'green') return 'hazard on the green';
    }
  if (steep > n * 0.3) return 'green too steep';
  for (const b of H.bunkers) {
    if (greenEd(b.x, b.z) < 1.2 + b.r / Math.min(g.rx, g.rz)) return 'bunker in the green';
    if (Math.hypot(b.x, b.z) < 25) return 'bunker by the tee';
    if (pondPd(b.x, b.z) < 1.6) return 'bunker in the pond';
  }
  if (H.pond) {
    if (pondPd(g.x, g.z) < 3 || greenEd(H.pond.x, H.pond.z) < 3) return 'pond on the green';
    for (let a = 0; a < 6.28; a += 0.3) {
      const p = greenPt(a, 1.25);
      if (pondPd(p.x, p.z) < 1.15) return 'pond touching the green';
    }
    if (pondPd(0, 0) < 4 || Math.hypot(H.pond.x, H.pond.z) < 55) return 'pond by the tee';
  }
  // the centreline may cross water once (a carry); landing zones are dry, fair and not on a side-hill
  let wet = 0,
    inWater = false;
  for (const p of CENTER_PTS) {
    const w = pondPd(p.x, p.z) < 1;
    if (w && !inWater) wet++;
    inWater = w;
  }
  if (wet > 1) return 'too much water';
  for (const a of lz)
    for (let d = -15; d <= 15; d += 5) {
      const p = cpt(a + d);
      if (pondPd(p.x, p.z) < 1.3) return 'water in the landing zone';
      if (classify(p.x, p.z).s === 'bunker') return 'sand in the middle of the landing zone';
      if (slope(p.x, p.z) > 0.14) return 'landing zone too steep';
    }
  if (H.alt) {
    const P = H.alt.pts;
    for (let t = 0; t <= 1; t += 0.1) {
      const x = lerp(P[0][0], P[1][0], t),
        z = lerp(P[0][1], P[1][1], t);
      if (pondPd(x, z) < 1.3) return 'water on the second fairway';
      if (slope(x, z) > 0.16) return 'second fairway too steep';
    }
  }
  // a clear look at the flag from the last landing zone (no tree trunks right on the line)
  const from = H.par === 3 ? { x: 0, z: 0 } : cpt(lz[lz.length - 1]);
  const D = Math.hypot(pin.x - from.x, pin.z - from.z);
  for (let s = 0.12; s < 0.92; s += 4 / D) {
    const x = lerp(from.x, pin.x, s),
      z = lerp(from.z, pin.z, s);
    for (const t of treesNear(x, z)) if (Math.hypot(t.x - x, t.z - z) < t.cr * 0.8 + 1) return 'trees blocking the approach';
  }
  // the tee shot has somewhere to go: no wall of ground right in front of the tee
  for (let a = 10; a < Math.min(60, HOLE_LEN - 20); a += 5) {
    const p = cpt(a);
    if (heightAt(p.x, p.z) - heightAt(0, 0) > 0.09 * a + 1.5) return 'tee shot into a hill';
  }
  if (H.par === 5 && HOLE_LEN < 425) return 'par 5 too short';
  if (H.par === 4 && (HOLE_LEN < 240 || HOLE_LEN > 380)) return 'par 4 length';
  void fairwayHW;
  void centerInfo;
  void altDist;
  return '';
}

// ---------------------------------------------------------------- strategy check
// A quick stand-in for the full physics: a shot aimed at (angle, carry) lands with a spread of aim and distance
// errors, rolls out by surface and slope, and is scored by an expected-strokes-to-hole table. A hole "asks a
// question" when the line that scores best if pulled off (bold) is risky, a dry line exists (safe), they land in
// different places, and going bold is worth it if you pull it off but costs if you don't.
const ROLL: Record<string, number> = { tee: 14, fairway: 14, fringe: 8, green: 7, rough: 3, heavy: 0.8, bunker: 0, hardpan: 18, path: 18, ob: 2 };
// sand is harsher than rough here: the game's bunker lie costs a third of the distance unless you have a wedge
const PEN: Record<string, number> = {
  tee: 0,
  fairway: 0,
  fringe: 0.04,
  green: 0,
  rough: 0.2,
  heavy: 0.55,
  hardpan: 0.12,
  path: 0.1,
  bunker: 0.6,
  ob: 0.5,
};
let hazardHit = false; // set by strokesFrom/playOut: the ball ended in sand, water, OB, heavy rough or behind trees
/** expected strokes to hole out from a ball at rest at (x, z) */
function strokesFrom(x: number, z: number): number {
  const s = classify(x, z).s,
    P = COURSE.pin,
    d = Math.hypot(P.x - x, P.z - z);
  if (s === 'bunker' || s === 'heavy' || s === 'ob') hazardHit = true;
  if (s === 'green') return 1 + (1 - Math.exp(-d / 5)) + d * 0.006;
  if (s === 'bunker' && d < 35) return 2.75 + d * 0.004;
  let e = 2.15 + d * 0.0045 + (PEN[s] ?? 0.2);
  // trees right on the line out of here
  if (d > 30)
    for (const k of [8, 18, 28]) {
      const t = k / d,
        px = lerp(x, P.x, t),
        pz = lerp(z, P.z, t);
      if (treesNear(px, pz).some(tr => Math.hypot(tr.x - px, tr.z - pz) < tr.cr * 0.9)) {
        e += 0.35;
        hazardHit = true;
        break;
      }
    }
  return e;
}
/** one shot: returns [strokes from where it ends incl. penalties, hit trouble?, rest x, rest z] */
function playOut(fx: number, fz: number, yaw: number, carry: number, rollK: number): [number, number, number] {
  const dx = Math.sin(yaw),
    dz = Math.cos(yaw);
  let x = fx + dx * carry,
    z = fz + dz * carry;
  let s = classify(x, z).s;
  if (s === 'water' || s === 'ob') {
    hazardHit = true;
    if (s === 'ob') return [1 + strokesFrom(fx, fz), fx, fz];
    for (let k = 0; k < 80 && classify(x, z).s === 'water'; k++) {
      x -= dx * 2;
      z -= dz * 2;
    }
    return [1 + strokesFrom(x, z) + 0.1, x, z];
  }
  let R = (ROLL[s] ?? 3) * rollK,
    vx = dx,
    vz = dz;
  for (let step = 0; step < 24 && R > 0.5; step++) {
    const [gx, gz] = gradAt(x, z);
    vx -= gx * 0.9;
    vz -= gz * 0.9;
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl;
    vz /= vl;
    const st = Math.min(2, R);
    x += vx * st;
    z += vz * st;
    R -= st;
    R += -(gx * vx + gz * vz) * 9 * st; // downhill runs on, uphill checks up
    s = classify(x, z).s;
    if (s === 'water' || s === 'ob') hazardHit = true;
    if (s === 'water') {
      return [1 + strokesFrom(x - dx * 4, z - dz * 4) + 0.1, x, z];
    }
    if (s === 'ob') return [1 + strokesFrom(fx, fz), fx, fz];
    if (s === 'bunker') break;
    R = Math.min(R, (ROLL[s] ?? 3) * rollK);
  }
  return [strokesFrom(x, z), x, z];
}
interface Line {
  yaw: number;
  carry: number;
  mean: number;
  best: number;
  risk: number;
  x: number;
  z: number;
}
/** try aim lines from (fx, fz) with up to maxCarry; spread: aim error in radians */
export function _lines(fx: number, fz: number, maxCarry: number, spread: number, rollK: number): Line[] {
  const P = COURSE.pin,
    toPin = Math.atan2(P.x - fx, P.z - fz),
    dPin = Math.hypot(P.x - fx, P.z - fz),
    out: Line[] = [];
  const carries: number[] = [];
  for (let f = 0.55; f <= 1.001; f += 0.075) carries.push(maxCarry * f);
  if (dPin < maxCarry * 1.05) for (const f of [0.86, 0.93, 1]) carries.push(dPin * f);
  const aw = Math.min(0.6, 90 / Math.max(60, dPin)),
    as = aw / 7; // fan of aim lines, narrower for short shots
  for (let a = -aw; a <= aw + 1e-6; a += as)
    for (const c of carries) {
      if (c > dPin * 1.08) continue;
      const yaw = toPin + a;
      let sum = 0,
        wsum = 0,
        bad = 0;
      const [e0, x0, z0] = playOut(fx, fz, yaw, c, rollK);
      // misses: a spread of aim and distance errors; "trouble" = costs a quarter stroke or more over the shot as planned
      for (const [ea, ed, wt] of [
        [0, 0, 2],
        [-1, 0, 1],
        [1, 0, 1],
        [0, -0.08, 1],
        [-0.6, 0.04, 1],
        [0.6, 0.04, 1],
        [-0.6, -0.06, 0.8],
        [0.6, -0.06, 0.8],
      ]) {
        hazardHit = false;
        const [e] = playOut(fx, fz, yaw + ea * spread, c * (1 + ed), rollK);
        sum += e * wt;
        wsum += wt;
        if (hazardHit && e - e0 > 0.2) bad += wt;
      }
      out.push({ yaw, carry: c, mean: sum / wsum, best: e0, risk: bad / wsum, x: x0, z: z0 });
    }
  return out;
}
/** Does the key shot of the current hole pose a real choice? Returns a score (0 = no) and the two lines. */
export function holeStrategy() {
  const H = COURSE,
    par = H.par,
    maxC = par === 3 ? 200 : 228;
  const judge = (L: Line[]) => {
    const safe = L.filter(l => l.risk <= 0.1).sort((a, b) => a.mean - b.mean)[0],
      apart = par === 3 ? 5 : 14;
    if (!safe) return { score: 0, safe: null, bold: null };
    let bold: Line | null = null,
      score = 0;
    for (const l of L) {
      if (l.risk < safe.risk + 0.18 || Math.hypot(l.x - safe.x, l.z - safe.z) < apart) continue;
      // both pulled off: how much better the bold line is. On average: how close the two are (a real choice is close)
      const reward = safe.best - l.best,
        gap = l.mean - safe.mean;
      if (reward < 0.08 || gap > 0.45) continue;
      const sc = reward * (1 - Math.max(0, gap) * 1.5);
      if (sc > score) {
        score = sc;
        bold = l;
      }
    }
    return { score, safe, bold };
  };
  const tee = judge(_lines(0, 0, maxC, par === 3 ? 0.05 : 0.062, par === 3 ? 0.4 : 1));
  if (par < 5 || !tee.safe) return tee;
  const second = judge(_lines(tee.safe.x, tee.safe.z, 205, 0.058, 0.8));
  return second.score > tee.score ? second : tee;
}

/** A playable random hole for this seed (deterministic). Leaves it as the current hole. Fair holes are re-rolled
 *  (keeping the hole's idea) until one also poses a real choice; failing that, the most interesting fair one. */
export function generateHole(seed: number, log?: (why: string) => void): HoleDef {
  let last: HoleDef | null = null,
    best: HoleDef | null = null,
    bestScore = -1,
    judged = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const h = _rawHole(seed >>> 0, attempt),
      pins = (h as any)._pins as { x: number; z: number }[];
    delete (h as any)._pins;
    setHole(h);
    last = h;
    for (const p of pins) {
      h.pin = p;
      if (classify(p.x, p.z).s === 'green' && greenEd(p.x, p.z) <= 0.6 && slope(p.x, p.z) <= 0.045) break;
    }
    const why = holeProblem();
    if (why) {
      log?.(why);
      continue;
    }
    const st = holeStrategy();
    judged++;
    if (h.plan)
      h.plan.lines = st.safe && st.bold ? { safe: [st.safe.x, st.safe.z], bold: [st.bold.x, st.bold.z], score: +st.score.toFixed(2) } : null;
    if (st.score >= 0.08) return h;
    log?.('no real choice');
    if (st.score > bestScore) {
      bestScore = st.score;
      best = h;
    }
    if (judged >= 5) break;
  }
  if (best && best !== last) {
    setHole(best);
  }
  return best || last!;
}
/** Hole for a match: seed 0 = Hole 1 ("The Dogleg"), anything else = generated. */
export function useHole(seed: number, locale = 'hills') {
  if (!seed) {
    setHole(HOLE1);
    return HOLE1;
  }
  const h = generateHole(seed);
  return locale === 'peak'
    ? peakHole(h, seed)
    : locale === 'moon'
      ? moonHole(h, seed)
      : locale === 'haunt'
        ? hauntHole(h, seed)
        : locale === 'trip'
          ? tripHole(h, seed)
          : h;
}

// ---------------------------------------------------------------- Boulder Peak
// The same hole, taken up a mountain. The generator's layout (and its checked landing zones and strategy) is kept;
// what changes is the ground it lies on and what punishes a miss:
//   · real elevation: par 3s drop from a perched tee, par 5s climb, par 4s do one or the other
//   · fairways about a fifth narrower, with more pines standing closer to them
//   · granite outcrops in the near rough: land on one and the ball kicks away hard
//   · water is a ravine across the hole (to carry) instead of a pond beside it
//   · thin air: full shots fly 10% farther; and the wind blows harder
// The bunkers stay. The result is not re-run through the fairness checks, so the changes are kept within what those
// checks allowed for (the green and tee stay level, the ravine sits short of where drives land).
const PEAK_NAMES = [
  "Eagle's Drop",
  'Granite Chute',
  'Pine Gap',
  'Timberline',
  'Switchback',
  'Avalanche',
  'Bear Creek',
  'The Chimney',
  'Scree Slope',
  'Thin Air',
  'Goat Trail',
  'Cloud Rest',
  "Devil's Thumb",
  'Marmot Run',
  'Glacier Tongue',
  'Lost Mine',
  'Hangman Ridge',
  'Cold Spring',
  'The Notch',
  'Widow Maker',
];
export function peakHole(base: HoleDef, seed: number): HoleDef {
  const d: HoleDef = JSON.parse(JSON.stringify(base)),
    r = mulberry32((seed ^ 0x9e3779b9) >>> 0),
    U = (a: number, b: number) => a + r() * (b - a);
  d.locale = 'peak';
  d.name = PEAK_NAMES[Math.floor(r() * PEAK_NAMES.length)];
  d.air = 1.1;
  d.gust = 1.6;
  // --- elevation
  const down = d.par === 3 ? true : d.par === 5 ? false : r() < 0.55;
  d.terrain.amp *= 1.45;
  d.terrain.tilt += down ? -U(d.par === 3 ? 0.055 : 0.03, d.par === 3 ? 0.08 : 0.05) : U(0.022, d.par === 5 ? 0.034 : 0.04);
  // --- narrower fairways, pines closer in and more of them
  const N = 0.8,
    f = d.fw;
  f.base = Math.max(7, f.base * N);
  f.amp *= N;
  f.tw0 = Math.max(6, f.tw0 * N);
  f.tw1 = Math.max(5, f.tw1 * N);
  if (f.widths) for (const w of f.widths) w[1] = Math.max(7, w[1] * N);
  d.trees.count = Math.round(d.trees.count * 1.4);
  d.trees.density *= 1.5;
  d.trees.gap = 6.5;
  d.pond = null;
  d.rocks = [];
  setHole(d); // the helpers below measure this hole
  const at = (along: number) => {
    const i = Math.max(0, Math.min(CENTER_PTS.length - 2, Math.round(along))),
      p = CENTER_PTS[i],
      q = CENTER_PTS[i + 1],
      L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    return { x: p.x, z: p.z, tx: (q.x - p.x) / L, tz: (q.z - p.z) / L };
  };
  // --- the ravine: across the hole, to be carried. Every par 3 that's long enough has one (the cliff-top hole); longer
  // holes often do, short of the first landing zone so a decent drive clears it and a topped one doesn't
  const lz0 = d.plan?.lz?.[0],
    ravAt = d.par === 3 ? HOLE_LEN * U(0.42, 0.55) : lz0 && lz0 > 150 ? lz0 * U(0.5, 0.6) : HOLE_LEN * 0.3;
  if ((d.par === 3 ? HOLE_LEN > 95 : base.pond || r() < 0.6) && ravAt > (d.par === 3 ? 42 : 55) && HOLE_LEN - ravAt > (d.par === 3 ? 42 : 60)) {
    const c = at(ravAt),
      rz = U(3.6, 5),
      B = d.bounds;
    // as long as the playable width, but it must end well inside the terrain (whose edges fall away to the horizon)
    let half = Math.min(d.obDist + 10, 75);
    for (const sg of [-1, 1])
      for (let u = 10; u <= half; u += 2) {
        const x = c.x - c.tz * u * sg,
          z = c.z + c.tx * u * sg;
        if (Math.min(x - B.x0, B.x1 - x, z - B.z0, B.z1 - z) < 48) {
          half = u - 2;
          break;
        }
      }
    // level with the lowest ground anywhere along it and a little either side, so the water never stands above a bank
    let lo = 1e9;
    for (let u = -half * 1.35; u <= half * 1.35; u += 3)
      for (const v of [-3, -1.5, 0, 1.5, 3]) lo = Math.min(lo, baseH(c.x - c.tz * u + c.tx * v * rz, c.z + c.tx * u + c.tz * v * rz));
    // the ellipse's long axis lies across the hole: turn its x axis onto the perpendicular (-tz, tx)
    d.pond = { x: c.x, z: c.z, rx: half, rz, ang: Math.atan2(-c.tx, -c.tz), level: lo - 0.6 };
    d.bunkers = d.bunkers.filter(b => {
      const dx = b.x - c.x,
        dz = b.z - c.z;
      return Math.abs(dx * c.tx + dz * c.tz) > rz + b.r + 3;
    });
    if (d.plan) {
      d.plan.kind = d.par === 3 ? 'cliff' : d.plan.kind;
      if (d.par === 3) d.plan.tip = 'Cliff-top tee: all carry over the ravine. It plays shorter than it looks.';
    }
  }
  if (d.par === 5 && d.plan) {
    d.plan.kind = 'switchback';
    d.plan.tip = 'Uphill all the way: every shot plays longer than the number.';
  }
  setHole(d);
  // --- granite outcrops in the near rough, where a miss lands
  for (let tries = 0; tries < 200 && d.rocks.length < 4 + Math.floor(r() * 4); tries++) {
    const along = U(70, HOLE_LEN - 45);
    if (along < 70) continue;
    const c = at(along),
      side = r() < 0.5 ? -1 : 1,
      rr = U(2.6, 4.6),
      off = fairwayHW(along) + rr + U(1.5, 8),
      x = c.x - c.tz * off * side,
      z = c.z + c.tx * off * side;
    if (classify(x, z).s !== 'rough' || greenEd(x, z) < 3 || pondPd(x, z) < 1.6) continue;
    if (d.bunkers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + rr + 2) || d.rocks.some(k => Math.hypot(k.x - x, k.z - z) < k.r + rr + 6)) continue;
    if (centerInfo(x, z).d < fairwayHW(centerInfo(x, z).along) + rr + 1) continue; // never touching the short grass
    d.rocks.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +rr.toFixed(1) });
  }
  setHole(d);
  // the pin stays where the generator put it, as long as it's still a fair spot on the reshaped ground
  if (classify(d.pin.x, d.pin.z).s !== 'green') d.pin = { x: d.green.x, z: d.green.z };
  return d;
}

// ---------------------------------------------------------------- the Moon
// The same hole, flown to the Moon through the Rusty Rocket at Fun Land. The layout (and its checked landing zones)
// is kept; the rules change:
//   · gravity in flight is 0.4 of Earth's: the swing still gives the club's carry (the ball leaves slower), but it
//     hangs in the sky about 1.6 times as long, so the wind has far longer to move it
//   · the grey dust stops a ball dead: land it on the green (a smooth landing pad) or near the pin
//   · bunkers sit in craters with a raised rim, and more craters dot the rough
//   · a few moon rocks, and one or two moon buggies driving back and forth across the hole
// No water, no trees. Rolling keeps Earth's friction and slopes (arcade, so putting feels the same everywhere).
const MOON_NAMES = [
  'Tranquility Base',
  'Sea of Serenity',
  'Dust Bowl',
  'Far Side',
  'Crater Lake (Dry)',
  'Moonwalk',
  'Low Orbit',
  'Splashdown',
  'One Small Step',
  'Earthrise',
  'The Rusty Rocket',
  'Lunar Rover',
  'Copernicus',
  'Ocean of Storms',
  'Houston',
  'Liftoff',
  'Zero Roll',
  'Hang Time',
  'Moon Pie',
  'Cheese Wedge',
];
export function moonHole(base: HoleDef, seed: number): HoleDef {
  const d: HoleDef = JSON.parse(JSON.stringify(base)),
    r = mulberry32((seed ^ 0x6d2b79f5) >>> 0),
    U = (a: number, b: number) => a + r() * (b - a);
  d.locale = 'moon';
  d.name = MOON_NAMES[Math.floor(r() * MOON_NAMES.length)];
  d.grav = 0.4;
  d.gust = 1.4; // with the long hang time: the wind pushes a ball about twice as far as at Golden Hills
  d.pond = null;
  d.trees = { ...d.trees, count: 0, density: 0, clusters: [] };
  d.terrain.amp *= 0.7;
  if (d.plan) d.plan.tip = 'Low gravity, no roll: the ball floats and the wind carries it. Land it on the green.';
  // the generator's bunkers become craters with sand floors
  d.craters = d.bunkers.map(b => ({ x: b.x, z: b.z, r: +(b.r * 1.15).toFixed(1), dep: 0.35, rim: 0.55 }));
  d.rocks = [];
  setHole(d); // the helpers below measure this hole
  const at = (along: number) => {
    const i = Math.max(0, Math.min(CENTER_PTS.length - 2, Math.round(along))),
      p = CENTER_PTS[i],
      q = CENTER_PTS[i + 1],
      L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    return { x: p.x, z: p.z, tx: (q.x - p.x) / L, tz: (q.z - p.z) / L };
  };
  const clear = (x: number, z: number, rr: number) =>
    greenEd(x, z) > 3 &&
    Math.hypot(x, z) > 30 &&
    !d.bunkers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + rr + 3) &&
    !d.craters!.some(k => Math.hypot(k.x - x, k.z - z) < k.r + rr + 4) &&
    !d.rocks!.some(k => Math.hypot(k.x - x, k.z - z) < k.r + rr + 5);
  // dust craters in the rough, where a miss lands
  for (let tries = 0, n = 5 + Math.floor(r() * 4); tries < 300 && d.craters.length < d.bunkers.length + n; tries++) {
    const along = U(50, HOLE_LEN - 30),
      c = at(along),
      side = r() < 0.5 ? -1 : 1,
      rr = U(3, 7),
      off = fairwayHW(along) + rr * 1.6 + U(1, 14),
      x = c.x - c.tz * off * side,
      z = c.z + c.tx * off * side;
    if (classify(x, z).s !== 'rough' || !clear(x, z, rr * 1.6)) continue;
    d.craters.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +rr.toFixed(1), dep: +U(0.6, 1.2).toFixed(2), rim: +U(0.4, 0.8).toFixed(2) });
  }
  // a few moon rocks (they kick a ball away hard, like Boulder Peak's granite)
  for (let tries = 0; tries < 200 && d.rocks.length < 2 + Math.floor(r() * 3); tries++) {
    const along = U(70, HOLE_LEN - 45),
      c = at(along),
      side = r() < 0.5 ? -1 : 1,
      rr = U(2.2, 3.8),
      off = fairwayHW(along) + rr + U(2, 10),
      x = c.x - c.tz * off * side,
      z = c.z + c.tx * off * side;
    if (classify(x, z).s !== 'rough' || !clear(x, z, rr)) continue;
    d.rocks.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +rr.toFixed(1) });
  }
  // moon buggies: each crosses the hole on its own line, well clear of the tee and the green
  d.buggies = [];
  const nb = HOLE_LEN > 260 ? 2 : HOLE_LEN > 120 ? 1 + (r() < 0.5 ? 1 : 0) : 1;
  for (let i = 0, tries = 0; i < nb && tries < 40; tries++) {
    const lo = 60,
      hi = HOLE_LEN - 45;
    if (hi <= lo) break;
    const along = U(lo, hi);
    if (d.buggies.some(b => Math.abs((b as any)._a - along) < 50)) continue;
    const c = at(along),
      half = Math.min(d.obDist - 6, 42),
      g: any = { x: +c.x.toFixed(1), z: +c.z.toFixed(1), tx: +(-c.tz).toFixed(4), tz: +c.tx.toFixed(4), half, v: +U(3.5, 5).toFixed(2), ph: +U(0, 4 * half).toFixed(1) };
    // never through the green
    let ok = true;
    for (let u = -half; u <= half; u += 2) if (greenEd(g.x + g.tx * u, g.z + g.tz * u) < 4) ok = false;
    if (!ok) continue;
    g._a = along;
    d.buggies.push(g);
    i++;
  }
  for (const b of d.buggies) delete (b as any)._a;
  setHole(d);
  if (classify(d.pin.x, d.pin.z).s !== 'green') d.pin = { x: d.green.x, z: d.green.z };
  return d;
}

// ---------------------------------------------------------------- shared helpers for the dressed-up courses
function walker(d: HoleDef, r: () => number) {
  const U = (a: number, b: number) => a + r() * (b - a),
    at = (along: number) => {
      const i = Math.max(0, Math.min(CENTER_PTS.length - 2, Math.round(along))),
        p = CENTER_PTS[i],
        q = CENTER_PTS[i + 1],
        L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      return { x: p.x, z: p.z, tx: (q.x - p.x) / L, tz: (q.z - p.z) / L };
    },
    /** a spot `off` metres out from the fairway's edge at `along`, on one side */
    beside = (along: number, off: number, side: number) => {
      const c = at(along),
        o = fairwayHW(along) + off;
      return { x: c.x - c.tz * o * side, z: c.z + c.tx * o * side };
    },
    clearOf = (x: number, z: number, rr: number) =>
      greenEd(x, z) > 2.2 &&
      Math.hypot(x, z) > 24 &&
      pondPd(x, z) > 1.4 &&
      !d.bunkers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + rr + 2);
  return { U, at, beside, clearOf };
}

// ---------------------------------------------------------------- the Old Estate
// The same hole, played across the grounds of a crumbling Gothic manor up past the water tower. Its owner vanished
// owing Lucky Pawn money. Always a blood-orange sunset in thick fog (the client draws the fog: the pin is lost in it
// from far off, the bird's-eye view finds it). The rules:
//   · the cart paths are old cobbles: a ball landing on them leaps and kicks up to 40° off line
//   · gargoyles on plinths stand in the near rough, and a pair of gate piers flanks the fairway where drives land:
//     a ball that meets one bounces off
//   · par 3s, and some longer holes, have a moat round the green: carry it, or land short and putt across the drawbridge
// Dead trees instead of oaks and palms; the pond stays (a black lake).
const HAUNT_NAMES = [
  "The Widow's Walk",
  'Crypt Keeper',
  'Moat House',
  'Gargoyle Gate',
  'The Drawbridge',
  'Raven Rise',
  'Ghost Lantern',
  'The Long Gallery',
  'Mourning Lawn',
  'Bell Tower',
  'Hedge Maze',
  'The Unpaid Debt',
  'Cobblestone Lane',
  'The Last Heir',
  'Candle Row',
  'Weeping Yew',
  'Grave Error',
  'The Butler Did It',
  'Shroud Bend',
  'Lucky Pawn Ticket',
];
export function hauntHole(base: HoleDef, seed: number): HoleDef {
  const d: HoleDef = JSON.parse(JSON.stringify(base)),
    r = mulberry32((seed ^ 0x2545f491) >>> 0);
  d.locale = 'haunt';
  d.name = HAUNT_NAMES[Math.floor(r() * HAUNT_NAMES.length)];
  d.trees.gap = 8;
  d.pillars = [];
  d.moat = null;
  setHole(d);
  const { U, at, beside, clearOf } = walker(d, r);
  // the moat: every par 3, and about four longer holes in ten
  if (d.par === 3 || r() < 0.4) {
    const g = d.green,
      r0 = Math.max(g.rx, g.rz) * 1.16 + 1.5,
      r1 = r0 + U(4, 5.5),
      c = at(HOLE_LEN - 30),
      ang = Math.atan2(c.x - g.x, c.z - g.z);
    let lo = 1e9;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      for (const rr of [r0 - 0.8, (r0 + r1) / 2, r1 + 0.8]) lo = Math.min(lo, heightAt(g.x + Math.sin(a) * rr, g.z + Math.cos(a) * rr));
    }
    d.moat = { x: g.x, z: g.z, r0: +r0.toFixed(2), r1: +r1.toFixed(2), ang: +ang.toFixed(3), bw: 3.2, level: +(lo - 0.45).toFixed(2) };
    d.bunkers = d.bunkers.filter(b => {
      const dd = Math.hypot(b.x - g.x, b.z - g.z);
      return dd + b.r < r0 - 0.5 || dd - b.r > r1 + 1;
    });
    if (d.plan) d.plan.tip = 'A moat rings the green: carry it, or lay up and putt across the drawbridge.';
  }
  setHole(d);
  // the gate: two piers just off the fairway's edges where drives come down
  const lz = d.plan?.lz?.[0] && d.plan.lz[0] < HOLE_LEN - 60 ? d.plan.lz[0] : HOLE_LEN * 0.55;
  if (d.par > 3 && lz > 80)
    for (const side of [-1, 1]) {
      const p = beside(lz, 1.4, side);
      d.pillars.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: 0.65, h: 3.6, kind: 'gate' });
    }
  // gargoyles on plinths in the near rough
  for (let tries = 0; tries < 200 && d.pillars.filter(p => p.kind === 'gargoyle').length < 3 + Math.floor(r() * 3); tries++) {
    const along = U(60, HOLE_LEN - 25),
      p = beside(along, U(2.5, 9), r() < 0.5 ? -1 : 1);
    if (classify(p.x, p.z).s !== 'rough' || !clearOf(p.x, p.z, 1) || d.pillars.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 14)) continue;
    if (d.moat && Math.hypot(p.x - d.moat.x, p.z - d.moat.z) < d.moat.r1 + 3) continue;
    d.pillars.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: 0.75, h: 3.1, kind: 'gargoyle' });
  }
  setHole(d);
  if (classify(d.pin.x, d.pin.z).s !== 'green') d.pin = { x: d.green.x, z: d.green.z };
  return d;
}

// ---------------------------------------------------------------- the Bad Batch
// Golden Hills as seen after a rainbow joint from the hobo's seeds, passed to the gnome. Reached only that way (the tee
// board doesn't list it). Checkered fairways over a sea of cloud, giant flamingos drifting by, a pink sky. The rules:
//   · bounce pads (giant mushrooms and lawn gnomes) in the rough: land on one and the ball is thrown high and on
//   · warp pipes: rusty culverts beside the fairway; roll or drop into one and it comes out near the green
//   · the wind turns round every stroke
// No trees: the scenery doesn't touch the ball.
const TRIP_NAMES = [
  'Flamingo Drift',
  'The Gnome Zone',
  'Rainbow Road (Rough)',
  'Mushroom Kingdom-ish',
  'Cloud Nine',
  'Culvert Dreams',
  'Checkmate',
  'Lava Lamp',
  'Pink Elephant',
  'Groovy Gravy',
  'The Munchies',
  'Far Out',
  'Hobo Heaven',
  'Bad Batch',
  'Whoa Dude',
  'Couch Lock',
  'Vapor Trail',
  'Spaced Out',
  'Inner Space',
  'Totally Tubular',
];
export function tripHole(base: HoleDef, seed: number): HoleDef {
  const d: HoleDef = JSON.parse(JSON.stringify(base)),
    r = mulberry32((seed ^ 0x1b873593) >>> 0);
  d.locale = 'trip';
  d.name = TRIP_NAMES[Math.floor(r() * TRIP_NAMES.length)];
  d.flip = true;
  d.gust = 1.3;
  d.trees = { ...d.trees, count: 0, density: 0, clusters: [] };
  d.pads = [];
  d.pipes = [];
  setHole(d);
  const { U, at, beside, clearOf } = walker(d, r);
  // bounce pads, mostly where a missed drive or approach comes down
  for (let tries = 0; tries < 300 && d.pads.length < 5 + Math.floor(r() * 3); tries++) {
    const along = U(50, HOLE_LEN - 15),
      p = beside(along, U(2, 12), r() < 0.5 ? -1 : 1),
      rr = U(2.2, 3.2);
    const k = classify(p.x, p.z).s;
    if ((k !== 'rough' && k !== 'heavy') || !clearOf(p.x, p.z, rr) || d.pads.some(q => Math.hypot(q.x - p.x, q.z - p.z) < q.r + rr + 8)) continue;
    d.pads.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +rr.toFixed(2) });
  }
  // warp pipes: a mouth out in the rough partway down, its other end on the fairway short of the green
  const exitAt = HOLE_LEN - U(45, 65),
    ex = at(exitAt);
  if (HOLE_LEN > 140 && classify(ex.x, ex.z).s === 'fairway')
    for (let tries = 0, n = HOLE_LEN > 300 ? 2 : 1, side = r() < 0.5 ? -1 : 1; tries < 80 && d.pipes.length < n; tries++) {
      const along = U(HOLE_LEN * 0.3, HOLE_LEN * 0.62),
        p = beside(along, U(3, 9), d.pipes.length ? -side : side);
      if (classify(p.x, p.z).s !== 'rough' || !clearOf(p.x, p.z, 2) || d.pads.some(q => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 4)) continue;
      d.pipes.push({ ax: +p.x.toFixed(2), az: +p.z.toFixed(2), bx: +ex.x.toFixed(2), bz: +ex.z.toFixed(2), r: 1.6 });
    }
  if (d.plan) d.plan.tip = 'The wind flips every stroke. Pads throw you, pipes take you closer.';
  setHole(d);
  if (classify(d.pin.x, d.pin.z).s !== 'green') d.pin = { x: d.green.x, z: d.green.z };
  return d;
}

/** Match ids carry the hole: "r" + 5-char hole code + a few random chars = that random hole; anything else = Hole 1. */
export function seedFromMatch(id: string) {
  const m = /^r([0-9a-z]{5})/.exec(String(id || ''));
  return m ? codeSeed(m[1]) || 1 : 0;
}
export function matchIdFor(seed: number, rand: string) {
  const tail = rand
    .toLowerCase()
    .replace(/[^0-9a-z]/g, 'x')
    .slice(0, 6)
    .padEnd(5, 'x');
  return seed ? 'r' + holeCode(seed).toLowerCase() + tail : 'h' + tail;
}
/** A fresh random hole seed (fits a 5-character code). */
export function randomHoleSeed() {
  return 1 + Math.floor(Math.random() * (36 ** 5 - 2));
}
