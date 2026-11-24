// Golf betting (design/golf-betting.md): the rules, as pure functions every client runs the same way.
//
// There is no server. Money only ever moves between the players' own wallets, so the whole design is about every
// client reaching the SAME answer from what players publish about themselves:
//
//   offer  → the proposer publishes it (single writer). Others answer in their own presence: join or pass.
//   lock   → the proposer alone publishes the roster. One writer, so everybody reads the same roster. Each member
//            pays their stake into the pot (their own wallet) when they see a lock that names them.
//   settle → ONE member (the lowest uid still present) works out the result and publishes it; everyone else copies
//            that published outcome instead of computing their own. Presence timing can differ between clients
//            (who left when?), so computing separately could pay a pot twice; copying can't.
//
// Leaving is forfeiting: you must be present when a bet settles to win it, and your stake stays in the pot.
// Every pot is equal stakes, and always sums to zero across the players (no money is created or destroyed, except
// when literally everyone in a bet leaves before it settles).

export type BetType = 'hole' | 'ctp' | 'skins' | 'round' | 'make' | 'green';
export const POT_TYPES: BetType[] = ['hole', 'ctp', 'skins', 'round'];
export const LIVE_TYPES: BetType[] = ['make', 'green'];
export const isLive = (t: BetType) => t === 'make' || t === 'green';
export const BET_NAME: Record<BetType, string> = {
  hole: 'Hole winner',
  ctp: 'Closest to the pin',
  skins: 'Skins',
  round: 'Round winner',
  make: 'Holes it',
  green: 'Hits the green',
};

/** An open offer. a = each player's stake (per hole for skins). Live bets: on = whose shot, ts/sk = their strokes and
 *  timeouts when it was offered (the bet is about stroke ts + 1), side = what the proposer says (1 = yes, it happens). */
export interface Offer {
  id: string;
  t: BetType;
  a: number;
  h: number;
  by: string;
  on?: string;
  ts?: number;
  sk?: number;
  side?: 0 | 1;
}
/** A locked bet: r = the roster (uids, sorted; live bets: [proposer, taker]). n = holes it runs over (skins, round). */
export interface Locked extends Offer {
  r: string[];
  n: number;
}
/** A published result: who is paid what out of the pot. end = the bet is finished (skins pay hole by hole). */
export interface Outcome {
  pay: [string, number][];
  end?: 1;
  note?: string;
}
/** What each player publishes about betting. */
export interface BetPres {
  of: Offer[];
  jn: string[];
  ps: string[];
  lk: Locked[];
  out: Record<string, Outcome>;
  tp?: [number, number];
}

export const OFFER_SECONDS = 35,
  LIVE_SECONDS = 25,
  ABSENT_GRACE = 15;
export const offerId = (o: Omit<Offer, 'id'>) =>
  isLive(o.t) ? `${o.by}.${o.t}.${o.a}.${o.h}.${o.on}.${o.ts}.${o.side}` : `${o.by}.${o.t}.${o.a}.${o.h}`;
/** What one player puts in when the bet locks (skins pay every hole's stake up front). */
export const stakeOf = (b: { t: BetType; a: number }, holes: number) => b.a * (b.t === 'skins' ? holes : 1);
export const potOf = (b: Locked) => stakeOf(b, b.n) * b.r.length;
/** The key a result is published under. Skins have one per hole. */
export const outKey = (b: Locked, h: number) => (b.t === 'skins' ? `${b.id}@${h}` : b.id);

/** What a client knows about a player right now. here = in the room; gone = absent for longer than the grace. */
export interface BetPlayer {
  uid: string;
  here: boolean;
  gone: boolean;
  h: number;
  done: boolean;
  busy: boolean;
  picked: boolean;
  strokes: number;
  sk: number;
  card: number[];
  x: number;
  z: number;
  tp?: [number, number];
}
export interface BetCtx {
  holes: number;
  pin: { x: number; z: number };
  onGreen(x: number, z: number): boolean;
}

