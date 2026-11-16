// Build Mode: decorate your RV lot (see design/build-mode.md). Press B on your own lot.
// - Every lot shows its owner's layout (saved in the shared plots/{owner} record, so visitors see it).
// - In Build Mode: an orbit camera over your lot, a catalog on the left, a ghost that snaps to a 0.5 m grid
//   (green = fits, red = doesn't, with the reason), Q/E to rotate, click to place or to pick up a placed item,
//   X to remove, Ctrl+Z to undo, G for grid on/off, Esc or B to leave (saves).
// - Prices are shown but nothing is charged until the cash wallet exists.
import * as THREE from 'three';
import { HALF, toWorld, type Plot, type Collider } from './world';
import { ITEMS, ITEM, trophyItem, packReady, loadItemModels, type ItemDef, type Cat } from './catalog';
import { objectImage, trophyImage } from '../world/trophy';
import { propReady } from '../world/props';
import { progress, onProgress, type TrophyRec } from '../avatar/progress';

/** Grow gear is bought at Grow Supply and carried: Build Mode places what you own instead of selling it. */
const owned = (def: ItemDef) => (def.cat === 'trophies' ? Infinity : progress().gear[def.id] || 0);

/** One placed item, in lot coordinates (x right, z toward the plaza, metres; r = yaw in radians). */
export interface Placed {
  k: string;
  x: number;
  z: number;
  r: number;
  t?: { seed: number; n: 3 | 9; title: string; who: string; toPar: number };
}
export const STARTER: Placed[] = [
  { k: 'lawnchair', x: -2.6, z: -1.6, r: 0.4 },
  { k: 'cooler', x: -1.4, z: -2.0, r: 0 },
];
export const MAX_ITEMS = 100;
const EDGE = HALF - 0.2,
  GRID = 0.5,
  PAD_Y = 0.06;
// fixed things on every lot (lot coordinates): the RV, its door, the awning posts, the mailbox and the sign
const KEEP_OUT: { x0: number; x1: number; z0: number; z1: number; why: string }[] = [
  { x0: -5.5, x1: 2.5, z0: -6.4, z1: -3.6, why: 'Overlaps the RV' },
  { x0: 1.7, x1: 3.5, z0: -3.6, z1: -2.5, why: 'Keep the RV door clear' },
  { x0: 3.0, x1: 3.9, z0: -6.6, z1: -5.2, why: 'Keep the spigot clear' },
  { x0: 5.2, x1: 6.3, z0: -6.6, z1: -5.2, why: 'Keep the fertilizer bin clear' },
  { x0: -2.8, x1: -2.4, z0: -2.1, z1: -1.7, why: 'Too close to the awning post' },
  { x0: 1.2, x1: 1.6, z0: -2.1, z1: -1.7, why: 'Too close to the awning post' },
  { x0: 2.7, x1: 3.3, z0: 6.3, z1: 6.9, why: 'Blocks the mailbox' },
  { x0: -4.4, x1: -2.4, z0: 6.6, z1: 7.2, why: 'Blocks the lot sign' },
];

/** Footprint (axis-aligned box in lot coordinates) of an item at x, z, r. */
function footprint(def: ItemDef, x: number, z: number, r: number) {
  const c = Math.abs(Math.cos(r)),
    s = Math.abs(Math.sin(r)),
    hw = (def.w * c + def.d * s) / 2,
    hd = (def.w * s + def.d * c) / 2;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, hw, hd };
}
/** The solid parts of an item: its whole footprint, or just its posts (string lights). */
function solidBoxes(def: ItemDef, x: number, z: number, r: number) {
  if (!def.posts) return [footprint(def, x, z, r)];
  const c = Math.cos(r),
    s = Math.sin(r),
    h = 0.12;
  return def.posts.map(([lx, lz]) => {
    const px = x + lx * c + lz * s,
      pz = z - lx * s + lz * c;
    return { x0: px - h, x1: px + h, z0: pz - h, z1: pz + h };
  });
}
const overlap = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }, m = 0.02) =>
  a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
