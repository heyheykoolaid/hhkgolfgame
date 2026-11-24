// Tournaments (a 3-hole mini cup or a 9-hole championship): the scorecards, the leaderboard and the card shown after
// each hole. Everything here is worked out from data handed in, with no game state of its own; golfMode.ts owns the
// tournament itself (loading holes, moving on, awarding the trophy).
import type { Cup, TourSize } from '@gh/shared';
import type { NetPlayer } from '../net/types';
import type { TrophyView } from '../world/trophy';

export interface Tour {
  teeOrder: string[];
  n: TourSize;
  seed: number;
  code: string;
  holes: number[];
  pars: number[];
  /** The hole being played (0-based). */
  h: number;
  cup: Cup;
  /** Strokes per hole for every player seen so far (by session id). */
  cards: Map<string, number[]>;
  who: Map<string, { name: string; color: string; me: boolean }>;
  /** When everyone on this hole had holed out (0 = not yet): the next hole starts a few seconds later. */
  allDoneAt: number;
  awarded: boolean;
  view: TrophyView | null;
  canvas: HTMLCanvasElement | null;
  /** The line engraved under the trophy on the final card. */
  sub?: string;
}
export interface TourRow {
  id: string;
  name: string;
  color: string;
  me: boolean;
  c: number[];
  st: number;
  toPar: number;
  thru: number;
  here: boolean;
}
const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** A score to par as golfers write it: E, +2, −1. */
export const toParText = (v: number) => (v === 0 ? 'E' : v > 0 ? '+' + v : '−' + -v);
const SCORE_CLS = (s: number, par: number) =>
  !s ? '' : s - par <= -2 ? 'eagle' : s - par === -1 ? 'birdie' : s - par === 1 ? 'bogey' : s - par >= 2 ? 'dbl' : '';

/** Scorecards: everyone's strokes per hole (from what we see happen, plus the card each peer publishes). */
export function trackCards(t: Tour, players: Map<string, NetPlayer>, myId: string) {
  for (const [id, p] of players) {
    const mine = id === myId;
    let c = t.cards.get(id);
    if (!c) {
      c = [];
      t.cards.set(id, c);
    }
    if (!mine && p.card)
      p.card.forEach((v, i) => {
        if (v > 0 && i < t.n) c![i] = v;
      });
    const hh = mine ? t.h : (p.h ?? t.h);
    if (p.done && hh < t.n && p.strokes > 0) c[hh] = p.strokes;
    t.who.set(id, { name: mine ? 'You' : p.name, color: p.color, me: mine });
  }
}
/** The leaderboard: everyone still here, plus anyone who finished every hole; by score to par. */
export function tourStandings(t: Tour, here: { has(id: string): boolean }): TourRow[] {
  return [...t.who.entries()]
    .map(([id, w]) => {
      const c = t.cards.get(id) || [];
      let st = 0,
        par = 0,
        thru = 0;
      for (let i = 0; i < t.n; i++)
        if (c[i] > 0) {
          st += c[i];
          par += t.pars[i];
          thru++;
        }
      return { id, ...w, c, st, toPar: st - par, thru, here: here.has(id) };
    })
    .filter(r => r.here || r.thru === t.n)
    .sort((a, b) => a.toPar - b.toPar || b.thru - a.thru);
}
/** Who we're still waiting on to finish the current hole (players behind on an earlier hole aren't waited for). */
export function tourWaiting(t: Tour, players: Map<string, NetPlayer>, myId: string) {
  const out: string[] = [];
  for (const [id, p] of players) {
    const mine = id === myId,
      hh = mine ? t.h : (p.h ?? t.h);
    if (hh === t.h && !p.done) out.push(mine ? 'You' : p.name);
  }
  return out;
}
/** Who takes the cup: the best total among those who finished every hole. Solo, you must beat (or match) par. */
export function tourWinners(t: Tour, rows: TourRow[]) {
  const done = rows.filter(r => r.thru === t.n),
    best = done.length ? done[0].toPar : 0,
    solo = done.length <= 1,
    winners = done.filter(r => r.toPar === best && (!solo || r.toPar <= 0));
  return { done, best, solo, winners, iWon: winners.some(r => r.me) };
}
/**
 * The card after a hole (or the final card): the HTML, and whether this is the final card.
 * o: wait = who's still playing this hole; secsLeft = countdown to the next hole; strokes/par/scoreName = my hole;
 * myName = for the trophy's engraving; extra = more HTML between the table and the buttons (the bets summary).
 */
export function tourCardHTML(
  t: Tour,
  rows: TourRow[],
  o: { wait: string[]; secsLeft: number; strokes: number; par: number; scoreName: string; myName: string; extra: string },
) {
  const last = t.h === t.n - 1,
    final = last && !o.wait.length,
    parTot = t.pars.reduce((a, b) => a + b, 0);
  const table = `<table class="card"><tr><th></th>${t.pars.map((_, i) => `<th class="${i === t.h ? 'cur' : ''}">${i + 1}</th>`).join('')}<th>Tot</th></tr>
    <tr class="par"><td>Par</td>${t.pars.map(p => `<td>${p}</td>`).join('')}<td>${parTot}</td></tr>
    ${rows.map(r => `<tr><td class="nm"><i style="background:${r.color}"></i>${esc(r.name)}</td>${t.pars.map((p, i) => `<td class="${SCORE_CLS(r.c[i], p)}">${r.c[i] || ''}</td>`).join('')}<td class="tot">${r.thru ? toParText(r.toPar) : '–'}</td></tr>`).join('')}</table>`;
  let head: string, foot: string;
  if (!final) {
    head = `<div class="cupname">${esc(t.cup.title)}</div><h2>${o.scoreName}</h2><p class="muted">Hole ${t.h + 1} of ${t.n} · ${o.strokes} strokes · par ${o.par}</p>`;
    foot = o.wait.length
      ? `<p class="muted">Waiting for ${o.wait.map(esc).join(', ')}…</p><div class="btns"><button id="gc-quit">Leave</button><button id="gc-walk" class="primary">Walk the course</button></div>`
      : last
        ? ''
        : `<div class="btns"><button id="gc-quit">Leave</button><button id="gc-next" class="primary">Hole ${t.h + 2} → (${Math.max(0, o.secsLeft)})</button></div>`;
  } else {
    const { best, solo, winners, iWon } = tourWinners(t, rows),
      who = winners.map(r => (r.me ? 'You' : r.name));
    head = `<div class="cupname">${esc(t.cup.title)}</div><h2>${iWon ? (winners.length > 1 ? 'Shared win!' : 'Champion!') : winners.length ? `${esc(who.join(' & '))} win${who.length > 1 || who[0] === 'You' ? '' : 's'}` : 'So close'}</h2>
      <p class="muted">${solo ? (iWon ? `${toParText(best)} · you beat the course` : `${toParText(best)} · finish at par or better to take the cup`) : `${toParText(best)} over ${t.n} holes`}</p>
      ${winners.length ? '<canvas id="gc-trophy" width="220" height="220"></canvas>' : ''}`;
    foot = `${iWon ? '<p class="muted">The trophy is in your trophy case.</p>' : ''}<div class="btns"><button id="gc-walk">Walk the course</button><button id="gc-lobby" class="primary">Back to the lobby</button></div>`;
    t.sub = winners.length ? `${winners.map(r => (r.me ? o.myName : r.name)).join(' & ')} · ${toParText(best)}` : '';
  }
  return { html: `${head}${table}${o.extra}${foot}`, final };
}
