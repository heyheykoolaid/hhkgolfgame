// Turns in a group round (design/multiplayer-turns.md), client side. Movement is always free; only hitting waits for
// your turn. Every client works out whose turn it is from the same shared facts (shared/src/turns.ts), so they agree
// without a server. Your own client applies your penalty when your shot clock runs out; the check runs on a timer as
// well as every frame, so a backgrounded tab still passes the turn.
import { turnOf, groupStrokes, TURN_SECONDS, TURN_WARN, TURN_GRACE, type Turn, type TurnPlayer } from '@gh/shared';
import type { NetPlayer } from '../net/types';

export interface TurnsHost {
  active(): boolean; // a round is on screen
  group(): boolean; // it's a group round
  endShown(): boolean; // the end card is up (no banner over it)
  sessionId(): string;
  uid(): string;
  players(): Map<string, NetPlayer>;
  me(): NetPlayer | undefined;
  /** Tournaments: this player is on a different hole from me, so they aren't in this hole's order. */
  elsewhere(id: string, p: NetPlayer): boolean;
  /** Their shot is still playing back on my screen. */
  playingBack(id: string): boolean;
  pin(): { x: number; z: number };
  /** The tee order for this hole if the tournament has set one (last place first); otherwise the group list is used. */
  teeOrder(): string[] | null;
  hole(): number;
  /** A bet offer is open: the shot clock waits. */
  clockHeld(): boolean;
  /** I'm in the middle of a swing or watching my shot: never time out now. */
  midShot(): boolean;
  penalize(groupStrokes: number): void;
  toast(text: string, ms?: number): void;
  chime(vol: number): void;
}
const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function createTurns(host: TurnsHost) {
  let turn: Turn = { id: null, phase: 'done' },
    key = '',
    t0 = 0,
    on = false,
    casual = false,
    listOrder: string[] = [];
  function players(): TurnPlayer[] {
    const out: TurnPlayer[] = [],
      mine = host.sessionId();
    for (const [id, p] of host.players()) {
      if (id !== mine && host.elsewhere(id, p)) continue;
      out.push({
        id,
        uid: id === mine ? host.uid() : p.uid,
        strokes: p.strokes,
        done: p.done,
        busy: p.busy || (!document.hidden && host.playingBack(id)) /* a hidden tab can't play shots back: trust the shooter's flag */,
        teed: p.teed,
        x: p.ballX,
        z: p.ballZ,
        sk: p.sk || 0,
        skAt: p.skAt || 0,
      });
    }
    return out;
  }
  function update() {
    on = host.active() && host.group() && !casual && host.players().size > 1;
    if (!on) {
      turn = { id: null, phase: 'done' };
      return;
    }
    const ps = players();
    turn = turnOf(ps, host.pin(), host.teeOrder() || listOrder);
    const k = `${turn.id}|${turn.phase}|${groupStrokes(ps)}|${host.hole()}`;
    if (host.clockHeld()) t0 = performance.now();
    if (k !== key) {
      key = k;
      t0 = performance.now();
      if (turn.id === host.sessionId() && turn.phase !== 'flight') host.chime(0.25); /* the banner says it; a chime is enough */
    }
  }
  const left = () => TURN_SECONDS - (performance.now() - t0) / 1000;
  function checkTimeout() {
    if (!host.active()) return;
    update();
    if (!on || turn.id !== host.sessionId() || turn.phase === 'flight' || turn.phase === 'done') return;
    if (left() > -TURN_GRACE || host.midShot()) return;
    host.penalize(groupStrokes(players()));
    key = '';
    host.toast(host.me()?.picked ? 'Out of time a third time: ball picked up.' : 'Out of time: penalty stroke. The turn passes.', 2800);
    host.chime(0.6);
  }
  setInterval(checkTimeout, 500);

  const ban = document.createElement('div');
  ban.id = 'turnban';
  ban.style.display = 'none';
  document.body.appendChild(ban);
  let banHTML = '';
  function show(h: string) {
    if (banHTML === h) return;
    banHTML = h;
    ban.innerHTML = h;
    ban.style.display = h ? '' : 'none';
  }
  function renderUI() {
    let h = '';
    if (host.active() && on && !host.endShown()) {
      if (turn.phase === 'flight') h = '<span class="w">Ball in the air…</span>';
      else if (turn.id) {
        const l = left(),
          mine = turn.id === host.sessionId(),
          p = host.players().get(turn.id),
          cls = l < 0 ? 'late' : l < TURN_WARN ? 'warn' : '';
        const t = l < 0 ? (mine ? 'Hurry up!' : 'hurry up…') : `${Math.ceil(l)}s`;
        h = mine
          ? `<b class="you">YOUR TURN</b><span class="t ${cls}">${t}</span>`
          : `<span class="w">Waiting for <i style="color:${p?.color || '#fff'}">${esc(p?.name || 'Golfer')}</i></span><span class="t ${cls}">${t}</span>`;
      }
    }
    show(h);
  }
  return {
    /** Whose turn it is right now (id = a session id, or null). */
    get turn() {
      return turn;
    },
    /** Turns are in force (a group round with more than one player, not casual). */
    get on() {
      return on;
    },
    get casual() {
      return casual;
    },
    /** The group's order as the host started it (uids). */
    get listOrder() {
      return listOrder;
    },
    /** May I hit now? */
    mine: () => !on || turn.id === host.sessionId(),
    /** A new round. */
    begin(isCasual: boolean, order: string[]) {
      casual = isCasual;
      listOrder = order.slice();
      key = '';
      turn = { id: null, phase: 'done' };
    },
    /** A new hole: restart the shot clock. */
    reset() {
      key = '';
    },
    update,
    renderUI,
    hideUI: () => show(''),
  };
}
