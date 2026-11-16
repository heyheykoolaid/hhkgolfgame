// Birdie Dollars and the ball collection. Saved in this browser and (when signed in to the published page) to the
// player's own record, so it follows them between devices. One Birdie Dollar per birdie, two per eagle, three for
// an albatross or a hole-in-one; each spin of the Birdie Ball machine costs one.
import { BALLS, BALL, DEFAULT_BALL, RARITY_WEIGHT } from './balls';
import { platform } from '../platform';

/** A won tournament. The trophy itself is rebuilt from seed + n (see world/trophy.ts). */
export interface TrophyRec {
  id: string;
  seed: number;
  n: 3 | 9;
  title: string;
  at: number;
  strokes: number;
  toPar: number;
  field: number;
  who: string;
  /** the final scoreboard, best first: name, strokes, to par (trophies won before Nov 15 2026 have none) */
  board?: { n: string; s: number; p: number }[];
}
/** Harvested product, stacked by strain + quality (0 Poor … 4 Perfect). */
export interface Product {
  s: string;
  q: number;
  n: number;
}
/** A letter in your mailbox. cash = money attached (taken with claimMail). */
/** A rolled joint (grind-roll-smoke.md): strain, product quality, roll grade (0 Messy · 1 Decent · 2 Clean), units used, how much is left. */
export interface Joint {
  s: string;
  q: number;
  g: 0 | 1 | 2;
  n: number;
  left: number;
}
export interface Mail {
  id: string;
  from: string;
  subject: string;
  body: string;
  cash?: number;
  at: number;
  read?: boolean;
  claimed?: boolean;
}
export interface Progress {
  mail: Mail[];
  mailSeen: string[];
  product: Product[];
  cash: number;
  cashInit?: boolean;
  bd: number;
  owned: string[];
  earned: string[];
  spins: number;
  welcome?: boolean;
  trophies: TrophyRec[];
  /** Trophies sold at the pawn shop (ids): gone for good, on every device. */
  soldTrophies: string[];
  papers: number;
  grinder: boolean;
  joints: Joint[];
  /** Fertilizer doses in your pockets (bought at Grow Supply). */
  fert: number;
  /** Grow gear you own, by catalog id (growpot, growbed, sprinkler): what's on your lot plus what's in your pockets. */
  gear: Record<string, number>;
  /** What you own to wear, as "part:style" (top:tee, hairStyle:afro, tatChest:skullrose…). Colours are free. */
  closet: string[];
  /** The closet has been seeded with what you were already wearing. */
  closetInit?: boolean;
  /** Ball trails you own, and the one in use ('' = the plain white one). */
  trails: string[];
  trail: string;
  /** Cars you own (vehicles.ts CARS), the one you drive ('' = the golf cart), and each one's paint and rims ('rrggbb:rrggbb'). */
  cars: string[];
  car: string;
  carLook: Record<string, string>;
  /** Bolt-on parts per car you own: three digits, engine · tyres · brakes, each 0 to 3 (vehicles.ts CAR_PARTS). */
  carParts: Record<string, string>;
  at?: number; /* when this copy was last saved (ms): the newer copy wins between devices */
}
const cleanTrophy = (t: any): TrophyRec | null =>
  !t || typeof t !== 'object' || typeof t.id !== 'string'
    ? null
    : {
        id: t.id.slice(0, 24),
        seed: Math.max(1, Math.floor(+t.seed || 1)),
        n: +t.n === 9 ? 9 : 3,
        title: String(t.title || 'The Cup').slice(0, 80),
        at: +t.at || 0,
        strokes: Math.max(0, Math.floor(+t.strokes || 0)),
        toPar: Math.floor(+t.toPar || 0),
        field: Math.max(1, Math.floor(+t.field || 1)),
        who: String(t.who || '').slice(0, 24),
        board: Array.isArray(t.board)
          ? t.board
              .filter((r: any) => r && typeof r === 'object')
              .slice(0, 8)
              .map((r: any) => ({ n: String(r.n || '?').slice(0, 24), s: Math.max(0, Math.floor(+r.s || 0)), p: Math.floor(+r.p || 0) }))
          : undefined,
      };
