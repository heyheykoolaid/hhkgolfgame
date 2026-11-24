// Golf betting, client side (design/golf-betting.md; the rules are shared/src/bets.ts).
// Runs on a timer (not the frame loop) so a backgrounded tab still locks its offers and settles its bets.
//
//   B        the bet menu (stake, offers, live shot bets, results)
//   Y / N    answer the offer at the top of the list
//
// Flow: an offer is open for up to 35 s (or until everyone on the hole has answered); nobody can tee off while a pot
// offer is open. The proposer locks it; every member then pays their stake out of their own wallet. One member (the
// lowest uid still here) publishes each result and everyone copies it. Leave before a bet settles and you forfeit it.
import { playSample } from '../audio/samples';
import {
  BET_NAME,
  OFFER_SECONDS,
  LIVE_SECONDS,
  ABSENT_GRACE,
  isLive,
  offerId,
  stakeOf,
  potOf,
  lockOffer,
  settle,
  outcomeFits,
  type BetType,
  type Offer,
  type Locked,
  type Outcome,
  type BetPres,
  type BetPlayer,
} from '@gh/shared';
import type { NetPlayer } from '../net/types';

export interface BetSeat {
  id: string;
  uid: string;
  name: string;
  color: string;
  me: boolean;
  p: NetPlayer;
}
export interface BetsHost {
  uid(): string;
  seats(): BetSeat[];
  on(): boolean; // betting is possible: a group round, not casual, connected
  hole(): number;
  holes(): number;
  par(): number;
  tour(): boolean;
  pin(): { x: number; z: number };
  onGreen(x: number, z: number): boolean;
  turnUid(): string | null; // whose shot it is (null: nobody's, or a ball is moving)
  publish(bt: BetPres | null): void;
  cash(): number;
  addCash(delta: number): void;
  toast(text: string, ms?: number): void;
  chime(good: boolean): void;
  screenOf(id: string): { x: number; y: number } | null;
}
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const CHIPS = [10, 50, 100, 500, 1000, 5000];
/** Tests on a very slow machine stretch every timer (window.__betSlow). */
const slow = () => +(window as any).__betSlow || 1;

