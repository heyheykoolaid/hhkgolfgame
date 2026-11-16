// Growing and selling (design/grow-mechanics.md, design/street-dealer-economy.md). Pure functions: the plant owner's
// client ticks its own plants while they're in the game (no offline growth), saves them with the lot, and everyone
// else just draws what was saved. Plants never die: neglect only lowers quality.

export type Tier = 'common' | 'mid' | 'premium' | 'exotic';
export interface Strain {
  id: string;
  name: string;
  tier: Tier;
  mins: [number, number, number];
  yield: [number, number];
  seed: number;
  color: string;
}
/** Grow times are minutes of play: seedling, vegetative, flowering. */
export const STRAINS: Strain[] = [
  { id: 'gc', name: 'Green Crack', tier: 'common', mins: [2, 6, 8], yield: [9, 12], seed: 120, color: '#6fae3c' },
  { id: 'dp', name: 'Durban Poison', tier: 'common', mins: [3, 7, 9], yield: [11, 15], seed: 140, color: '#7fb04a' },
  { id: 'bd', name: 'Blue Dream', tier: 'mid', mins: [3, 9, 11], yield: [10, 14], seed: 420, color: '#5f9a6e' },
];
export const STRAIN = new Map(STRAINS.map(s => [s.id, s]));
export const FEED_COST = 25;
export const QUALITY = ['Poor', 'Average', 'Good', 'Excellent', 'Perfect'] as const;
export const QUALITY_MULT = [0.65, 1.0, 1.2, 1.4, 1.55];
export const TIER_BASE: Record<Tier, number> = { common: 95, mid: 185, premium: 340, exotic: 520 };
/** Grow equipment: how many plants, the best quality it allows, and a yield bonus. Better gear (tents, lights) comes later. */
export const GEAR: Record<string, { slots: number; ceil: number; yield: number }> = {
  growpot: { slots: 1, ceil: 2, yield: 1.0 }, // cheap pot: up to Good
  growbed: { slots: 3, ceil: 3, yield: 1.15 }, // raised bed: up to Excellent
};

export interface Plant {
  s: string;
  id: number;
  g: number;
  w: number;
  n: number;
  cs: number;
  ct: number;
  rot: number;
  pk: number;
}
export const STAGES = ['Seedling', 'Vegetative', 'Flowering', 'Ready', 'Overripe'] as const;
export const PEAK_S = 300; // a ready plant stays at its best for 5 minutes of play, then slowly loses quality
const WATER_S = 240,
  FEED_S = 600; // a full watering lasts 4 minutes, fertilizer 10

export const newPlant = (s: string, id: number): Plant => ({ s, id, g: 0, w: 0.6, n: 0.5, cs: 0, ct: 0, rot: 0, pk: 0 });
export const growTotal = (p: Plant) => {
  const m = STRAIN.get(p.s)!.mins;
  return (m[0] + m[1] + m[2]) * 60;
};
export function stageOf(p: Plant) {
  const m = STRAIN.get(p.s)!.mins,
    g = p.g / 60;
  if (g < m[0]) return 0;
  if (g < m[0] + m[1]) return 1;
  if (g < m[0] + m[1] + m[2]) return 2;
  return p.pk > PEAK_S ? 4 : 3;
}
export const progressOf = (p: Plant) => Math.min(1, p.g / growTotal(p));
/** How well the plant is being looked after right now (0–1). */
export function careNow(p: Plant) {
  const st = stageOf(p),
    ws = p.w < 0.12 ? 0.3 : p.w < 0.3 ? 0.75 : 1,
    ns = st === 0 ? 1 : p.n < 0.12 ? 0.45 : p.n < 0.3 ? 0.8 : 1;
  return ws * ns;
}
/** Advance one plant by dt seconds of the owner's play time. */
export function tickPlant(p: Plant, dt: number) {
  const st = stageOf(p);
  if (st >= 3) {
    p.pk += dt;
    return p;
  }
  const c = careNow(p);
  p.cs += c * dt;
  p.ct += dt;
  p.g += dt * (p.w <= 0 ? 0 : p.w < 0.12 ? 0.6 : 1) * (st > 0 && p.n < 0.12 ? 0.6 : 1); // bone dry: growth pauses until watered
  p.w = Math.max(0, p.w - dt / WATER_S);
  if (st > 0) p.n = Math.max(0, p.n - dt / FEED_S);
  return p;
}
/** Watering an already wet plant risks root rot (a small permanent quality hit, up to 3 times). */
export function water(p: Plant) {
  if (p.w > 0.85) p.rot = Math.min(3, p.rot + 1);
  p.w = 1;
  return p;
}
export function feed(p: Plant) {
  p.n = 1;
  return p;
}
/** Care v2: pour some water (0–1 = a full watering). Returns how much spilled over (the caller decides when that's overwatering). */
export function pour(p: Plant, amt: number) {
  p.w += amt;
  const over = Math.max(0, p.w - 1);
  p.w = Math.min(1, p.w);
  return over;
}
export function rootRot(p: Plant) {
  p.rot = Math.min(3, p.rot + 1);
  return p;
}
/** Care v2: spread fertilizer (0–1 = fully treated). */
export function fertilize(p: Plant, amt: number) {
  p.n = Math.min(1, p.n + amt);
  return p;
}
export const SPRINKLER_R = 2.6; // a sprinkler waters every plant within this many metres