/** A player's final strokes on hole h, or null if they haven't finished it. */
export function scoreOn(p: BetPlayer, h: number): number | null {
  if (p.h === h) return p.done && p.strokes > 0 ? p.strokes : null;
  if (p.h > h && p.card[h] > 0) return p.card[h];
  return null;
}
/** Split a pot between winners: whole dollars, the odd ones to the first names in uid order (same on every client). */
export function splitPot(pot: number, winners: string[]): [string, number][] {
  const w = winners.slice().sort(),
    k = w.length;
  if (!k || pot <= 0) return [];
  const base = Math.floor(pot / k),
    extra = pot - base * k;
  return w.map((u, i) => [u, base + (i < extra ? 1 : 0)]);
}
const paid = (o: Outcome | undefined) => (o ? o.pay.reduce((t, [, v]) => t + v, 0) : 0);

/** Lock an offer with the players who joined it. Null if nobody did (a bet needs two). Live bets take the first taker. */
export function lockOffer(o: Offer, joiners: string[], holes: number): Locked | null {
  const js = [...new Set(joiners)].filter(u => u !== o.by).sort();
  if (!js.length) return null;
  if (isLive(o.t)) return { ...o, r: [o.by, js[0]], n: 1 };
  return { ...o, r: [o.by, ...js].sort(), n: o.t === 'skins' || o.t === 'round' ? Math.max(1, holes - o.h) : 1 };
}

/**
 * Work out a locked bet's next result, or null if it can't be settled yet (someone is still playing, or has only
 * just dropped out). outs = the results already published (skins need the earlier holes). h = the hole to look at.
 * Only the settling member calls this; everyone else copies what they publish.
 */
