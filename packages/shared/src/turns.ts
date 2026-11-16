// Turn-based group golf (design/multiplayer-turns.md). Movement is always free; only hitting is turn-gated.
// There's no server on the published page, so every client works out whose turn it is from the same shared facts
// (ball positions, strokes, skips) with this pure function, and they all agree.
//
// Order:  tee shots — hole 1: the group's list order; later holes: last place first (ties keep last hole's order).
//         then — farthest from the hole plays next.
// Skips:  the shot timer running out = a penalty stroke and the turn passes on (that player waits until someone else
//         has hit). The 3rd skip on a hole picks their ball up.

export interface TurnPlayer {
  id: string; // session id
  uid: string; // account id (for order)
  strokes: number;
  done: boolean;
  busy: boolean;
  teed: boolean;
  x: number;
  z: number; // ball
  sk: number; // skips on this hole
  skAt: number; // group stroke total right after their last skip (they sit out until it changes)
}
export type TurnPhase = 'flight' | 'tee' | 'play' | 'done';
export interface Turn {
  id: string | null;
  phase: TurnPhase;
}

export const TURN_SECONDS = 50,
  TURN_WARN = 15,
  TURN_GRACE = 8,
  MAX_SKIPS = 3;

/** Sum of everyone's strokes (penalties included): changes whenever anybody hits or is penalised. */
export const groupStrokes = (ps: TurnPlayer[]) => ps.reduce((t, p) => t + p.strokes, 0);

/** Whose turn it is. teeOrder: uids in tee-off order (anyone missing goes last, by uid). */
export function turnOf(ps: TurnPlayer[], pin: { x: number; z: number }, teeOrder: string[]): Turn {
  if (ps.some(p => p.busy)) return { id: null, phase: 'flight' }; // wait for the ball in the air to stop
  const active = ps.filter(p => !p.done);
  if (!active.length) return { id: null, phase: 'done' };
  const gs = groupStrokes(ps);
  let elig = active.filter(p => !(p.sk > 0 && p.skAt === gs));
  if (!elig.length) elig = active;
  const rank = (p: TurnPlayer) => {
    const i = teeOrder.indexOf(p.uid);
    return i < 0 ? 1e6 : i;
  };
  const byOrder = (a: TurnPlayer, b: TurnPlayer) => rank(a) - rank(b) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
  const onTee = elig.filter(p => p.teed);
  if (onTee.length) return { id: onTee.sort(byOrder)[0].id, phase: 'tee' };
  const d = (p: TurnPlayer) => Math.hypot(p.x - pin.x, p.z - pin.z);
  const far = elig.slice().sort((a, b) => d(b) - d(a) || byOrder(a, b))[0];
  return { id: far.id, phase: 'play' };
}

/** Tee order for a hole. Hole 1 (no scores yet): the group list. Later: worst total to par first; ties keep the
 *  previous hole's order. scores: uid → total to par so far. */
export function teeOrderFor(listOrder: string[], prevOrder: string[] | null, scores: Map<string, number> | null): string[] {
  if (!prevOrder || !scores) return listOrder.slice();
  const prev = (u: string) => {
    const i = prevOrder.indexOf(u);
    return i < 0 ? 1e6 + listOrder.indexOf(u) : i;
  };
  const all = [...new Set([...prevOrder, ...listOrder])];
  return all.sort((a, b) => (scores.get(b) ?? -1e9) - (scores.get(a) ?? -1e9) || prev(a) - prev(b));
}