export function careScore(p: Plant) {
  let c = p.ct > 0 ? p.cs / p.ct : 1;
  c -= p.rot * 0.07;
  c -= (Math.max(0, p.pk - PEAK_S) / 600) * 0.4; // overripe: loses up to 40% over the next 10 minutes
  return Math.max(0, Math.min(1, c));
}
/** Quality index 0–4 (Poor … Perfect), capped by the equipment. */
export function qualityOf(p: Plant, gear: string) {
  const c = careScore(p),
    q = c >= 0.98 ? 4 : c >= 0.93 ? 3 : c >= 0.8 ? 2 : c >= 0.6 ? 1 : 0;
  return Math.min(GEAR[gear]?.ceil ?? 2, q);
}
const hash01 = (n: number) => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
export function yieldOf(p: Plant, gear: string) {
  const s = STRAIN.get(p.s)!,
    base = s.yield[0] + (s.yield[1] - s.yield[0]) * hash01(p.id);
  return Math.max(1, Math.round(base * (0.75 + 0.25 * careScore(p)) * (GEAR[gear]?.yield ?? 1)));
}

// ---------------- the Street Dealer's prices (Option B: the clamp only applies to the market part) ----------------
export const DAY_MS = 86400000;
/** Today's preferred strain: rotates daily, the same for everyone (no server needed). */
export const preferredStrain = (now = Date.now()) => STRAINS[Math.floor(now / DAY_MS) % STRAINS.length].id;
export const bulkBonus = (n: number) => (n >= 50 ? 1.14 : n >= 30 ? 1.1 : n >= 15 ? 1.06 : 1);
export function unitPrice(strain: string, q: number, qty: number, now = Date.now(), supply = 1) {
  const s = STRAIN.get(strain)!,
    base = TIER_BASE[s.tier],
    pref = preferredStrain(now) === strain ? 1.22 : 1,
    bulk = bulkBonus(qty);
  const marketRaw = supply * pref * bulk,
    market = Math.min(1.75, Math.max(0.55, marketRaw));
  return {
    base,
    quality: QUALITY_MULT[q],
    supply,
    pref,
    bulk,
    marketRaw,
    market,
    clamped: market !== marketRaw,
    unit: base * QUALITY_MULT[q] * market,
  };
}
export const saleTotal = (strain: string, q: number, qty: number, now = Date.now()) => Math.round(unitPrice(strain, q, qty, now).unit * qty);

/** A garden read from storage or another player's record, made safe: only known strains, every number finite and in range. */
export function cleanGarden(v: any): Record<string, Plant> {
  const out: Record<string, Plant> = Object.create(null);
  if (!v || typeof v !== 'object') return out;
  const n = (x: any, lo: number, hi: number) => {
    const y = +x;
    return isFinite(y) ? Math.min(hi, Math.max(lo, y)) : lo;
  };
  for (const k of Object.keys(v).slice(0, 400)) {
    const p = v[k];
    if (k.length > 60 || !p || typeof p !== 'object' || !STRAIN.has(p.s)) continue;
    out[k] = {
      s: p.s,
      id: Math.floor(n(p.id, 0, 2 ** 31)),
      g: n(p.g, 0, 1e6),
      w: n(p.w, 0, 1),
      n: n(p.n, 0, 1),
      cs: n(p.cs, 0, 1e9),
      ct: n(p.ct, 0, 1e9),
      rot: n(p.rot, 0, 1e6),
      pk: n(p.pk, 0, 1e9),
    };
  }
  return out;
}