/** Can this item stand on a table top? Small, solid things: trophies, gnomes, pots, lanterns, a cooler… */
const sitsOnTops = (def: ItemDef) => !def.floor && !def.posts && !def.slots && def.id !== 'garage' && Math.max(def.w, def.d) <= 0.75;
/** Is the point x, z over the flat top of `o` (placed at ox, oz, turned by or)? */
function overTop(o: ItemDef, ox: number, oz: number, or: number, x: number, z: number) {
  if (!o.top) return false;
  const c = Math.cos(or),
    s = Math.sin(or),
    dx = x - ox,
    dz = z - oz,
    lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  return Math.abs(lx) <= o.top[1] / 2 && Math.abs(lz) <= o.top[2] / 2;
}
/** The RV's roof (fixed on every lot): small things can go up there too. Lot coordinates; height above the pad. */
const RV_ROOF = { x0: -5.0, x1: 2.0, z0: -6.05, z1: -3.95, h: 2.86 };
const onRV = (x: number, z: number) => x >= RV_ROOF.x0 && x <= RV_ROOF.x1 && z >= RV_ROOF.z0 && z <= RV_ROOF.z1;
/** How high an item at x, z stands: 0 on the ground, or the height of the table top it is on. */
export function restY(items: Placed[], def: ItemDef, x: number, z: number, skip = -1) {
  if (!sitsOnTops(def)) return 0;
  let y = onRV(x, z) ? RV_ROOF.h : 0;
  items.forEach((q, i) => {
    const o = i === skip ? null : defOf(q);
    if (o?.top && overTop(o, q.x, q.z, q.r, x, z)) y = Math.max(y, o.top[0]);
  });
  return y;
}
export function defOf(p: Placed): ItemDef | null {
  if (p.k.startsWith('trophy:') && p.t) return trophyItem({ id: p.k.slice(7), ...p.t });
  return ITEM.get(p.k) || null;
}

/** Why an item can't go at x, z, r (or '' if it fits). skip: index being moved. */
export function whyNot(items: Placed[], def: ItemDef, x: number, z: number, r: number, skip = -1): string {
  const f = footprint(def, x, z, r);
  if (f.x0 < -EDGE || f.x1 > EDGE || f.z0 < -EDGE || f.z1 > EDGE) return 'Outside your lot';
  const roof = sitsOnTops(def) && onRV(x, z); // up on the RV's roof, nothing on the ground is in the way
  if (!roof) for (const k of KEEP_OUT) if (overlap(f, k)) return k.why;
  const count = items.filter((p, i) => i !== skip && p.k === def.id).length;
  if (def.max && count >= def.max) return def.cat === 'trophies' ? 'Already on display' : `Only ${def.max} per lot`;
  if (count >= owned(def)) {
    const shop = def.cat === 'grow' ? 'Grow Supply' : 'Homestead Furniture';
    return count ? `All ${count} you own are out: ${shop} sells more` : `${shop} sells these`;
  }
  if (items.length - (skip >= 0 ? 1 : 0) >= MAX_ITEMS) return `Lot is full (${MAX_ITEMS} items)`;
  for (let i = 0; i < items.length; i++) {
    if (i === skip) continue;
    const o = defOf(items[i]);
    if (!o) continue;
    if (!!o.floor !== !!def.floor) continue; // rugs and decks can go under things
    // a small thing standing on a table top doesn't collide with the table (either way round)
    if (sitsOnTops(def) && overTop(o, items[i].x, items[i].z, items[i].r, x, z)) continue;
    if (sitsOnTops(o) && overTop(def, x, z, r, items[i].x, items[i].z)) continue;
    // …but two things on the same top, or one on a top and one on the ground beneath, are judged as usual
    const mineB = solidBoxes(def, x, z, r),
      theirs = solidBoxes(o, items[i].x, items[i].z, items[i].r);
    if (mineB.some(m => theirs.some(t => overlap(m, t)))) return `Overlaps the ${o.name.toLowerCase()}`;
  }
  return '';
}
export function cleanLayout(v: any): Placed[] | null {
  if (!Array.isArray(v)) return null;
  const n = (x: any, a: number, b: number) => {
    const y = +x;
    return isFinite(y) ? Math.min(b, Math.max(a, y)) : 0;
  };
  return v
    .slice(0, MAX_ITEMS)
    .filter(p => p && typeof p.k === 'string' && (ITEM.has(p.k) || (p.k.startsWith('trophy:') && p.t)))
    .map(p => ({
      k: String(p.k).slice(0, 40),
      x: n(p.x, -HALF, HALF),
      z: n(p.z, -HALF, HALF),
      r: n(p.r, -7, 7),
      ...(p.t
        ? {
            t: {
              seed: Math.max(1, Math.floor(+p.t.seed || 1)),
              n: +p.t.n === 9 ? 9 : 3,
              title: String(p.t.title || 'The Cup').slice(0, 80),
              who: String(p.t.who || '').slice(0, 24),
              toPar: Math.floor(+p.t.toPar || 0),
            } as Placed['t'],
          }
        : {}),
    }));
}

