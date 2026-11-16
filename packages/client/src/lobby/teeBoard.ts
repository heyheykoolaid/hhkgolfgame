// The tee board (lobby): choose a hole or a tournament, play solo, or queue up for a group round. The first player in
// the queue is the host and starts the round; everyone else in the group follows when they see the host's start.
import {
  useHole,
  codeSeed,
  matchIdFor,
  randomHoleSeed,
  HOLE_LEN,
  tournamentIdFor,
  randomTourSeed,
  cupFor,
  tournamentHoles,
  holeIdea,
  type TourSize,
} from '@gh/shared';
import { trophyImage } from '../world/trophy';
import { colorFor } from '../avatar/colors';

export const GROUP_MAX = 4;
export interface TeePeer {
  by: string;
  q?: number;
  away: boolean;
  go?: { id: string; at: number; m: string[] } | null;
}
export interface TeeHost {
  uid(): string;
  online(): boolean;
  nameOf(uid: string, fallback?: string): string;
  q(): number;
  setQ(at: number): void; // my place in the queue (0 = not queued); publishes it
  setGo(go: { id: string; at: number; m: string[] }): void; // host: announce the start to the group
  peers(): TeePeer[];
  openModal(title: string, html: string): void;
  closeModal(): void;
  toast(html: string, ms?: number): void;
  start(matchId: string, group: boolean, order: string[]): void; // leave the lobby for the round
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

import { LOCALES, withLocale, type LocaleId } from '../world/locale';

/** A small painted postcard of each course, for the tee board's cards. */
const pics = new Map<string, string>();
function localePic(id: LocaleId) {
  let u = pics.get(id);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const x = c.getContext('2d')!,
    sky = x.createLinearGradient(0, 0, 0, 120),
    peak = id === 'peak';
  sky.addColorStop(0, peak ? '#8fb0c8' : '#c9a98c');
  sky.addColorStop(1, peak ? '#f2d7b0' : '#f6cf8e');
  x.fillStyle = sky;
  x.fillRect(0, 0, 320, 180);
  x.fillStyle = '#fff3cf';
  x.beginPath();
  x.arc(peak ? 250 : 236, peak ? 66 : 84, 15, 0, 7);
  x.fill();
  let sd = peak ? 11 : 5;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  if (peak) {
    // two ranges of snow peaks
    for (const [base, hi, col] of [
      [116, 78, '#7f8794'],
      [128, 54, '#646c70'],
    ] as [number, number, string][]) {
      for (let i = 0; i < 6; i++) {
        const px = -20 + i * 68 + r() * 30,
          h = hi * (0.7 + r() * 0.5),
          w = 60 + r() * 30;
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(px - w, base);
        x.lineTo(px, base - h);
        x.lineTo(px + w, base);
        x.fill();
        x.fillStyle = '#f4f1ea';
        x.beginPath();
        x.moveTo(px - w * 0.3, base - h * 0.7);
        x.lineTo(px, base - h);
        x.lineTo(px + w * 0.3, base - h * 0.7);
        x.lineTo(px + w * 0.12, base - h * 0.62);
        x.lineTo(px, base - h * 0.72);
        x.lineTo(px - w * 0.14, base - h * 0.6);
        x.fill();
      }
    }
  } else {
    // the city on the horizon
    for (let i = 0; i < 26; i++) {
      const w = 8 + r() * 10,
        h = 18 + r() * 46;
      x.fillStyle = `rgba(${170 + r() * 30},${130 + r() * 25},${95 + r() * 20},.9)`;
      x.fillRect(i * 12.5 + r() * 4, 118 - h, w, h);
    }
  }
  // rolling ground and a ribbon of fairway to a flag
  x.fillStyle = peak ? '#4b6b44' : '#61793a';
  x.beginPath();
  x.moveTo(0, 122);
  x.bezierCurveTo(80, 104, 200, 132, 320, 112);
  x.lineTo(320, 180);
  x.lineTo(0, 180);
  x.fill();
  x.fillStyle = peak ? '#6d9a56' : '#86a24c';
  x.beginPath();
  x.moveTo(110, 180);
  x.bezierCurveTo(150, 150, 120, 134, 190, 124);
  x.bezierCurveTo(215, 128, 205, 150, 230, 180);
  x.fill();
  x.fillStyle = '#f1eee6';
  x.fillRect(188, 100, 1.6, 24);
  x.fillStyle = '#e2574c';
  x.beginPath();
  x.moveTo(190, 100);
  x.lineTo(203, 104);
  x.lineTo(190, 108);
  x.fill();
  // trees: pines, or oaks and a palm
  for (let i = 0; i < 9; i++) {
    const tx = i < 5 ? 8 + i * 22 + r() * 8 : 232 + (i - 5) * 22 + r() * 8,
      ty = 128 + r() * 34,
      s = 0.7 + (ty - 128) / 40;
    if (peak) {
      x.fillStyle = '#2f4a2c';
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.moveTo(tx - (11 - k * 3) * s, ty - k * 9 * s);
        x.lineTo(tx, ty - (20 + k * 9) * s);
        x.lineTo(tx + (11 - k * 3) * s, ty - k * 9 * s);
        x.fill();
      }
      x.fillStyle = '#4a3a2a';
      x.fillRect(tx - 1.2 * s, ty, 2.4 * s, 5 * s);
    } else {
      x.fillStyle = '#4a3a2a';
      x.fillRect(tx - 1.5 * s, ty - 8 * s, 3 * s, 10 * s);
      x.fillStyle = '#4f6a30';
      x.beginPath();
      x.ellipse(tx, ty - 14 * s, 15 * s, 9 * s, 0, 0, 7);
      x.fill();
    }
  }
  if (peak) {
    // a couple of boulders
    x.fillStyle = '#8f8a82';
    for (const [bx, by, bs] of [
      [70, 160, 13],
      [262, 166, 10],
      [96, 168, 7],
    ]) {
      x.beginPath();
      x.ellipse(bx, by, bs, bs * 0.7, 0, 0, 7);
      x.fill();
    }
  }
  pics.set(id, (u = c.toDataURL('image/jpeg', 0.85)));
  return u;
}