export function settle(
  b: Locked,
  players: Map<string, BetPlayer>,
  ctx: BetCtx,
  outs: Record<string, Outcome>,
  h: number,
): { key: string; out: Outcome } | null {
  const mem = b.r.map(
    u =>
      players.get(u) ||
      ({ uid: u, here: false, gone: true, h: 0, done: false, busy: false, picked: false, strokes: 0, sk: 0, card: [], x: 0, z: 0 } as BetPlayer),
  );
  if (mem.some(m => !m.here && !m.gone)) return null; // someone just vanished: wait out the grace
  const here = mem.filter(m => m.here),
    pot = potOf(b),
    key = outKey(b, h);
  if (!here.length) return null;
  const last = b.h + b.n - 1;
  const alreadyPaid = () => {
    let t = 0;
    for (let i = b.h; i <= last; i++) t += paid(outs[`${b.id}@${i}`]);
    return t;
  };

  // everyone else has left: the one who stayed takes what's left of the pot
  if (here.length === 1 && b.r.length > 1 && !isLive(b.t)) {
    const rest = b.t === 'skins' ? pot - alreadyPaid() : pot;
    return { key, out: { pay: rest > 0 ? [[here[0].uid, rest]] : [], end: 1, note: 'left' } };
  }
  if (b.t === 'hole') {
    const sc = here.map(m => [m.uid, scoreOn(m, b.h)] as const);
    if (sc.some(([, s]) => s === null)) return null;
    const best = Math.min(...sc.map(([, s]) => s!));
    return {
      key,
      out: {
        pay: splitPot(
          pot,
          sc.filter(([, s]) => s === best).map(([u]) => u),
        ),
        end: 1,
      },
    };
  }
  if (b.t === 'ctp') {
    // each player's own tee shot, measured when it stops; someone who finished the hole without one (picked up) is out
    const d = here.map(m => [m.uid, m.tp && m.tp[0] === b.h ? m.tp[1] : scoreOn(m, b.h) !== null ? -1 : null] as const);
    if (d.some(([, v]) => v === null)) return null;
    const ok = d.filter(([, v]) => v! >= 0);
    if (!ok.length)
      return {
        key,
        out: {
          pay: splitPot(
            pot,
            here.map(m => m.uid),
          ),
          end: 1,
          note: 'nobody',
        },
      }; // nobody kept a ball in play: split it
    const best = Math.min(...ok.map(([, v]) => v!));
    return {
      key,
      out: {
        pay: splitPot(
          pot,
          ok.filter(([, v]) => v === best).map(([u]) => u),
        ),
        end: 1,
      },
    };
  }
  if (b.t === 'round') {
    const tot: [string, number][] = [];
    for (const m of here) {
      let t = 0;
      for (let i = b.h; i <= last; i++) {
        const s = scoreOn(m, i);
        if (s === null) return null;
        t += s;
      }
      tot.push([m.uid, t]);
    }
    const best = Math.min(...tot.map(([, t]) => t));
    return {
      key,
      out: {
        pay: splitPot(
          pot,
          tot.filter(([, t]) => t === best).map(([u]) => u),
        ),
        end: 1,
      },
    };
  }
  if (b.t === 'skins') {
    if (h < b.h || h > last) return null;
    for (let i = b.h; i < h; i++) if (!outs[`${b.id}@${i}`]) return null; // earlier holes first: the carry depends on them
    const sc = here.map(m => [m.uid, scoreOn(m, h)] as const);
    if (sc.some(([, s]) => s === null)) return null;
    const best = Math.min(...sc.map(([, s]) => s!)),
      win = sc.filter(([, s]) => s === best).map(([u]) => u);
    const inPot = b.a * b.r.length * (h - b.h + 1) - alreadyPaid(); // this hole's skin plus everything carried
    if (win.length === 1) return { key, out: { pay: [[win[0], inPot]], ...(h === last ? { end: 1 as const } : {}) } };
    if (h === last)
      return {
        key,
        out: {
          pay: splitPot(
            inPot,
            here.map(m => m.uid),
          ),
          end: 1,
          note: 'carry',
        },
      }; // tied on the last hole: the carry goes back to those still playing
    return { key, out: { pay: [], note: 'carry' } };
  }
  // live bets: one shot by b.on. r = [proposer, taker]; the proposer backs `side`, the taker the opposite.
  const T = players.get(b.on || ''),
    stay = (u: string) => !!players.get(u)?.here;
  const refund = (note: string): { key: string; out: Outcome } => {
    // called off: stakes back (a leaver's goes to the one who stayed)
    const hs = b.r.filter(stay);
    return { key, out: { pay: hs.length === 2 ? hs.map(u => [u, b.a] as [string, number]) : splitPot(pot, hs), end: 1, note } };
  };
  if (!T || (!T.here && T.gone)) return refund('void');
  if (!T.here) return null;
  let yes: boolean;
  if (T.h !== b.h) {
    if (T.h < b.h) return refund('void');
    const s = T.card[b.h] || 0;
    yes = b.t === 'make' && s === (b.ts || 0) + 1;
  } // they've moved on: the card says how the hole ended
  else {
    if ((T.sk || 0) > (b.sk || 0)) return refund('void'); // they ran out of time instead of hitting
    if (T.strokes <= (b.ts || 0) || T.busy) return null; // not hit yet, or the ball is still moving
    const clean = T.strokes === (b.ts || 0) + 1,
      holed = clean && T.done && !T.picked && Math.hypot(T.x - ctx.pin.x, T.z - ctx.pin.z) < 0.6;
    yes = b.t === 'make' ? holed : clean && (holed || ctx.onGreen(T.x, T.z));
  }
  const winner = (yes ? 1 : 0) === (b.side ?? 1) ? b.r[0] : b.r[1],
    loser = winner === b.r[0] ? b.r[1] : b.r[0];
  return { key, out: { pay: [[stay(winner) ? winner : loser, pot]], end: 1, note: yes ? 'yes' : 'no' } };
}