// ---------------------------------------------------------------- showing every lot's layout
interface LotView {
  key: string;
  group: THREE.Group;
  cols: Collider[];
}
const views = new Map<number, LotView>();
function disposeTree(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.userData.shared) return;
    m.geometry?.dispose();
    const ms = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of ms)
      if (x && !(x as any).userData?.shared) {
        (x as any).map?.dispose?.();
      }
  });
}
function placeObject(p: Placed, color: string, lift = 0) {
  const def = defOf(p);
  if (!def) return null;
  const o = def.make(color);
  o.position.set(p.x, PAD_Y + lift, p.z);
  o.rotation.y = p.r;
  o.traverse(c => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = !def.floor;
      m.receiveShadow = true;
    }
  });
  return o;
}
/** Show this layout on the lot (rebuilt only when it changes) and keep its walking colliders up to date. */
export function renderLot(plot: Plot, items: Placed[], colliders: Collider[], color: string) {
  const key = color + JSON.stringify(items);
  let v = views.get(plot.lot);
  if (v && v.key === key) return;
  if (v) {
    plot.group.remove(v.group);
    disposeTree(v.group);
    for (const c of v.cols) {
      const i = colliders.indexOf(c);
      if (i >= 0) colliders.splice(i, 1);
    }
  }
  const group = new THREE.Group(),
    cols: Collider[] = [];
  items.forEach((p, i) => {
    const up = defOf(p) ? restY(items, defOf(p)!, p.x, p.z, i) : 0,
      o = placeObject(p, color, up);
    if (!o) return;
    o.userData.idx = i;
    o.userData.k = p.k;
    group.add(o);
    const def = defOf(p)!;
    if (def.floor || def.solid === false || up > 0) return; // what's on a table doesn't block walking: the table does
    const f = footprint(def, p.x, p.z, p.r),
      shrink = def.id === 'garage' ? 0 : 0.05;
    if (def.id === 'garage') {
      // walls only: you can walk in and see your cart
      const c = Math.cos(p.r),
        s = Math.sin(p.r),
        wall = (lx0: number, lx1: number, lz0: number, lz1: number) => {
          const a = [lx0 * c + lz0 * s, -lx0 * s + lz0 * c],
            b = [lx1 * c + lz1 * s, -lx1 * s + lz1 * c];
          return { x0: p.x + Math.min(a[0], b[0]), x1: p.x + Math.max(a[0], b[0]), z0: p.z + Math.min(a[1], b[1]), z1: p.z + Math.max(a[1], b[1]) };
        };
      for (const w of [wall(-1.6, -1.45, -2.05, 2.05), wall(1.45, 1.6, -2.05, 2.05), wall(-1.6, 1.6, -2.05, -1.9)])
        cols.push(lotCol(plot, w, 'deco'));
      cols.push(lotCol(plot, wall(-1.2, 1.2, -1.6, 1.3), 'decoCart')); // the parked cart (walkers only: your own cart drives out of here)
      return;
    }
    if (def.posts) {
      for (const b of solidBoxes(def, p.x, p.z, p.r)) cols.push(lotCol(plot, b, 'deco'));
      return;
    }
    cols.push(lotCol(plot, { x0: f.x0 + shrink, x1: f.x1 - shrink, z0: f.z0 + shrink, z1: f.z1 - shrink }, 'deco'));
  });
  plot.group.add(group);
  colliders.push(...cols);
  views.set(plot.lot, { key, group, cols });
}
function lotCol(plot: Plot, b: { x0: number; x1: number; z0: number; z1: number }, tag: string): Collider {
  const a = toWorld(plot, b.x0, b.z0),
    c = toWorld(plot, b.x1, b.z1),
    d = toWorld(plot, b.x0, b.z1),
    e = toWorld(plot, b.x1, b.z0);
  const xs = [a[0], c[0], d[0], e[0]],
    zs = [a[1], c[1], d[1], e[1]];
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), tag };
}
export const lotGroup = (lot: number) => views.get(lot)?.group || null;