const LS = 'gh.progress.v1';
/** Cash: the second currency (street-dealer-economy.md). Never converts to or from Birdie Dollars. */
export const STARTING_CASH = 5000;
const clean0 = (
  p: any,
): Omit<
  Progress,
  'papers' | 'grinder' | 'joints' | 'fert' | 'gear' | 'closet' | 'closetInit' | 'trails' | 'trail' | 'cars' | 'car' | 'carLook' | 'carParts'
> => {
  const owned = Array.isArray(p?.owned) ? ([...new Set(p.owned.filter((id: any) => BALL.has(id)))] as string[]) : [];
  if (!owned.includes(DEFAULT_BALL)) owned.unshift(DEFAULT_BALL);
  return {
    mail: Array.isArray(p?.mail)
      ? p.mail
          .filter((m: any) => m && typeof m.id === 'string')
          .slice(-60)
          .map((m: any) => ({
            id: String(m.id).slice(0, 40),
            from: String(m.from || '').slice(0, 60),
            subject: String(m.subject || '').slice(0, 100),
            body: String(m.body || '').slice(0, 3000),
            cash: Math.max(0, Math.floor(+m.cash || 0)) || undefined,
            at: +m.at || 0,
            read: !!m.read,
            claimed: !!m.claimed,
          }))
      : [],
    mailSeen: Array.isArray(p?.mailSeen) ? p.mailSeen.filter((x: any) => typeof x === 'string').slice(-200) : [],
    product: Array.isArray(p?.product)
      ? p.product
          .filter((x: any) => x && typeof x.s === 'string' && +x.n > 0)
          .map((x: any) => ({ s: String(x.s).slice(0, 8), q: Math.max(0, Math.min(4, Math.floor(+x.q || 0))), n: Math.min(99999, Math.floor(+x.n)) }))
          .slice(0, 40)
      : [],
    cash: Math.max(0, Math.min(1e9, Math.floor(+p?.cash || 0))),
    cashInit: !!p?.cashInit,
    bd: Math.max(0, Math.min(999, Math.floor(+p?.bd || 0))),
    owned,
    earned: Array.isArray(p?.earned) ? p.earned.filter((s: any) => typeof s === 'string').slice(-60) : [],
    spins: Math.max(0, +p?.spins || 0),
    welcome: !!p?.welcome,
    trophies: Array.isArray(p?.trophies) ? (p.trophies.map(cleanTrophy).filter(Boolean).slice(-200) as TrophyRec[]) : [],
    soldTrophies: Array.isArray(p?.soldTrophies)
      ? [...new Set<string>(p.soldTrophies.filter((x: any) => typeof x === 'string' && x.length < 80))].slice(-400)
      : [],
  };
};
const clean = (p: any): Progress => ({
  ...clean0(p),
  at: Math.max(0, +p?.at || 0) || undefined,
  papers: Math.max(0, Math.min(999, Math.floor(+p?.papers || 0))),
  grinder: !!p?.grinder,
  fert: Math.max(0, Math.min(999, Math.floor(+p?.fert || 0))),
  closet: Array.isArray(p?.closet)
    ? [...new Set<string>(p.closet.filter((s: any) => typeof s === 'string' && /^[a-zA-Z]{2,12}:[a-zA-Z0-9_]{1,16}$/.test(s)))].slice(0, 400)
    : [],
  closetInit: !!p?.closetInit,
  trails: Array.isArray(p?.trails)
    ? [...new Set<string>(p.trails.filter((s: any) => typeof s === 'string' && /^[a-z]{2,12}$/.test(s)))].slice(0, 30)
    : [],
  trail: typeof p?.trail === 'string' && /^[a-z]{0,12}$/.test(p.trail) ? p.trail : '',
  cars: Array.isArray(p?.cars) ? [...new Set<string>(p.cars.filter((s: any) => typeof s === 'string' && /^[a-z]{2,10}$/.test(s)))].slice(0, 40) : [],
  car: typeof p?.car === 'string' && /^[a-z]{0,10}$/.test(p.car) && (!p.car || (Array.isArray(p?.cars) && p.cars.includes(p.car))) ? p.car : '',
  carLook: Object.fromEntries(
    Object.entries(p?.carLook && typeof p.carLook === 'object' ? p.carLook : {})
      .filter(([k, v]) => /^[a-z]{2,10}$/.test(k) && typeof v === 'string' && /^([0-9a-f]{6})?:([0-9a-f]{6})?$/.test(v))
      .slice(0, 40),
  ) as Record<string, string>,
  carParts: Object.fromEntries(
    Object.entries(p?.carParts && typeof p.carParts === 'object' ? p.carParts : {})
      .filter(([k, v]) => /^[a-z]{2,10}$/.test(k) && typeof v === 'string' && /^[0-3]{3}$/.test(v))
      .slice(0, 40),
  ) as Record<string, string>,
  gear: Object.fromEntries(
    Object.entries(p?.gear && typeof p.gear === 'object' ? p.gear : {})
      .filter(([k, v]) => /^[a-z0-9_]{2,24}$/.test(k) && +(v as any) > 0)
      .slice(0, 400) // (the catalog is past a hundred kinds of thing and growing: a low cap here would quietly drop what you own)
      .map(([k, v]) => [k, Math.min(99, Math.floor(+(v as any)))]),
  ),
  joints: Array.isArray(p?.joints)
    ? p.joints
        .filter((j: any) => j && typeof j.s === 'string')
        .slice(0, 40)
        .map((j: any) => ({
          s: String(j.s).slice(0, 8),
          q: Math.max(0, Math.min(4, Math.floor(+j.q || 0))),
          g: ([0, 1, 2].includes(+j.g) ? +j.g : 1) as 0 | 1 | 2,
          n: Math.max(1, Math.min(3, Math.floor(+j.n || 1))),
          left: Math.max(0, Math.min(1, +j.left || 0)),
        }))
        .filter((j: Joint) => j.left > 0.02)
    : [],
});
let cur: Progress = clean(null);
const listeners = new Set<(p: Progress) => void>();
export const progress = () => cur;
export function onProgress(f: (p: Progress) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * Load once: this browser's copy first, then the account copy. Between the two, the copy saved most recently wins
 * (so playing on a second device can't bring back an old wallet); trophies are merged from both. Everyone who calls
 * this while it's still loading waits for the same load, so nothing they change can be overwritten by it.
 * New players get one Birdie Dollar to try the machine.
 */
let loading: Promise<Progress> | null = null;
export function loadProgress() {
  return (loading ??= doLoad());
}
async function doLoad() {
  try {
    const s = localStorage.getItem(LS);
    if (s) cur = clean(JSON.parse(s));
  } catch {}
  try {
    const pf = await platform();
    if (pf.db) {
      const d = await pf.db.doc(`data/users/${pf.uid}/progress`).get();
      if (d.exists) {
        const r = clean(d.data());
        // copies from before saves were time-stamped: keep the old rule (the one with more balls and spins)
        const remoteWins = cur.at
          ? (r.at || 0) > cur.at
          : r.owned.length + r.spins > cur.owned.length + cur.spins || (r.bd > cur.bd && r.spins >= cur.spins);
        const keep = remoteWins ? r : cur,
          other = remoteWins ? cur : r;
        const sold = new Set([...keep.soldTrophies, ...other.soldTrophies]); // (a trophy pawned on one device stays pawned)
        for (const t of other.trophies) if (!keep.trophies.some(x => x.id === t.id)) keep.trophies.push(t);
        keep.trophies = keep.trophies.filter(t => !sold.has(t.id));
        keep.soldTrophies = [...sold].slice(-400);
        cur = keep;
      }
    }
  } catch {}
  if (!cur.welcome) {
    cur.welcome = true;
    cur.bd += 1;
  }
  if (!cur.cashInit) {
    cur.cashInit = true;
    cur.cash += STARTING_CASH;
  } // everyone starts with a bankroll
  save();
  return cur;
}
// The same player in a second tab of this browser: whichever tab saved last holds the truth, so the other adopts it
// instead of later saving its own stale copy over it (which would undo a purchase or bring back spent cash).
if (typeof window !== 'undefined')
  window.addEventListener('storage', e => {
    if (e.key !== LS || !e.newValue || !loading) return;
    try {
      const other = clean(JSON.parse(e.newValue));
      if ((other.at || 0) <= (cur.at || 0)) return;
      cur = other;
      for (const f of listeners) {
        try {
          f(cur);
        } catch {}
      }
    } catch {}
  });
/** Save here and to the account. Account writes go out one at a time, always with the latest state, so an older
 *  write can never land after a newer one. */
let remoteBusy = false,
  remoteDirty = false;
async function save() {
  cur.at = Date.now();
  try {
    localStorage.setItem(LS, JSON.stringify(cur));
  } catch {}
  for (const f of listeners) {
    try {
      f(cur);
    } catch {}
  }
  remoteDirty = true;
  if (remoteBusy) return;
  remoteBusy = true;
  void (async () => {
    // in the background: nothing in the game waits on the network to spend or earn
    try {
      const pf = await platform();
      while (remoteDirty) {
        remoteDirty = false;
        if (pf.db && pf.canWrite) await pf.db.doc(`data/users/${pf.uid}/progress`).set(JSON.parse(JSON.stringify(cur)));
      }
    } catch {
      remoteDirty = false;
    } finally {
      remoteBusy = false;
    }
  })();
}

/** Award for a finished hole (once per round). Returns Birdie Dollars won. */
export async function awardHole(roundId: string, strokes: number, par: number) {
  await loadProgress();
  if (cur.earned.includes(roundId)) return 0;
  const d = strokes - par,
    won = strokes === 1 ? 3 : d <= -3 ? 3 : d === -2 ? 2 : d === -1 ? 1 : 0;
  cur.earned.push(roundId);
  cur.bd += won;
  await save();
  return won;
}

/** One spin: costs a Birdie Dollar, always gives a ball you don't own yet (rarer ones come up less often). */
export async function spin(): Promise<string | null> {
  await loadProgress();
  if (cur.bd < 1) return null;
  const pool = BALLS.filter(b => !cur.owned.includes(b.id));
  if (!pool.length) return null;
  const total = pool.reduce((a, b) => a + RARITY_WEIGHT[b.rarity], 0);
  let r = Math.random() * total,
    got = pool[0];
  for (const b of pool) {
    r -= RARITY_WEIGHT[b.rarity];
    if (r <= 0) {
      got = b;
      break;
    }
  }
  cur.bd -= 1;
  cur.spins += 1;
  cur.owned.push(got.id);
  await save();
  return got.id;
}

/** A tournament win: the trophy goes into the case (once per tournament). Returns false if it was already there. */
export async function awardTrophy(t: TrophyRec) {
  await loadProgress();
  if (cur.trophies.some(x => x.id === t.id) || cur.soldTrophies.includes(t.id)) return false;
  cur.trophies.push(t);
  await save();
  return true;
}

/** Sell a trophy at the pawn shop: it leaves the case for good and the cash arrives. Not while it stands on your lot. */
export async function sellTrophy(id: string, price: number) {
  await loadProgress();
  if (!cur.trophies.some(t => t.id === id) || placedKeys.includes('trophy:' + id)) return false;
  cur.trophies = cur.trophies.filter(t => t.id !== id);
  cur.soldTrophies.push(id);
  cur.cash += Math.max(0, Math.round(price));
  await save();
  return true;
}
/** Is this catalog item (e.g. 'trophy:<id>') standing on your lot right now? */
export const isPlaced = (key: string) => placedKeys.includes(key);
/** Change the cash balance (negative = spend). Refuses (returns false) if it would go below zero. */
export async function addCash(delta: number) {
  await loadProgress();
  delta = Math.round(delta);
  if (cur.cash + delta < 0) return false;
  cur.cash += delta;
  await save();
  return true;
}

/** Put harvested units into the stash (stacks by strain + quality). */
export async function addProduct(strain: string, q: number, n: number) {
  await loadProgress();
  const st = cur.product.find(x => x.s === strain && x.q === q);
  if (st) st.n += n;
  else {
    if (slotsUsed() >= INV_SLOTS) return false; // no room for a new stack
    cur.product.push({ s: strain, q, n });
  }
  await save();
  return true;
}
/** Sell n units of a stack for `cash`: removes them and pays out in one save. Returns false if there aren't that many. */
export async function sellProduct(strain: string, q: number, n: number, cash: number) {
  await loadProgress();
  const st = cur.product.find(x => x.s === strain && x.q === q);
  if (!st || st.n < n || n <= 0) return false;
  st.n -= n;
  if (!st.n) cur.product = cur.product.filter(x => x !== st);
  cur.cash += Math.round(cash);
  await save();
  return true;
}

/** Deliver a letter once ever (by id): deleting it later doesn't bring it back. Returns true if it was new. */
export async function deliverMail(m: Omit<Mail, 'at'> & { at?: number }) {
  await loadProgress();
  if (cur.mailSeen.includes(m.id)) return false;
  cur.mailSeen.push(m.id);
  cur.mail.push({ ...m, at: m.at || Date.now(), read: false, claimed: false });
  await save();
  return true;
}
export async function markRead(id: string) {
  await loadProgress();
  const m = cur.mail.find(x => x.id === id);
  if (m && !m.read) {
    m.read = true;
    await save();
  }
}
/** Take the cash attached to a letter (once). */
export async function claimMail(id: string) {
  await loadProgress();
  const m = cur.mail.find(x => x.id === id);
  if (!m || m.claimed || !m.cash) return 0;
  m.claimed = true;
  m.read = true;
  cur.cash += m.cash;
  await save();
  return m.cash;
}
export async function deleteMail(id: string) {
  await loadProgress();
  const m = cur.mail.find(x => x.id === id);
  if (!m || (m.cash && !m.claimed)) return false;
  cur.mail = cur.mail.filter(x => x !== m);
  await save();
  return true;
}

/** Supplies for rolling (sold by the Street Dealer until there's a Grow Supply store). */
// ------------------------------------------------------------------ the inventory: 32 slots
export const INV_SLOTS = 32;
/** Grow gear is small enough to carry, so spare pieces take an inventory slot; furniture waits in your lot's own storage. */
const CARRIED = ['growpot', 'growbed', 'sprinkler'];
/** What's standing on your own lot (catalog ids, one per placed item): gear and trophies out there take no slot. */
let placedKeys: string[] = [];
export function setPlaced(keys: string[]) {
  placedKeys = keys;
}
export const placedCount = (id: string) => placedKeys.filter(k => k === id).length;
/** Grow gear in your pockets (owned and not standing on your lot). */
export const spareGear = (p: Progress, id: string) => Math.max(0, (p.gear[id] || 0) - placedCount(id));
/** How many of the 32 slots are in use: one per stack, joint, tool and trophy you're carrying. */
export function slotsUsed(p: Progress = cur) {
  return (
    p.product.length +
    p.joints.length +
    (p.papers > 0 ? 1 : 0) +
    (p.grinder ? 1 : 0) +
    (p.fert > 0 ? 1 : 0) +
    CARRIED.filter(id => spareGear(p, id) > 0).length +
    p.trophies.filter(t => !placedKeys.includes('trophy:' + t.id)).length
  );
}
/** Whatever is on the lot is owned: older saves placed gear before it was something you carried. */
export async function ownAtLeast(counts: Record<string, number>) {
  await loadProgress();
  let ch = false;
  for (const [id, n] of Object.entries(counts))
    if ((cur.gear[id] || 0) < n) {
      cur.gear[id] = n;
      ch = true;
    }
  if (ch) await save();
}
export type BuyResult = 'ok' | 'cash' | 'full' | 'have';
/** Buy from a shop: papers (×20), the grinder, fertilizer (×3 doses), or grow gear by catalog id. */
export async function buyItem(kind: string, price: number): Promise<BuyResult> {
  await loadProgress();
  if (kind === 'grinder' && cur.grinder) return 'have';
  if (cur.cash < price) return 'cash';
  const newSlot =
    kind === 'papers' ? !cur.papers : kind === 'grinder' ? true : kind === 'fert' ? !cur.fert : CARRIED.includes(kind) && !spareGear(cur, kind);
  if (newSlot && slotsUsed() >= INV_SLOTS) return 'full';
  cur.cash -= price;
  if (kind === 'papers') cur.papers += 20;
  else if (kind === 'grinder') cur.grinder = true;
  else if (kind === 'fert') cur.fert += 3;
  else cur.gear[kind] = (cur.gear[kind] || 0) + 1;
  await save();
  return 'ok';
}
/** Clothes, hair and tattoos: add these to the closet for `cost` (0 the first time, for what you already wore). */
export async function addToCloset(keys: string[], cost: number, seed = false) {
  await loadProgress();
  if (cur.cash < cost) return false;
  cur.cash -= cost;
  for (const k of keys) if (!cur.closet.includes(k)) cur.closet.push(k);
  if (seed) cur.closetInit = true;
  await save();
  return true;
}
/** Cars: buy one (and drive it), or switch to one you own ('' = back to the golf cart). */
export async function setCar(id: string, price: number) {
  await loadProgress();
  if (id && !cur.cars.includes(id)) {
    if (cur.cash < price) return false;
    cur.cash -= price;
    cur.cars.push(id);
  }
  cur.car = id;
  await save();
  return true;
}
/** Repaint a car you own (paint and rims as 'rrggbb', '' = factory). */
export async function paintCar(id: string, paint: string, rim: string, price: number) {
  await loadProgress();
  if (!cur.cars.includes(id) || cur.cash < price) return false;
  cur.cash -= price;
  cur.carLook[id] = `${paint}:${rim}`;
  await save();
  return true;
}
/** Fit the next stage of a part (0 engine, 1 tyres, 2 brakes) to a car you own. Stages go on in order, one at a time. */
export async function fitPart(id: string, part: number, stage: number, price: number) {
  await loadProgress();
  const cur0 = cur.carParts[id] || '000';
  if (!cur.cars.includes(id) || part < 0 || part > 2 || stage !== +cur0[part] + 1 || stage > 3 || cur.cash < price) return false;
  cur.cash -= price;
  cur.carParts[id] = cur0.slice(0, part) + stage + cur0.slice(part + 1);
  await save();
  return true;
}
/** Ball trails: buy one (and put it on), or switch to one you own. */
export async function setTrail(id: string, price: number) {
  await loadProgress();
  if (id && !cur.trails.includes(id)) {
    if (cur.cash < price) return false;
    cur.cash -= price;
    cur.trails.push(id);
  }
  cur.trail = id;
  await save();
  return true;
}
/** Use one dose of fertilizer. */
export function useFert() {
  if (cur.fert <= 0) return false;
  cur.fert--;
  void save();
  return true;
}
export async function buySupply(kind: 'papers' | 'grinder', price: number) {
  await loadProgress();
  if (cur.cash < price) return false;
  if (kind === 'grinder' && cur.grinder) return false;
  cur.cash -= price;
  if (kind === 'papers') cur.papers += 20;
  else cur.grinder = true;
  await save();
  return true;
}
/** Roll: uses n units of a product stack and one paper, adds the joint. */
export async function rollJoint(strain: string, q: number, n: number, grade: 0 | 1 | 2) {
  await loadProgress();
  const st = cur.product.find(x => x.s === strain && x.q === q);
  if (!st || st.n < n || cur.papers < 1) return false;
  st.n -= n;
  if (!st.n) cur.product = cur.product.filter(x => x !== st);
  cur.papers--;
  cur.joints.push({ s: strain, q, g: grade, n, left: 1 });
  await save();
  return true;
}
/** How much of joint i is left (0 = finished: it's removed). */
export async function setJointLeft(i: number, left: number) {
  await loadProgress();
  const j = cur.joints[i];
  if (!j) return;
  if (left <= 0.02) cur.joints.splice(i, 1);
  else j.left = left;
  await save();
}
/** A joint someone passed you. */
export async function addJoint(j: Joint) {
  await loadProgress();
  if (cur.joints.length >= 40) return;
  cur.joints.push({ ...j });
  await save();
}