export function createBets(host: BetsHost) {
  const el = document.createElement('div');
  el.id = 'gbets';
  el.className = 'hidden';
  document.body.appendChild(el);
  const sayEl = document.createElement('div');
  sayEl.id = 'gbsay';
  document.body.appendChild(sayEl);
  let sayT = 0;
  /** A small line under the turn banner (the big centre toast is kept for wins). */
  function say(text: string, ms = 2000) {
    sayEl.textContent = text;
    sayEl.classList.add('show');
    clearTimeout(sayT);
    sayT = setTimeout(() => sayEl.classList.remove('show'), ms) as any;
  }
  let hole = -1,
    nowS = 0,
    html = '',
    open = false,
    stake = 100,
    repeat = true,
    wasOn = false,
    lostSaid = false;
  let mine: (Offer & { at: number })[] = []; // my open offers
  const joined = new Set<string>(),
    passed = new Set<string>(),
    ever = new Set<string>();
  const book = new Map<string, Locked>(),
    paidIn = new Set<string>(),
    closed = new Set<string>();
  let outs: Record<string, Outcome> = {};
  const applied = new Set<string>();
  const seen = new Map<string, number>(),
    names = new Map<string, string>(),
    firstSaw = new Map<string, number>();
  const repMine = new Map<BetType, number>(),
    repJoin = new Set<string>(); // "same bets next hole"
  let tp: [number, number] | undefined,
    staked = 0,
    won = 0;
  let log: { t: string; cls: string }[] = [];
  let facts = new Map<string, BetPlayer>(),
    seatsNow: BetSeat[] = [],
    teedOff = false;
  const cache = new Map<string, BetSeat>(),
    around = () => 4 * slow();

  function reset() {
    hole = -1;
    mine = [];
    joined.clear();
    passed.clear();
    ever.clear();
    book.clear();
    paidIn.clear();
    closed.clear();
    outs = {};
    applied.clear();
    seen.clear();
    cache.clear();
    firstSaw.clear();
    repMine.clear();
    repJoin.clear();
    tp = undefined;
    staked = 0;
    won = 0;
    log = [];
    html = '';
    open = false;
    lostSaid = false;
    el.className = 'hidden';
    el.innerHTML = '';
    sayEl.classList.remove('show');
  }
  const me = () => host.uid();
  const nm = (u: string) => (u === me() ? 'You' : names.get(u) || 'Golfer');
  const left = () => host.holes() - host.hole(); // holes still to play, this one included
  const need = (o: { t: BetType; a: number; h: number }) => stakeOf(o, host.holes() - o.h);
  /** Offers on the table right now: mine, and everyone else's on this hole. */
  function offers(): Offer[] {
    const out: Offer[] = mine.map(({ at: _at, ...o }) => o);
    for (const s of seatsNow) if (!s.me && (s.p.h || 0) === hole) for (const o of s.p.bt?.of || []) if (o.h === hole && valid(o)) out.push(o);
    return out;
  }
  /** Can this offer still be taken? Pot bets close at the first tee shot; a live bet closes when its shot starts. */
  function valid(o: Offer) {
    if (isLive(o.t)) {
      const T = facts.get(o.on || '');
      return !!T && T.here && T.h === o.h && T.strokes === o.ts && !T.busy && T.sk === (o.sk || 0) && !T.done;
    }
    if (teedOff) return false;
    if (o.t === 'ctp') return host.par() === 3;
    if (o.t === 'skins' || o.t === 'round') return host.tour() && host.holes() - o.h >= 2;
    return true;
  }
  const held = () =>
    mine.reduce((t, o) => t + need(o), 0) +
    offers()
      .filter(o => o.by !== me() && joined.has(o.id) && !book.has(o.id))
      .reduce((t, o) => t + need(o), 0);
  const avail = () => Math.max(0, host.cash() - held());
  const pending = () => offers().filter(o => o.by !== me() && !joined.has(o.id) && !passed.has(o.id) && !book.has(o.id) && !closed.has(o.id));

  function describe(o: Offer) {
    if (!isLive(o.t)) return `${BET_NAME[o.t]} · ${money(o.a)}${o.t === 'skins' ? ' a hole' : ''}`;
    const mine2 = o.on === me(),
      verb =
        o.t === 'make'
          ? o.side
            ? mine2
              ? 'hole it'
              : 'holes it'
            : mine2
              ? 'miss'
              : 'misses'
          : o.side
            ? mine2
              ? 'hit the green'
              : 'hits the green'
            : mine2
              ? 'miss the green'
              : 'misses the green';
    return `${money(o.a)} says ${mine2 ? 'you' : nm(o.on || '')} ${verb}`;
  }
  function offer(t: BetType, a: number, live?: { on: string; side: 0 | 1 }) {
    if (!host.on() || seatsNow.filter(s => (s.p.h || 0) === hole).length < 2) return say('Betting needs another player.', 1500);
    a = Math.floor(a);
    if (!(a >= 1)) return;
    const T = live ? facts.get(live.on) : undefined;
    const o = { t, a, h: hole, by: me(), ...(live ? { on: live.on, side: live.side, ts: T?.strokes || 0, sk: T?.sk || 0 } : {}) } as Offer;
    o.id = offerId(o);
    if (!valid(o)) return say(isLive(t) ? 'Too late for that one.' : teedOff ? 'Bets on this hole are closed.' : 'Not available on this hole.', 1500);
    if (mine.some(x => x.id === o.id) || book.has(o.id) || closed.has(o.id)) return;
    if (need(o) > avail()) return say(`You only have ${money(avail())} free to bet.`, 1800);
    mine.push({ ...o, at: performance.now() / 1000 });
    if (t === 'hole' || t === 'ctp') repMine.set(t, a);
  }
  function join(o: Offer, auto = false) {
    if (need(o) > avail()) {
      if (!auto) say(`You need ${money(need(o))} free for that.`, 1800);
      return;
    }
    joined.add(o.id);
    ever.add(o.id);
    if (!isLive(o.t)) repJoin.add(`${o.by}.${o.t}.${o.a}`);
  }
  function pass(o: Offer) {
    passed.add(o.id);
    repJoin.delete(`${o.by}.${o.t}.${o.a}`);
  }

  function note(t: string, cls = '') {
    if (cls === 'win') playSample('win', 0.5);
    else if (cls === 'lose') playSample('lose', 0.4);
    log.unshift({ t, cls });
    if (log.length > 30) log.pop();
  }
  function float(uid: string, text: string, cls: string) {
    const s = seatsNow.find(x => x.uid === uid),
      at = s ? host.screenOf(s.id) : null;
    if (!at) return;
    const f = document.createElement('div');
    f.className = 'gbfloat ' + cls;
    f.textContent = text;
    f.style.left = at.x + 'px';
    f.style.top = at.y + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 2600);
  }

  function tick() {
    nowS = performance.now() / 1000;
    const on = host.on();
    if (!on) {
      // offline with money down: from everyone else's side I've left, so those stakes are theirs. Say so once.
      if (wasOn && book.size && !lostSaid) {
        lostSaid = true;
        host.toast('Connection lost: your open bets are forfeited.', 4000);
      }
      if (el.className !== 'hidden') {
        el.className = 'hidden';
        html = '';
      }
      return;
    }
    wasOn = true;
    const live = host.seats(),
      my = me(),
      h = host.hole(),
      n = host.holes();
    // ---- what I know about everyone. Presence can blip, so offers and answers work from everyone seen in the last
    // few seconds (seatsNow); settling a bet needs a player to be here right now, or gone for good (facts).
    facts = new Map();
    for (const s of live) {
      seen.set(s.uid, nowS);
      names.set(s.uid, s.name);
      cache.set(s.uid, s);
      const p = s.p;
      facts.set(s.uid, {
        uid: s.uid,
        here: true,
        gone: false,
        h: s.me ? h : p.h || 0,
        done: p.done,
        busy: p.busy,
        picked: !!p.picked,
        strokes: p.strokes,
        sk: p.sk || 0,
        card: p.card || [],
        x: p.ballX,
        z: p.ballZ,
        tp: s.me ? tp : p.bt?.tp,
      });
    }
    seatsNow = [...cache.values()].filter(s => nowS - (seen.get(s.uid) || 0) < around());
    for (const [u, t] of seen)
      if (!facts.has(u))
        facts.set(u, {
          uid: u,
          here: false,
          gone: nowS - t > ABSENT_GRACE * slow(),
          h: 0,
          done: false,
          busy: false,
          picked: false,
          strokes: 0,
          sk: 0,
          card: [],
          x: 0,
          z: 0,
        });
    const meF = facts.get(my);
    if (!meF) return;
    // ---- a new hole: last hole's offers are gone; repeat the usual ones
    if (h !== hole) {
      hole = h;
      mine = [];
      joined.clear();
      passed.clear();
      firstSaw.clear();
      teedOff = false;
      if (repeat && seatsNow.length > 1)
        for (const [t, a] of repMine)
          if (t === 'hole' || (t === 'ctp' && host.par() === 3)) {
            const o = { t, a, h, by: my } as Offer;
            o.id = offerId(o);
            if (need(o) <= avail()) mine.push({ ...o, at: nowS });
          }
    }
    teedOff = seatsNow.some(
      s => (s.me ? h : s.p.h || 0) === h && (s.p.strokes - (s.p.sk || 0) > 0 || s.p.busy),
    ); /* a real shot, not a shot-clock penalty */
    // my tee shot, measured when it stops (closest to the pin). A penalty or re-tee doesn't count.
    if ((!tp || tp[0] !== h) && !meF.busy) {
      const shots = meF.strokes - meF.sk,
        mp = seatsNow.find(s => s.me)!.p;
      if (shots === 1 && (!mp.teed || meF.done)) {
        const pin = host.pin();
        tp = [h, +Math.hypot(meF.x - pin.x, meF.z - pin.z).toFixed(2)];
      } else if (shots >= 1) tp = [h, -1];
    }
    const others = seatsNow.filter(s => !s.me && (s.p.h || 0) === h);
    // ---- my offers: lock them, or let them lapse
    for (const o of mine.slice()) {
      const js = others.filter(s => s.p.bt?.jn.includes(o.id)).map(s => s.uid);
      let lock = false,
        drop = false;
      if (isLive(o.t)) {
        if (!valid(o)) drop = true;
        else if (js.length) lock = true;
        else if (nowS - o.at > LIVE_SECONDS * slow()) drop = true;
      } else {
        const answered = others.length > 0 && others.every(s => s.p.bt?.jn.includes(o.id) || s.p.bt?.ps.includes(o.id));
        if (teedOff || answered || nowS - o.at > OFFER_SECONDS * slow()) lock = true;
      }
      if (!lock && !drop) continue;
      mine = mine.filter(x => x.id !== o.id);
      const { at: _at, ...plain } = o,
        lk = lock ? lockOffer(plain, js, n) : null;
      if (lk) {
        book.set(lk.id, lk);
        ever.add(lk.id);
      } else if (!isLive(o.t)) say(`No takers: ${BET_NAME[o.t]} ${money(o.a)}.`, 1600);
    }
    // ---- bets other people locked with me in them (from the proposer, or echoed by any member)
    for (const s of seatsNow)
      if (!s.me)
        for (const lk of s.p.bt?.lk || [])
          if (lk.r.includes(my) && lk.by !== my && ever.has(lk.id) && !book.has(lk.id) && !closed.has(lk.id)) book.set(lk.id, lk);
    // ---- pay my stake into every bet I'm newly in
    for (const b of book.values())
      if (!paidIn.has(b.id)) {
        paidIn.add(b.id);
        const st = stakeOf(b, b.n);
        host.addCash(-st);
        staked += st;
        say(isLive(b.t) ? `Bet on: ${describe(b)}` : `You're in: ${BET_NAME[b.t]} · pot ${money(potOf(b))}`, 2200);
        host.chime(true);
        note(`${isLive(b.t) ? describe(b) : BET_NAME[b.t]}: in for ${money(st)}`);
      }
    // ---- answers: forget joins whose offer has gone; rejoin the usual ones
    const table = offers();
    for (const o of table) if (!firstSaw.has(o.id)) firstSaw.set(o.id, nowS);
    for (const id of [...joined]) if (!book.has(id) && !table.some(o => o.id === id)) joined.delete(id);
    if (repeat) for (const o of pending()) if (!isLive(o.t) && repJoin.has(`${o.by}.${o.t}.${o.a}`)) join(o, true);
    // ---- results: copy anything a fellow member has published…
    for (const s of seatsNow)
      if (!s.me)
        for (const k of Object.keys(s.p.bt?.out || {})) {
          if (outs[k]) continue;
          const b = book.get(k.split('@')[0]),
            oc = s.p.bt!.out[k];
          if (b && b.r.includes(s.uid) && outcomeFits(b, oc)) outs[k] = oc;
        }
    // …and if I'm the lowest uid still here in a bet, I'm the one who works its result out
    for (const b of book.values()) {
      const here = b.r.filter(u => facts.get(u)?.here).sort();
      if (here[0] !== my) continue;
      let hh = b.h;
      if (b.t === 'skins') {
        hh = -1;
        for (let i = b.h; i < b.h + b.n; i++)
          if (!outs[`${b.id}@${i}`]) {
            hh = i;
            break;
          }
        if (hh < 0) continue;
      }
      const r = settle(b, facts, { holes: n, pin: host.pin(), onGreen: host.onGreen }, outs, hh);
      if (r && !outs[r.key]) outs[r.key] = r.out;
    }
    // ---- apply each result once: my share into my wallet
    for (const k of Object.keys(outs)) {
      if (applied.has(k)) continue;
      applied.add(k);
      const b = book.get(k.split('@')[0]);
      if (!b) continue;
      const oc = outs[k],
        pay = oc.pay.find(([u]) => u === my)?.[1] || 0,
        label = isLive(b.t) ? describe(b) : BET_NAME[b.t],
        total = oc.pay.reduce((t, [, v]) => t + v, 0);
      if (pay > 0) {
        host.addCash(pay);
        won += pay;
      }
      const others2 = oc.pay.filter(([u, v]) => u !== my && v > 0).map(([u]) => nm(u));
      if (oc.note === 'void') {
        say('Bet off: stakes returned.', 2200);
        note(`${label}: called off, ${money(pay)} back`);
      } else if (!oc.pay.length) {
        say(`Skins: tied. ${money(b.a * b.r.length)} carries over.`, 2200);
        note(`Skins hole ${+k.split('@')[1] + 1}: tied, carries`);
      } else if (pay > 0) {
        const solo = oc.pay.length === 1;
        host.toast(`+${money(pay)} · ${label}${solo ? '' : ' (split)'}${oc.note === 'left' ? ' · they left' : ''}`, 3000);
        host.chime(true);
        note(`${label}: +${money(pay)}`, 'win');
      } else {
        say(`${label}: ${others2.join(' & ') || 'nobody'} take${others2.length === 1 ? 's' : ''} ${money(total)}`, 3200);
        host.chime(false);
        note(`${label}: ${others2.join(' & ')} won ${money(total)}`, 'lose');
      }
      for (const [u, v] of oc.pay) if (v > 0) float(u, '+' + money(v), 'win');
      if (oc.end) {
        closed.add(b.id);
        book.delete(b.id);
        joined.delete(b.id);
      }
    }
    host.publish({ of: mine.map(({ at: _at, ...o }) => o), jn: [...joined], ps: [...passed], lk: [...book.values()], out: outs, tp });
    render();
  }
  setInterval(tick, 250);

  // ---- the panel
  function render() {
    const my = me(),
      table = offers(),
      pend = pending(),
      T = host.turnUid(),
      cash = host.cash(),
      free = avail();
    const canPot = !teedOff && seatsNow.filter(s => (s.me ? hole : s.p.h || 0) === hole).length > 1;
    let h = `<div class="gb-head" data-toggle><b>Bets</b><span>${money(cash)}${free < cash ? ` · ${money(free)} free` : ''}</span><kbd>B</kbd></div>`;
    // offers waiting for my answer
    pend.forEach((o, i) => {
      const lf = Math.max(0, Math.ceil((isLive(o.t) ? LIVE_SECONDS * slow() : OFFER_SECONDS * slow()) - (nowS - (firstSaw.get(o.id) || nowS))));
      h += `<div class="gb-offer"><div><i>${esc(nm(o.by))}</i> ${esc(describe(o))}${o.t === 'skins' ? ` <em>(${money(need(o))} for ${left()} holes)</em>` : o.t === 'round' ? ` <em>(${left()} holes)</em>` : ''}</div>
        <div class="gb-btns"><button data-join="${esc(o.id)}" class="yes">${isLive(o.t) ? 'Take it' : "I'm in"}${i === 0 ? ' <kbd>Y</kbd>' : ''}</button><button data-pass="${esc(o.id)}">Pass${i === 0 ? ' <kbd>N</kbd>' : ''}</button><span class="t">${lf}s</span></div></div>`;
    });
    // my own open offers, and ones I've answered
    for (const o of table) {
      if (o.by === my)
        h += `<div class="gb-line wait"><span>${esc(describe(o))}</span><em>waiting…</em><button data-cancel="${esc(o.id)}" title="Withdraw">✕</button></div>`;
      else if (joined.has(o.id) && !book.has(o.id))
        h += `<div class="gb-line wait"><span><i>${esc(nm(o.by))}</i> ${esc(describe(o))}</span><em>you're in…</em></div>`;
    }
    // bets in play
    for (const b of book.values()) {
      let carry = '';
      if (b.t === 'skins') {
        let pd = 0,
          played = 0;
        for (let i = b.h; i < b.h + b.n; i++) {
          const oc = outs[`${b.id}@${i}`];
          if (oc) {
            played++;
            pd += oc.pay.reduce((t, [, v]) => t + v, 0);
          }
        }
        const c = b.a * b.r.length * played - pd;
        carry = ` · ${money(b.a * b.r.length + c)} on this hole`;
      }
      h += `<div class="gb-line live"><span>${esc(isLive(b.t) ? describe(b) : BET_NAME[b.t])}</span><em>${isLive(b.t) ? `vs ${esc(nm(b.r.find(u => u !== my) || ''))}` : `pot ${money(potOf(b))}${carry} · ${b.r.length} in`}</em></div>`;
    }
    if (open) {
      h += `<div class="gb-stake"><span>Stake</span>${CHIPS.map(c => `<button data-stake="${c}" class="${c === stake ? 'on' : ''}" ${c > free ? 'disabled' : ''}>${c >= 1000 ? c / 1000 + 'K' : c}</button>`).join('')}<input type="number" min="1" step="1" value="${stake}" data-stakein></div>`;
      const pot = (t: BetType, label: string, sub = '') =>
        `<button data-offer="${t}" ${need({ t, a: stake, h: hole }) > free ? 'disabled' : ''}>${label}${sub ? `<em>${sub}</em>` : ''}</button>`;
      if (canPot) {
        h += `<div class="gb-sec">Offer for this hole</div><div class="gb-grid">${pot('hole', 'Hole winner', `${money(stake)} each`)}${host.par() === 3 ? pot('ctp', 'Closest to the pin', `${money(stake)} each`) : ''}`;
        if (host.tour() && left() >= 2)
          h += pot('skins', 'Skins', `${money(stake)} a hole × ${left()}`) + pot('round', 'Round winner', `${money(stake)} each · ${left()} holes`);
        h += '</div>';
      } else
        h += `<div class="gb-sec">${seatsNow.length < 2 ? 'Betting needs another player' : left() > 1 ? 'Hole bets are closed until the next tee' : 'Hole bets are closed'}</div>`;
      const Tf = T ? facts.get(T) : undefined;
      if (T && Tf && !Tf.busy && !Tf.done) {
        const who = T === my ? 'I' : esc(nm(T)),
          pin = host.pin(),
          d = Math.hypot(Tf.x - pin.x, Tf.z - pin.z),
          onG = host.onGreen(Tf.x, Tf.z),
          dis = stake > free ? 'disabled' : '';
        h += `<div class="gb-sec">This shot · ${money(stake)}</div><div class="gb-grid">`;
        if (d < 60)
          h += `<button data-live="make:1" ${dis}>${who} hole${T === my ? '' : 's'} it</button><button data-live="make:0" ${dis}>${who} miss${T === my ? '' : 'es'}</button>`;
        if (!onG && d < 270)
          h += `<button data-live="green:1" ${dis}>${who} hit${T === my ? '' : 's'} the green</button><button data-live="green:0" ${dis}>${who} miss${T === my ? '' : 'es'} the green</button>`;
        h += '</div>';
      }
      h += `<label class="gb-rep"><input type="checkbox" data-rep ${repeat ? 'checked' : ''}> Same hole bets on the next tee</label>`;
      if (log.length)
        h += `<div class="gb-sec">This round · ${won - staked >= 0 ? '+' : '−'}${money(Math.abs(won - staked))}${book.size ? ' so far' : ''}</div><div class="gb-log">${log
          .slice(0, 8)
          .map(l => `<div class="${l.cls}">${esc(l.t)}</div>`)
          .join('')}</div>`;
      h += `<div class="gb-foot">Leave before a bet settles and you forfeit it.</div>`;
    }
    const cls = `${open ? 'open' : ''}${pend.length ? ' ask' : ''}`;
    if (h !== html || el.className !== cls) {
      const inp = el.querySelector<HTMLInputElement>('[data-stakein]');
      if (inp && document.activeElement === inp && h !== html && open) {
        /* don't rebuild under the cursor */ if (el.className !== cls) el.className = cls;
        return;
      }
      html = h;
      el.innerHTML = h;
      el.className = cls;
    }
    const board = document.getElementById('board');
    if (board) {
      const top = Math.round(board.getBoundingClientRect().bottom + 10);
      el.style.top = top + 'px';
      el.style.maxHeight = `calc(100vh - ${top + 14}px)`;
    }
  }
  const find = (id: string) => offers().find(o => o.id === id);
  el.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-toggle],[data-join],[data-pass],[data-cancel],[data-stake],[data-offer],[data-live]',
    );
    if (!t) return;
    const d = t.dataset;
    if ('toggle' in d) toggle();
    else if (d.join) {
      const o = find(d.join);
      if (o) join(o);
    } else if (d.pass) {
      const o = find(d.pass);
      if (o) pass(o);
    } else if (d.cancel) {
      const o = mine.find(x => x.id === d.cancel);
      if (o) {
        mine = mine.filter(x => x !== o);
        repMine.delete(o.t);
      }
    } else if (d.stake) stake = +d.stake;
    else if (d.offer) offer(d.offer as BetType, stake);
    else if (d.live) {
      const [ty, side] = d.live.split(':'),
        T = host.turnUid();
      if (T) offer(ty as BetType, stake, { on: T, side: side === '1' ? 1 : 0 });
    }
    html = '';
    tick();
  });
  el.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if ('stakein' in t.dataset) {
      stake = Math.max(1, Math.floor(+t.value || 1));
      t.blur();
      html = '';
    }
    if ('rep' in t.dataset) repeat = t.checked;
  });
  function toggle() {
    open = !open;
    if (open && document.pointerLockElement) document.exitPointerLock();
    html = '';
    render();
  }
  /** B: the menu. Y / N: answer the first offer waiting. */
  function key(e: KeyboardEvent) {
    if (!host.on()) return false;
    if (e.code === 'KeyB') {
      toggle();
      return true;
    }
    const p = pending()[0];
    if (p && e.code === 'KeyY') {
      join(p);
      html = '';
      tick();
      return true;
    }
    if (p && e.code === 'KeyN') {
      pass(p);
      html = '';
      tick();
      return true;
    }
    return false;
  }
  /** Nobody tees off while a pot offer is open (they close within 35 s, sooner once everyone has answered). */
  function blocking() {
    if (!host.on() || teedOff) return false;
    return offers().some(o => !isLive(o.t) && nowS - (firstSaw.get(o.id) ?? nowS) < OFFER_SECONDS * slow() + 10);
  }
  /** Money I'd give up by leaving now. */
  const atRisk = () => [...book.values()].reduce((t, b) => t + stakeOf(b, b.n), 0);
  /** For the end card: how the bets went. */
  function cardHTML() {
    if (!staked && !book.size) return '';
    const net = won - staked,
      risk = atRisk();
    return `<div class="gb-card"><b>Bets ${risk ? `· ${money(risk)} still in play` : `· ${net >= 0 ? '+' : '−'}${money(Math.abs(net))}`}</b>${log
      .slice(0, 5)
      .map(l => `<span class="${l.cls}">${esc(l.t)}</span>`)
      .join('')}${risk ? '<em>Stay until everyone finishes to collect. Leaving forfeits these.</em>' : ''}</div>`;
  }
  return {
    tick,
    key,
    blocking,
    atRisk,
    cardHTML,
    reset,
    offer,
    debug: () => ({
      mine,
      joined: [...joined],
      passed: [...passed],
      book: [...book.values()],
      outs,
      tp,
      staked,
      won,
      teedOff,
      hole,
      log,
      pending: pending(),
      avail: avail(),
    }),
  };
}