// ---------------------------------------------------------------- Build Mode
export interface BuildHost {
  hasPlants?(p: Placed): boolean;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  colliders: Collider[];
  keys: Record<string, boolean>;
  plot(): Plot | null;
  color(): string;
  layout(): Placed[];
  save(items: Placed[]): void;
  trophies(): Promise<TrophyRec[]>;
  toast(s: string): void;
  onExit(): void;
}
const CATS: { id: Cat; label: string }[] = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'decor', label: 'Decoration' },
  { id: 'grow', label: 'Grow' },
  { id: 'trophies', label: 'Trophies' },
  { id: 'garage', label: 'Garage' },
];
const thumbs = new Map<string, string>();
export function thumb(def: ItemDef, color: string, t?: Placed['t']) {
  if ((def.model && !propReady(def.model)) || (def.pack && !packReady(def.pack)))
    return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; // still loading
  const k = def.id + (def.model || def.pack ? '' : color);
  let u = thumbs.get(k);
  if (!u) {
    u = t ? trophyImage(t.seed, t.n, '', 112) : objectImage(def.make(color), 112);
    thumbs.set(k, u);
  }
  return u;
}
const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (n: number) => '$' + n.toLocaleString('en-US');

export function createBuild(h: BuildHost) {
  let on = false,
    plot: Plot | null = null,
    items: Placed[] = [],
    undo: string[] = [],
    cat: Cat = 'furniture',
    search = '',
    snap = true,
    dirty = false;
  let trophies: TrophyRec[] = [],
    hidden: THREE.Object3D[] = [];
  // what's in hand: a catalog item, or a placed one picked up (moving)
  let hand: { def: ItemDef; r: number; t?: Placed['t']; moving?: Placed } | null = null,
    hover = -1,
    ghost: THREE.Object3D | null = null,
    ghostKey = '';
  const cam = { fx: 0, fz: 1, yaw: 0, pitch: 0.95, dist: 17 };
  const ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD_Y),
    topPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    hit = new THREE.Vector3();
  let at: { x: number; z: number } | null = null,
    why = '',
    mx = 0,
    my = 0;
  // grid + lot outline (shown only in Build Mode)
  const grid = new THREE.GridHelper(HALF * 2, (HALF * 2) / GRID, 0xffe2a0, 0xffe2a0);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.22;
  (grid.material as THREE.Material).depthWrite = false;
  grid.position.y = PAD_Y + 0.012;
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF * 2 - 0.4, 0.01, HALF * 2 - 0.4)),
    new THREE.LineBasicMaterial({ color: '#ffd27a' }),
  );
  outline.position.y = PAD_Y + 0.02;
  const foot = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#5fd35f', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  foot.position.y = PAD_Y + 0.03;
  foot.renderOrder = 2;
  const hoverBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd27a);

  // ---------------- UI
  const ui = document.createElement('div');
  ui.id = 'lbuild';
  ui.className = 'hidden';
  ui.innerHTML = `<div class="bm-top"><button id="bm-exit">✕ Done</button><div class="bm-title"><b id="bm-lot">RV Lot</b> · Build Mode</div><div class="bm-cash">Cash: <b id="bm-cashv">—</b><span>removing an item puts it back in storage</span></div></div>
    <div class="bm-left"><div class="bm-tabs"></div><input id="bm-search" placeholder="Search…" autocomplete="off" spellcheck="false"><div class="bm-items"></div></div>
    <div class="bm-bottom"><div class="bm-sel" id="bm-sel"></div><div class="bm-btns"><button id="bm-rot">⟳ Rotate <kbd>Q</kbd><kbd>E</kbd></button><button id="bm-grid"></button><button id="bm-del">🗑 Remove <kbd>X</kbd></button><button id="bm-undo">↶ Undo <kbd>Ctrl Z</kbd></button></div></div>
    <div class="bm-tip" id="bm-tip"></div><div class="bm-help">Click an item, then click your lot to place it · click a placed item to move it · right-drag to turn the camera, scroll to zoom, <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to pan · <kbd>Esc</kbd> done</div>`;
  document.body.appendChild(ui);
  const $ = (id: string) => ui.querySelector('#' + id) as HTMLElement;
  $('bm-exit').onclick = () => exit();
  $('bm-rot').onclick = () => rotate(1);
  $('bm-grid').onclick = () => {
    snap = !snap;
    renderBottom();
  };
  $('bm-del').onclick = () => removeSel();
  $('bm-undo').onclick = () => doUndo();
  const si = $('bm-search') as HTMLInputElement;
  si.oninput = () => {
    search = si.value.toLowerCase();
    renderCatalog();
  };
  si.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') si.blur();
  };
  function catalogDefs(): { def: ItemDef; t?: Placed['t']; placed?: boolean }[] {
    if (cat === 'trophies')
      return trophies.map(t => {
        const td = { seed: t.seed, n: t.n, title: t.title, who: t.who, toPar: t.toPar },
          def = trophyItem({ id: t.id, ...td });
        return { def, t: td, placed: items.some(p => p.k === def.id) };
      });
    // your lot's storage: what you own, on the lot or not (shops on the West Side sell more)
    return ITEMS.filter(i => i.cat === cat && owned(i) > 0).map(def => ({
      def,
      placed: !!def.max && items.filter(p => p.k === def.id).length >= def.max,
    }));
  }
  function renderCatalog() {
    ui.querySelector('.bm-tabs')!.innerHTML = CATS.map(
      c => `<button class="t${c.id === cat ? ' on' : ''}" data-cat="${c.id}">${c.label}</button>`,
    ).join('');
    ui.querySelectorAll<HTMLButtonElement>('.bm-tabs button').forEach(
      b =>
        (b.onclick = () => {
          cat = b.dataset.cat as Cat;
          renderCatalog();
        }),
    );
    const list = catalogDefs().filter(x => !search || x.def.name.toLowerCase().includes(search)),
      color = h.color();
    ui.querySelector('.bm-items')!.innerHTML = list.length
      ? list
          .map(
            ({ def, placed }, i) =>
              `<button class="it${hand?.def.id === def.id && !hand.moving ? ' on' : ''}${placed ? ' placed' : ''}" data-i="${i}"><img src="${thumb(def, color, list[i].t)}" alt=""><span class="nm">${esc(def.name)}</span><span class="pr">${def.cat === 'trophies' ? (placed ? 'on display' : 'won') : placed ? 'placed' : `${Math.max(0, owned(def) - items.filter(p => p.k === def.id).length)} of ${owned(def)} in storage`}</span></button>`,
          )
          .join('')
      : `<p class="muted">${cat === 'trophies' ? 'No trophies yet. Win a Mini cup or Championship from the tee times board.' : cat === 'grow' ? 'Nothing in storage. Grow Supply on Shady Lane sells pots, beds and sprinklers.' : 'Nothing in storage. Homestead Furniture on the West Side sells things for your lot.'}</p>`;
    ui.querySelectorAll<HTMLButtonElement>('.bm-items .it').forEach(
      b =>
        (b.onclick = () => {
          const x = list[+b.dataset.i!];
          if (x.placed) {
            h.toast(x.def.cat === 'trophies' ? 'That trophy is already on display: click it on your lot to move it.' : `Only ${x.def.max} per lot.`);
            return;
          }
          pick(x.def, x.t);
        }),
    );
  }
  function renderBottom() {
    const sel = hand ? hand.def : hover >= 0 ? defOf(items[hover]) : null;
    $('bm-sel').innerHTML = sel
      ? `<b>${esc(sel.name)}</b> <span>${sel.cat === 'trophies' ? 'trophy' : 'yours'}</span>${hand?.moving ? ' <em>moving</em>' : hand ? '' : ' <em>click to move</em>'}`
      : `<span class="muted">${items.length} / ${MAX_ITEMS} items placed</span>`;
    $('bm-grid').innerHTML = `▦ Grid: ${snap ? 'on' : 'off'} <kbd>G</kbd>`;
    ($('bm-undo') as HTMLButtonElement).disabled = !undo.length;
  }

  // ---------------- actions
  function snapshot() {
    undo.push(JSON.stringify(items));
    if (undo.length > 60) undo.shift();
  }
  // Cash: every change settles the difference in what's on the lot (so placing, removing and undo all balance out).
  const showCash = () => {
    const el = document.getElementById('bm-cashv');
    if (el) el.textContent = money(progress().cash);
  };
  onProgress(showCash);
  function commit() {
    dirty = true;
    h.save(items);
    renderLotNow();
    renderCatalog();
    renderBottom();
  }
  function renderLotNow() {
    if (plot) renderLot(plot, items, h.colliders, h.color());
  }
  function pick(def: ItemDef, t?: Placed['t']) {
    dropHand();
    hand = { def, r: 0, t };
    renderCatalog();
    renderBottom();
  }
  function dropHand() {
    if (hand?.moving) {
      items.push(hand.moving);
      renderLotNow();
    }
    hand = null;
    clearGhost();
  }
  function clearGhost() {
    if (ghost) {
      ghost.parent?.remove(ghost);
      disposeTree(ghost);
      ghost = null;
      ghostKey = '';
    }
    foot.visible = false;
  }
  function rotate(dir: number) {
    const step = snap ? Math.PI / 2 : Math.PI / 12;
    if (hand) {
      hand.r = (((hand.r + dir * step) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return;
    }
    if (hover >= 0) {
      const p = items[hover],
        def = defOf(p)!,
        r = (((p.r + dir * step) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const w = whyNot(items, def, p.x, p.z, r, hover);
      if (w) {
        h.toast(w);
        return;
      }
      snapshot();
      p.r = r;
      commit();
    }
  }
  function removeSel() {
    if (hand?.moving) {
      snapshot();
      undo[undo.length - 1] = JSON.stringify([...items, hand.moving]);
      hand = null;
      clearGhost();
      commit();
      return;
    }
    if (hand) {
      hand = null;
      clearGhost();
      renderCatalog();
      renderBottom();
      return;
    }
    if (hover >= 0) {
      if (h.hasPlants?.(items[hover])) {
        h.toast('There are plants in it. Harvest them first.');
        return;
      }
      snapshot();
      items.splice(hover, 1);
      hover = -1;
      commit();
    }
  }
  function doUndo() {
    if (hand) dropHand();
    const s = undo.pop();
    if (!s) return;
    items = JSON.parse(s);
    hover = -1;
    commit();
  }
  function click() {
    if (!plot) return;
    if (hand) {
      if (!at) return;
      if (why) {
        h.toast(why);
        return;
      }
      const p: Placed = { k: hand.def.id, x: +at.x.toFixed(3), z: +at.z.toFixed(3), r: +hand.r.toFixed(4), ...(hand.t ? { t: hand.t } : {}) };
      if (hand.moving) {
        snapshot();
        undo[undo.length - 1] = JSON.stringify([...items, hand.moving]);
        items.push(p);
        hand = null;
        clearGhost();
      } else {
        snapshot();
        items.push(p);
        if (hand.def.max && items.filter(q => q.k === hand!.def.id).length >= hand.def.max) {
          hand = null;
          clearGhost();
        }
      }
      commit();
      return;
    }
    if (hover >= 0 && h.hasPlants?.(items[hover])) {
      h.toast('There are plants in it. Harvest them before moving it.');
      return;
    }
    if (hover >= 0) {
      const p = items.splice(hover, 1)[0],
        def = defOf(p)!;
      hand = { def, r: p.r, t: p.t, moving: p };
      hover = -1;
      renderLotNow();
      renderBottom();
    } // pick it up
  }

  // ---------------- input
  let orbit: { x: number; y: number } | null = null;
  h.canvas.addEventListener('contextmenu', e => {
    if (on) e.preventDefault();
  });
  h.canvas.addEventListener('pointerdown', e => {
    if (!on) return;
    if (e.button === 2 || e.button === 1) {
      orbit = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 0) click();
  });
  addEventListener('pointerup', () => {
    orbit = null;
  });
  h.canvas.addEventListener('pointermove', e => {
    if (!on) return;
    mx = e.clientX;
    my = e.clientY;
    if (orbit) {
      cam.yaw -= (e.clientX - orbit.x) * 0.006;
      cam.pitch = Math.min(1.45, Math.max(0.35, cam.pitch + (e.clientY - orbit.y) * 0.005));
      orbit = { x: e.clientX, y: e.clientY };
    }
  });
  h.canvas.addEventListener(
    'wheel',
    e => {
      if (!on) return;
      cam.dist = Math.min(26, Math.max(5, cam.dist * (1 + e.deltaY * 0.001)));
    },
    { passive: true },
  );
  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const c = e.code;
    if (c === 'Escape') {
      if (hand) {
        dropHand();
        renderCatalog();
        renderBottom();
      } else exit();
      return;
    }
    if (c === 'KeyB') {
      exit();
      return;
    }
    if (c === 'KeyQ') rotate(-1);
    if (c === 'KeyE') rotate(1);
    if (c === 'KeyG') {
      snap = !snap;
      renderBottom();
    }
    if (c === 'KeyX' || c === 'Delete' || c === 'Backspace') {
      e.preventDefault();
      removeSel();
    }
    if (c === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      doUndo();
    }
    if (c === 'Tab') {
      e.preventDefault();
      const i = CATS.findIndex(x => x.id === cat);
      cat = CATS[(i + (e.shiftKey ? CATS.length - 1 : 1)) % CATS.length].id;
      renderCatalog();
    }
  }

  // ---------------- enter / exit
  async function enter() {
    plot = h.plot();
    if (!plot) return false;
    on = true;
    items = h.layout().map(p => ({ ...p }));
    showCash();
    undo = [];
    hand = null;
    hover = -1;
    dirty = false;
    cat = 'furniture';
    search = '';
    si.value = '';
    cam.fx = 0;
    cam.fz = 1.5;
    cam.yaw = 0;
    cam.pitch = 0.95;
    cam.dist = 17;
    plot.group.add(grid, outline, foot, hoverBox);
    foot.visible = false;
    hoverBox.visible = false;
    // street palms next to the lot would stand between the camera and the yard: hide them while building
    hidden = [];
    h.scene.traverse(o => {
      if (o.userData.palm && o.visible && Math.hypot(o.position.x - plot!.cx, o.position.z - plot!.cz) < HALF + 9) {
        o.visible = false;
        hidden.push(o);
      }
    });
    $('bm-lot').textContent = `Lot ${plot.lot}`;
    ui.classList.remove('hidden');
    document.body.classList.add('mode-build');
    renderCatalog();
    renderBottom();
    trophies = await h.trophies().catch(() => []);
    if (on) renderCatalog();
    await loadItemModels();
    if (on) renderCatalog(); // detailed models: thumbnails once loaded
    return true;
  }
  function exit() {
    if (!on) return;
    dropHand();
    on = false;
    for (const o of hidden) o.visible = true;
    hidden = [];
    if (plot) {
      plot.group.remove(grid, outline, foot, hoverBox);
      renderLot(plot, items, h.colliders, h.color());
    }
    if (dirty) {
      h.save(items);
      h.toast('Lot saved.');
    }
    ui.classList.add('hidden');
    document.body.classList.remove('mode-build');
    $('bm-tip').style.display = 'none';
    h.onExit();
  }

  // ---------------- per frame
  const tmpV = new THREE.Vector3();
  function update(dt: number, camPos: THREE.Vector3, camLook: THREE.Vector3) {
    if (!on || !plot) return;
    // camera: orbit around a focus point on the lot; WASD pans (relative to the view)
    const k = h.keys,
      f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0),
      s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
      sp = 8 * dt * (cam.dist / 17);
    cam.fx += (-Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * s) * sp;
    cam.fz += (-Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * s) * sp;
    cam.fx = Math.max(-HALF - 1, Math.min(HALF + 1, cam.fx));
    cam.fz = Math.max(-HALF - 1, Math.min(HALF + 3, cam.fz));
    const cp = Math.cos(cam.pitch),
      lx = cam.fx + Math.sin(cam.yaw) * cam.dist * cp,
      lz = cam.fz + Math.cos(cam.yaw) * cam.dist * cp;
    const [wx, wz] = toWorld(plot, lx, lz),
      [fx, fz] = toWorld(plot, cam.fx, cam.fz);
    tmpV.set(wx, 0.5 + Math.sin(cam.pitch) * cam.dist, wz);
    camPos.lerp(tmpV, 1 - Math.exp(-dt * 10));
    camLook.lerp(tmpV.set(fx, 0.3, fz), 1 - Math.exp(-dt * 10));
    // where the mouse points on the lot
    const r = h.canvas.getBoundingClientRect();
    mouse.set(((mx - r.left) / r.width) * 2 - 1, -((my - r.top) / r.height) * 2 + 1);
    h.camera.updateMatrixWorld();
    ray.setFromCamera(mouse, h.camera);
    at = null;
    why = '';
    if (ray.ray.intersectPlane(plane, hit)) {
      const l = plot.group.worldToLocal(hit.clone());
      at = { x: l.x, z: l.z };
    }
    // holding something that can stand on a table: if the pointer is on a table's top, aim at the top, not the ground behind it
    if (hand && sitsOnTops(hand.def)) {
      topPlane.constant = -(PAD_Y + RV_ROOF.h);
      if (ray.ray.intersectPlane(topPlane, hit)) {
        const l = plot!.group.worldToLocal(hit.clone());
        if (onRV(l.x, l.z)) at = { x: l.x, z: l.z };
      }
      for (const q of items) {
        const o = defOf(q);
        if (!o?.top) continue;
        topPlane.constant = -(PAD_Y + o.top[0]);
        if (!ray.ray.intersectPlane(topPlane, hit)) continue;
        const l = plot!.group.worldToLocal(hit.clone());
        if (overTop(o, q.x, q.z, q.r, l.x, l.z)) {
          at = { x: l.x, z: l.z };
          break;
        }
      }
    }
    if (hand) {
      if (!ghost || ghostKey !== hand.def.id) {
        clearGhost();
        ghost = hand.def.make(h.color());
        ghostKey = hand.def.id;
        ghost.traverse(c => {
          const m = c as THREE.Mesh;
          if (!m.isMesh) return;
          const ms = (Array.isArray(m.material) ? m.material : [m.material]).map(x => {
            const y = (x as THREE.Material).clone();
            y.transparent = true;
            (y as any).opacity = 0.75;
            y.depthWrite = true;
            return y;
          });
          m.material = Array.isArray(m.material) ? ms : ms[0];
          m.castShadow = false;
        });
        plot.group.add(ghost);
      }
      if (at) {
        const fp = footprint(hand.def, 0, 0, hand.r);
        const free = restY(items, hand.def, at.x, at.z) > 0; // over a table top: place it freely, no grid
        if (snap && !free) {
          at.x = Math.round((at.x - fp.hw) / GRID) * GRID + fp.hw;
          at.z = Math.round((at.z - fp.hd) / GRID) * GRID + fp.hd;
        }
        why = whyNot(items, hand.def, at.x, at.z, hand.r);
        const up = restY(items, hand.def, at.x, at.z);
        ghost.visible = true;
        ghost.position.set(at.x, PAD_Y + up, at.z);
        ghost.rotation.y = hand.r;
        foot.visible = true;
        foot.position.set(at.x, PAD_Y + up + 0.03, at.z);
        foot.scale.set(fp.hw * 2, 1, fp.hd * 2);
        (foot.material as THREE.MeshBasicMaterial).color.set(why ? '#e2574c' : '#5fd35f');
      } else {
        ghost.visible = false;
        foot.visible = false;
      }
      hoverBox.visible = false;
    } else {
      // hover a placed item
      const lg = lotGroup(plot.lot);
      let hv = -1;
      if (lg) {
        const hits = ray.intersectObjects(lg.children, true);
        if (hits.length) {
          let o: THREE.Object3D | null = hits[0].object;
          while (o && o.parent !== lg) o = o.parent;
          if (o) hv = o.userData.idx ?? -1;
        }
      }
      if (hv !== hover) {
        hover = hv;
        renderBottom();
      }
      if (hover >= 0 && lg) {
        const o = lg.children.find(c => c.userData.idx === hover);
        if (o) {
          hoverBox.box.setFromObject(o);
          hoverBox.box.applyMatrix4(plot.group.matrixWorld.clone().invert());
          hoverBox.visible = true;
        }
      } else hoverBox.visible = false;
    }
    const tip = $('bm-tip');
    if (hand && why && at) {
      tip.textContent = why;
      tip.style.display = 'block';
      tip.style.left = mx + 16 + 'px';
      tip.style.top = my + 14 + 'px';
    } else tip.style.display = 'none';
    h.canvas.style.cursor = hand ? (why ? 'not-allowed' : 'copy') : hover >= 0 ? 'grab' : 'default';
  }
  return {
    enter,
    exit,
    key,
    update,
    get on() {
      return on;
    },
  };
}

/** Every placed item of kind k on every lot (for the gnome): lot number, index in the layout, and its object. */
export function placedOf(k: string) {
  const out: { lot: number; idx: number; obj: THREE.Object3D }[] = [];
  for (const [lot, v] of views) for (const o of v.group.children) if (o.userData.k === k) out.push({ lot, idx: o.userData.idx, obj: o });
  return out;
}