// ---- untrusted presence → well-formed data ---------------------------------------------------------------------
const TYPES = new Set<string>(['hole', 'ctp', 'skins', 'round', 'make', 'green']);
const str = (v: any, n = 80) => (typeof v === 'string' && v.length > 0 && v.length <= n && !/[\s<>"'&]/.test(v) ? v : '');
const int = (v: any, lo: number, hi: number) => {
  const x = Math.floor(+v);
  return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;
};
function cleanOffer(o: any): Offer | null {
  if (!o || typeof o !== 'object' || !TYPES.has(o.t)) return null;
  const by = str(o.by),
    a = int(o.a, 0, 1e9),
    h = int(o.h, 0, 17);
  if (!by || a < 1) return null;
  const out: Offer = { id: '', t: o.t, a, h, by };
  if (isLive(o.t)) {
    const on = str(o.on);
    if (!on) return null;
    out.on = on;
    out.ts = int(o.ts, 0, 99);
    out.sk = int(o.sk, 0, 9);
    out.side = o.side ? 1 : 0;
  }
  out.id = offerId(out);
  return out; // the id is always derived, never trusted
}
function cleanLocked(o: any): Locked | null {
  const b = cleanOffer(o);
  if (!b || !Array.isArray(o.r)) return null;
  const r = [...new Set((o.r as any[]).map(u => str(u)).filter(Boolean))].slice(0, 8);
  if (r.length < 2 || !r.includes(b.by)) return null;
  if (isLive(b.t)) {
    if (r.length !== 2 || r[0] !== b.by) return null;
    return { ...b, r, n: 1 };
  }
  return { ...b, r: r.sort(), n: int(o.n, 1, 18) };
}
function cleanOutcome(o: any): Outcome | null {
  if (!o || typeof o !== 'object' || !Array.isArray(o.pay)) return null;
  const pay: [string, number][] = [];
  for (const e of (o.pay as any[]).slice(0, 8)) {
    if (!Array.isArray(e)) return null;
    const u = str(e[0]),
      v = int(e[1], 0, 1e10);
    if (!u) return null;
    pay.push([u, v]);
  }
  return { pay, ...(o.end ? { end: 1 as const } : {}), ...(str(o.note, 12) ? { note: str(o.note, 12) } : {}) };
}
/** A peer's published betting state, made safe. `uid` is who published it: their offers are always theirs. */
export function cleanBetPres(v: any, uid: string): BetPres {
  const out: BetPres = { of: [], jn: [], ps: [], lk: [], out: {} };
  if (!v || typeof v !== 'object') return out;
  if (Array.isArray(v.of))
    for (const o of v.of.slice(0, 12)) {
      const c = cleanOffer({ ...o, by: uid });
      if (c) out.of.push(c);
    }
  if (Array.isArray(v.jn))
    out.jn = v.jn
      .slice(0, 40)
      .map((s: any) => str(s, 160))
      .filter(Boolean);
  if (Array.isArray(v.ps))
    out.ps = v.ps
      .slice(0, 40)
      .map((s: any) => str(s, 160))
      .filter(Boolean);
  if (Array.isArray(v.lk))
    for (const o of v.lk.slice(0, 24)) {
      const c = cleanLocked(o);
      if (c && c.r.includes(uid)) out.lk.push(c);
    }
  if (v.out && typeof v.out === 'object')
    for (const k of Object.keys(v.out).slice(0, 120)) {
      const key = str(k, 170),
        c = cleanOutcome(v.out[k]);
      if (key && c) out.out[key] = c;
    }
  if (Array.isArray(v.tp) && v.tp.length === 2) {
    const d = +v.tp[1];
    out.tp = [int(v.tp[0], 0, 17), isFinite(d) ? Math.min(2000, Math.max(-1, d)) : -1];
  }
  return out;
}
/** Does a published outcome make sense for this bet? (Never pays more than the pot, only to members.) */
export function outcomeFits(b: Locked, o: Outcome) {
  return o.pay.every(([u]) => b.r.includes(u)) && paid(o) <= potOf(b);
}