export function createTeeBoard(host: TeeHost) {
  let teeOpen = false,
    teeHTML = '',
    started = '';
  // which hole: Hole 1, a fresh random layout each round, or a specific hole code (replay one you liked)
  let teeHole: 'rand' | 'code' = 'rand',
    teeLoc: LocaleId = 'hills',
    teeCode = '',
    codeInfo = '';
  // format: one hole, or a tournament (a mini cup of 3 holes or a 9-hole championship) with its own cup and trophy
  let teeFmt: 'one' | 3 | 9 = 'one',
    tourSeed = randomTourSeed(),
    teeCasual = false;
  const trophyPics = new Map<string, string>();
  const trophyPic = (seed: number, n: TourSize, sub = '', px = 160) => {
    const k = `${seed}:${n}:${sub}:${px}`;
    let u = trophyPics.get(k);
    if (!u) {
      u = trophyImage(seed, n, sub, px);
      trophyPics.set(k, u);
    }
    return u;
  };
  function cupPreview(n: TourSize) {
    const cup = cupFor(tourSeed, n),
      par = tournamentHoles(tourSeed, n).reduce((t, x) => t + holeIdea(x).par, 0);
    return `<div class="cupprev"><img src="${trophyPic(tourSeed, n)}" alt=""><div><div class="cupname">${esc(cup.title)}</div><div class="muted">${n} holes · par ${par} · winner takes the trophy${n === 3 ? '' : ' home'}</div>
      <p class="muted" style="margin:6px 0 0">${n === 3 ? 'A quick three-hole cup.' : 'A full nine-hole championship.'} Lowest total wins; playing solo, finish at par or better to take it.</p><button id="t-reroll" class="mini">🎲 Another cup</button></div></div>`;
  }
  function describeCode(code: string) {
    const c = code
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .slice(0, 5);
    if (c.length < 5) return '';
    const h = useHole(codeSeed(c) || 1, teeLoc);
    const kind = h.plan?.kind ? ' · ' + h.plan.kind[0].toUpperCase() + h.plan.kind.slice(1) : '';
    return `${h.name} · par ${h.par}${kind} · ${Math.round(HOLE_LEN * 1.0936)} yd${h.pond ? (teeLoc === 'peak' ? ' · ravine' : ' · water') : ''}`;
  }
  /** The match id for the chosen hole (the hole travels inside the id, so everyone in the group gets the same one). */
  function teeMatchId() {
    if (teeFmt !== 'one') {
      const id = tournamentIdFor(teeFmt, tourSeed, newId());
      tourSeed = randomTourSeed();
      return withLocale(id, teeLoc);
    }
    const seed = teeHole === 'rand' ? randomHoleSeed() : codeSeed(teeCode) || 1;
    return withLocale(matchIdFor(seed, newId()), teeLoc);
  }
  const queue = () => {
    const q: { uid: string; at: number; name: string; me: boolean; color: string }[] = [];
    const mine = host.q();
    if (mine) q.push({ uid: host.uid(), at: mine, name: 'You', me: true, color: colorFor(host.uid()) });
    for (const r of host.peers()) if (r.q && !r.away) q.push({ uid: r.by, at: r.q, name: host.nameOf(r.by), me: false, color: colorFor(r.by) });
    return q.sort((a, b) => a.at - b.at || (a.uid < b.uid ? -1 : 1));
  };
  function openTee() {
    teeOpen = true;
    teeHTML = '';
    host.openModal('Tee times', '<div id="tee-body"></div>');
    renderTee();
  }
  function renderTee() {
    if (!teeOpen) return;
    const q = queue(),
      first = q[0],
      amHost = !!first?.me,
      n = Math.min(GROUP_MAX, q.length),
      online = host.online();
    const rows = q.length
      ? q
          .slice(0, 8)
          .map(
            (x, i) =>
              `<div class="qrow"><i style="background:${x.color}"></i><span>${esc(x.name)}</span>${i === 0 ? '<em>host</em>' : i >= GROUP_MAX ? '<em>next group</em>' : ''}</div>`,
          )
          .join('')
      : '<div class="muted">Nobody is waiting yet.</div>';
    // 1 · where: a picture card per course
    const where = `<h3 style="margin-top:0">Course</h3><div class="tlocs">${LOCALES.map(
      l =>
        `<button class="tloc${teeLoc === l.id ? ' on' : ''}" data-loc="${l.id}"><img src="${localePic(l.id)}" alt=""><b>${l.name}</b><small>${l.blurb}</small></button>`,
    ).join('')}</div>`;
    // 2 · what: one random hole (or one by its code), or a tournament
    const pick = teeFmt === 'one' ? teeHole : String(teeFmt),
      chip = (k: string, t: string) => `<button class="t${pick === k ? ' on' : ''}" data-play="${k}">${t}</button>`,
      holeInfo =
        teeHole === 'rand'
          ? 'A brand-new layout every round: par 3, 4 or 5, doglegs, water, bunkers. Every hole gets a code, so you can play a good one again.'
          : `<input id="t-code" maxlength="5" placeholder="Hole code, e.g. 4KQ2B" autocomplete="off" spellcheck="false"><br><span id="t-codeinfo"></span>`,
      fmt = `${where}<h3>Play</h3><div class="tg holes">${chip('rand', 'Random hole')}${chip('code', 'Hole code')}${chip('3', 'Mini cup · 3 holes')}${chip('9', 'Championship · 9 holes')}</div>`,
      course = teeFmt === 'one' ? `<p class="muted">${holeInfo}</p>` : cupPreview(teeFmt);
    const html = `${fmt}${course}
      <div class="btns"><button id="t-solo" class="primary">Play solo now</button></div>
      <h3>Group round</h3><p class="muted">${online ? 'Join the queue; the first player in line starts the round for up to 4 golfers. Players take turns (walk and drive any time; only hitting waits for your turn).' : 'Group rounds work on the published page.'}</p>
      ${online ? `<div class="queue">${rows}</div><div class="btns">${host.q() ? '<button id="t-leave">Leave the queue</button>' : '<button id="t-join">Join the queue</button>'}${amHost && n >= 2 ? `<button id="t-go" class="primary">Start the round (${n})</button>` : amHost ? '<span class="muted">Waiting for at least one more golfer…</span>' : ''}</div>${amHost ? `<label class="casual"><input type="checkbox" id="t-casual"${teeCasual ? ' checked' : ''}> Casual: everyone plays at once (no turns, no betting)</label>` : ''}` : ''}`;
    if (html === teeHTML) return;
    teeHTML = html;
    const body = document.getElementById('tee-body');
    if (!body) return;
    body.innerHTML = html;
    const b = (id: string) => document.getElementById(id);
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-loc]').forEach(
      x =>
        (x.onclick = () => {
          teeLoc = x.dataset.loc as LocaleId;
          renderTee();
        }),
    );
    document.querySelectorAll<HTMLButtonElement>('#tee-body button[data-play]').forEach(
      x =>
        (x.onclick = () => {
          const k = x.dataset.play!;
          if (k === 'rand' || k === 'code') {
            teeFmt = 'one';
            teeHole = k;
          } else teeFmt = +k as TourSize;
          renderTee();
        }),
    );
    if (b('t-reroll'))
      b('t-reroll')!.onclick = () => {
        tourSeed = randomTourSeed();
        renderTee();
      };
    const ci = b('t-code') as HTMLInputElement | null,
      showInfo = () => {
        const info = b('t-codeinfo');
        if (info) info.textContent = codeInfo || 'Enter the 5-character code from a scorecard.';
      };
    if (ci) {
      ci.value = teeCode;
      showInfo();
      ci.oninput = () => {
        teeCode = ci.value
          .toUpperCase()
          .replace(/[^0-9A-Z]/g, '')
          .slice(0, 5);
        codeInfo = describeCode(teeCode);
        showInfo();
      };
      ci.onkeydown = e => e.stopPropagation();
    }
    const okCode = () => teeFmt !== 'one' || teeHole !== 'code' || teeCode.length === 5;
    b('t-solo')!.onclick = () => {
      if (!okCode()) return host.toast('Enter a 5-character hole code first.');
      host.closeModal();
      host.setQ(0);
      go(teeMatchId(), false);
    };
    if (b('t-join'))
      b('t-join')!.onclick = () => {
        host.setQ(Date.now());
        renderTee();
      };
    const cb = b('t-casual') as HTMLInputElement | null;
    if (cb)
      cb.onchange = () => {
        teeCasual = cb.checked;
      };
    if (b('t-leave'))
      b('t-leave')!.onclick = () => {
        host.setQ(0);
        renderTee();
      };
    if (b('t-go'))
      b('t-go')!.onclick = () => {
        if (!okCode()) return host.toast('Enter a 5-character hole code first.');
        const members = queue()
            .slice(0, GROUP_MAX)
            .map(x => x.uid),
          id0 = teeMatchId(),
          id = teeCasual ? 'c' + id0.slice(0, 11) : id0; // 'c…' = casual: everyone plays at once
        host.setGo({ id, at: Date.now(), m: members });
        host.closeModal();
        setTimeout(() => go(id, true, members), 900);
      };
  }
  const newId = () =>
    Math.random()
      .toString(36)
      .slice(2, 9)
      .replace(/[^a-z0-9]/g, 'x');
  function go(id: string, group: boolean, order: string[] = [host.uid()]) {
    if (started === id) return;
    started = id;
    host.start(id, group, order);
  }
  const goSeen = new Map<string, number>();
  function checkGroupStart() {
    // somebody (the host) started a round that includes me
    if (!host.q() || !host.online()) return;
    /* freshness is judged by when WE first saw the start, never by the host's clock (clocks differ between machines) */
    for (const r of host.peers()) {
      const g = r.go;
      if (!g || typeof g !== 'object') continue;
      const gk = r.by + ':' + g.id;
      if (!goSeen.has(gk)) goSeen.set(gk, performance.now());
      if (performance.now() - goSeen.get(gk)! < 30000 && Array.isArray(g.m) && g.m.includes(host.uid())) {
        host.toast(`${esc(host.nameOf(r.by, 'The host'))} is starting the round…`, 1500);
        host.closeModal();
        go(
          String(g.id)
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 12),
          true,
          g.m.map((x: any) => String(x)).slice(0, 8),
        );
        return;
      }
    }
  }

  return {
    open: openTee,
    render: renderTee,
    checkGroupStart,
    trophyPic,
    isOpen: () => teeOpen,
    queue,
    closed() {
      teeOpen = false;
    },
    /** Back in the lobby: the same match id may be started again. */
    reset() {
      started = '';
    },
  };
}
